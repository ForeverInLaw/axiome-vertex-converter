const { handleFile } = require('./fileHandler');
const { formatSelector, getFormatGroup } = require('../keyboards/formatSelector');
const { qualitySelector } = require('../keyboards/qualitySelector');
const { t } = require('../i18n');

// Store for collecting media groups
// Structure: { media_group_id: { files: [], timeout: timeoutId, ctx: firstCtx } }
const mediaGroups = new Map();

// Timeout for media group completion (1 second after last file)
const MEDIA_GROUP_TIMEOUT = 1000;

/**
 * Handle incoming file that might be part of a media group
 * @param {Context} ctx - Grammy context
 * @param {Object} file - File object from message
 * @param {Bot} bot - Bot instance for accessing bot.api with proper apiRoot
 */
const handlePotentialBatch = async (ctx, file, bot) => {
  const mediaGroupId = ctx.message?.media_group_id;
  
  // Single file (not part of a group)
  if (!mediaGroupId) {
    await handleFile(ctx, file, bot);
    return;
  }
  
  // Part of a media group - collect files
  if (!mediaGroups.has(mediaGroupId)) {
    mediaGroups.set(mediaGroupId, {
      files: [],
      ctx: ctx, // Store first context
      userId: ctx.from.id,
      bot: bot, // Store bot instance for file downloads
    });
  }
  
  const group = mediaGroups.get(mediaGroupId);
  group.files.push({
    file: file,
    messageId: ctx.message.message_id,
    type: getFileType(file),
  });
  
  // Clear previous timeout
  if (group.timeout) {
    clearTimeout(group.timeout);
  }
  
  // Set new timeout - if no more files arrive in 1 sec, process the group
  group.timeout = setTimeout(async () => {
    try {
      await processBatch(mediaGroupId);
    } finally {
      // Always delete from map, even if processing fails
      mediaGroups.delete(mediaGroupId);
      console.log(`Cleared media group ${mediaGroupId} from memory`);
    }
  }, MEDIA_GROUP_TIMEOUT);
};

/**
 * Determine file type from file object
 */
const getFileType = (file) => {
  if (file.width && file.height && !file.duration) return 'photo';
  if (file.duration && file.width) return 'video';
  if (file.duration && !file.width) return 'audio';
  if (file.mime_type) return 'document';
  return 'unknown';
};

/**
 * Process collected batch of files
 */
const processBatch = async (mediaGroupId) => {
  const group = mediaGroups.get(mediaGroupId);
  if (!group || group.files.length === 0) {
    console.log(`Media group ${mediaGroupId} is empty or not found, skipping`);
    return;
  }
  
  const { files, ctx, userId, bot } = group;
  const lang = 'ru';
  
  console.log(`Processing batch of ${files.length} files for media group ${mediaGroupId}`);
  console.log(`File message IDs: ${files.map(f => f.messageId).join(', ')}`);
  
  try {
    // Download all files in parallel
    const downloadPromises = files.map(async (fileData, index) => {
      const { getUserTempDir, sanitizeFilename } = require('./fileHandler');
      const fileTypeModule = await import('file-type');
      const { fileTypeFromFile } = fileTypeModule;
      const path = require('path');
      
      const userDir = await getUserTempDir(userId);
      const timestamp = Date.now();
      
      // Get extension from original filename or use default
      const originalName = fileData.file.file_name || `file_${index}`;
      const ext = path.extname(originalName) || '.tmp';
      // Include media_group_id to avoid conflicts when multiple groups processed simultaneously
      const fileName = sanitizeFilename(`batch_${mediaGroupId}_${index}_${timestamp}${ext}`);
      const tempPath = path.join(userDir, fileName);
      
      // Download file using bot.api to ensure local Bot API Server is used
      const fileObj = await bot.api.getFile(fileData.file.file_id);
      await fileObj.download(tempPath);
      
      // Validate file type
      let fileType = await fileTypeFromFile(tempPath);
      
      // Fallback to extension from filename for plain text files (txt, md, etc)
      if (!fileType && originalName) {
        const extMatch = path.extname(originalName).toLowerCase();
        if (extMatch) {
          fileType = { ext: extMatch.replace('.', ''), mime: 'application/octet-stream' };
        }
      }
      
      if (!fileType) {
        throw new Error(`Invalid file type for file ${index}`);
      }
      
      // Rename file with correct extension if it was .tmp
      let finalPath = tempPath;
      if (ext === '.tmp' && fileType.ext) {
        const fs = require('fs').promises;
        finalPath = tempPath.replace('.tmp', `.${fileType.ext}`);
        await fs.rename(tempPath, finalPath);
      }
      
      // Determine group by actual file format, not Telegram type
      const fileGroup = getFormatGroup(fileType.ext) || 'document';
      
      return {
        path: finalPath,
        format: fileType.ext,
        group: fileGroup,
        sizeMb: fileData.file.file_size / (1024 * 1024),
        originalType: fileData.type,
      };
    });
    
    const downloadedFiles = await Promise.all(downloadPromises);
    
    // Check all files are the same type (for consistent conversion)
    const fileGroups = downloadedFiles.map(f => f.group);
    const uniqueGroups = [...new Set(fileGroups)];
    
    if (uniqueGroups.length > 1) {
      await ctx.reply(`⚠️ Файлы разных типов (${uniqueGroups.join(', ')}). Обработка по отдельности...`);
      // Process individually - store each file by message ID
      ctx.session = ctx.session || {};
      ctx.session.pendingFiles = ctx.session.pendingFiles || {};
      
      for (const fileData of downloadedFiles) {
        const keyboard = formatSelector(fileData.format);
        const msg = await ctx.reply(t(lang, 'conversion.select_format'), { reply_markup: keyboard });
        // Store file data by message ID for later retrieval
        ctx.session.pendingFiles[msg.message_id] = fileData;
      }
      return;
    }
    
    // All files are same type - batch processing
    const firstFile = downloadedFiles[0];
    
    await ctx.reply(`📦 Получено ${files.length} файлов. Выберите формат для конвертации всех:`);
    
    // Store batch in session by message ID (to support multiple batches)
    ctx.session = ctx.session || {};
    ctx.session.pendingBatches = ctx.session.pendingBatches || {};
    
    const keyboard = formatSelector(firstFile.format);
    const msg = await ctx.reply(t(lang, 'conversion.select_format'), { reply_markup: keyboard });
    
    // Store batch files by message ID
    ctx.session.pendingBatches[msg.message_id] = {
      files: downloadedFiles,
      mediaGroupId: mediaGroupId,
    };
    
  } catch (error) {
    console.error('Error processing batch:', error);
    await ctx.reply(t(lang, 'conversion.error'));
  }
};

/**
 * Check if current conversion is batch mode by message ID
 */
const isBatchMode = (ctx, messageId) => {
  if (!messageId || !ctx.session?.pendingBatches) return false;
  return ctx.session.pendingBatches[messageId] !== undefined;
};

/**
 * Get batch files from session by message ID
 */
const getBatchFiles = (ctx, messageId) => {
  if (!messageId || !ctx.session?.pendingBatches) return null;
  return ctx.session.pendingBatches[messageId]?.files || null;
};

/**
 * Clear batch from session by message ID
 */
const clearBatch = (ctx, messageId) => {
  if (ctx.session?.pendingBatches && messageId) {
    delete ctx.session.pendingBatches[messageId];
  }
};

module.exports = {
  handlePotentialBatch,
  processBatch,
  isBatchMode,
  getBatchFiles,
  clearBatch,
};
