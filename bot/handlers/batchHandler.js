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
    await processBatch(mediaGroupId);
    mediaGroups.delete(mediaGroupId);
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
  if (!group || group.files.length === 0) return;
  
  const { files, ctx, userId, bot } = group;
  const lang = 'ru';
  
  console.log(`Processing batch of ${files.length} files for media group ${mediaGroupId}`);
  
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
      const fileName = sanitizeFilename(`batch_${index}_${timestamp}${ext}`);
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
      
      // Determine group by actual file format, not Telegram type
      const fileGroup = getFormatGroup(fileType.ext) || 'document';
      
      return {
        path: tempPath,
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
      // Process individually
      for (const fileData of downloadedFiles) {
        ctx.session = ctx.session || {};
        ctx.session.currentFile = fileData;
        const keyboard = formatSelector(fileData.format);
        await ctx.reply(t(lang, 'conversion.select_format'), { reply_markup: keyboard });
      }
      return;
    }
    
    // All files are same type - batch processing
    const firstFile = downloadedFiles[0];
    
    await ctx.reply(`📦 Получено ${files.length} файлов. Выберите формат для конвертации всех:`);
    
    // Store batch in session
    ctx.session = ctx.session || {};
    ctx.session.batchFiles = downloadedFiles;
    ctx.session.batchMode = true;
    
    const keyboard = formatSelector(firstFile.format);
    await ctx.reply(t(lang, 'conversion.select_format'), { reply_markup: keyboard });
    
  } catch (error) {
    console.error('Error processing batch:', error);
    await ctx.reply(t(lang, 'conversion.error'));
  }
};

/**
 * Check if current conversion is batch mode
 */
const isBatchMode = (ctx) => {
  return ctx.session?.batchMode === true && ctx.session?.batchFiles?.length > 0;
};

/**
 * Get batch files from session
 */
const getBatchFiles = (ctx) => {
  return ctx.session?.batchFiles || [];
};

/**
 * Clear batch from session
 */
const clearBatch = (ctx) => {
  if (ctx.session) {
    delete ctx.session.batchFiles;
    delete ctx.session.batchMode;
  }
};

module.exports = {
  handlePotentialBatch,
  processBatch,
  isBatchMode,
  getBatchFiles,
  clearBatch,
};
