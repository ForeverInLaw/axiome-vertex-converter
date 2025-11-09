const fs = require('fs').promises;
const path = require('path');
const { checkLimits } = require('../services/limiter');
const { ensureDiskSpace } = require('../services/diskMonitor');
const { formatSelector, getFormatGroup } = require('../keyboards/formatSelector');
const { t } = require('../i18n');

// file-type v19+ requires ESM, use dynamic import
let fileTypeFromFile;
(async () => {
  const fileType = await import('file-type');
  fileTypeFromFile = fileType.fileTypeFromFile;
})();

const TEMP_DIR = path.join(__dirname, '..', 'temp');

const ensureTempDir = async () => {
  try {
    await fs.access(TEMP_DIR);
  } catch {
    await fs.mkdir(TEMP_DIR, { recursive: true, mode: 0o700 });
  }
};

const transliterate = (text) => {
  const cyrillic = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('');
  const latin = ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya','A','B','V','G','D','E','Yo','Zh','Z','I','Y','K','L','M','N','O','P','R','S','T','U','F','H','Ts','Ch','Sh','Sch','','Y','','E','Yu','Ya'];
  
  const map = {};
  cyrillic.forEach((char, i) => {
    map[char] = latin[i];
  });
  
  return text.split('').map(char => char in map ? map[char] : char).join('');
};

const sanitizeFilename = (filename) => {
  // Remove extension first
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);
  
  // Transliterate Cyrillic to Latin
  const transliterated = transliterate(nameWithoutExt);
  
  // Remove special characters, keep alphanumeric, dots, dashes, underscores
  const cleaned = transliterated.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Remove multiple consecutive underscores
  const normalized = cleaned.replace(/_+/g, '_').replace(/^_|_$/g, '');
  
  // If nothing left after cleaning, use 'file'
  const safeName = normalized || 'file';
  
  return safeName + ext;
};

const getUserTempDir = async (userId) => {
  await ensureTempDir();
  const userDir = path.join(TEMP_DIR, `user_${userId}`);
  try {
    await fs.mkdir(userDir, { recursive: true, mode: 0o700 });
  } catch (error) {
    // Ignore EEXIST error - directory already exists
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  return userDir;
};

const validateFileType = async (filePath, expectedGroup) => {
  // Check file extension first as fallback
  const fileExt = path.extname(filePath).toLowerCase().substring(1);
  
  const fileType = await fileTypeFromFile(filePath);
  
  // If file-type can't detect, use extension as fallback
  if (!fileType) {
    console.log(`⚠️  file-type library couldn't detect type`);
    console.log(`   Trying extension-based fallback: .${fileExt}`);
    
    // Extension-based fallback
    const EXT_TO_GROUP = {
      // Video
      mp4: { group: 'video', format: 'mp4', mimeType: 'video/mp4' },
      avi: { group: 'video', format: 'avi', mimeType: 'video/x-msvideo' },
      mkv: { group: 'video', format: 'mkv', mimeType: 'video/x-matroska' },
      mov: { group: 'video', format: 'mov', mimeType: 'video/quicktime' },
      webm: { group: 'video', format: 'webm', mimeType: 'video/webm' },
      flv: { group: 'video', format: 'flv', mimeType: 'video/x-flv' },
      wmv: { group: 'video', format: 'wmv', mimeType: 'video/x-ms-wmv' },
      // Audio
      mp3: { group: 'audio', format: 'mp3', mimeType: 'audio/mpeg' },
      wav: { group: 'audio', format: 'wav', mimeType: 'audio/wav' },
      flac: { group: 'audio', format: 'flac', mimeType: 'audio/flac' },
      aac: { group: 'audio', format: 'aac', mimeType: 'audio/aac' },
      ogg: { group: 'audio', format: 'ogg', mimeType: 'audio/ogg' },
      m4a: { group: 'audio', format: 'm4a', mimeType: 'audio/x-m4a' },
      // Image
      jpg: { group: 'image', format: 'jpg', mimeType: 'image/jpeg' },
      jpeg: { group: 'image', format: 'jpeg', mimeType: 'image/jpeg' },
      png: { group: 'image', format: 'png', mimeType: 'image/png' },
      webp: { group: 'image', format: 'webp', mimeType: 'image/webp' },
      gif: { group: 'image', format: 'gif', mimeType: 'image/gif' },
      tiff: { group: 'image', format: 'tiff', mimeType: 'image/tiff' },
      tif: { group: 'image', format: 'tif', mimeType: 'image/tiff' },
      // Document
      pdf: { group: 'document', format: 'pdf', mimeType: 'application/pdf' },
      txt: { group: 'document', format: 'txt', mimeType: 'text/plain' },
      md: { group: 'document', format: 'md', mimeType: 'text/plain' },
      docx: { group: 'document', format: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    };
    
    if (EXT_TO_GROUP[fileExt]) {
      console.log(`✅ Fallback successful: detected as ${EXT_TO_GROUP[fileExt].group} (${EXT_TO_GROUP[fileExt].format})`);
      return EXT_TO_GROUP[fileExt];
    }
    
    console.log(`❌ Extension .${fileExt} not found in fallback mapping`);
    return null;
  }

  console.log(`✅ file-type detected: ${fileType.mime} (.${fileType.ext})`);
  
  const mimeType = fileType.mime;
  const ext = fileType.ext;

  const ALLOWED_TYPES = {
    video: ['video/mp4', 'video/x-msvideo', 'video/vnd.avi', 'video/x-matroska', 'video/quicktime', 'video/webm', 'video/x-flv', 'video/avi'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/x-m4a'],
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'],
    document: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };

  for (const [group, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) {
      return { group, format: ext, mimeType };
    }
  }

  return null;
};

/**
 * Handle file upload, validation, and conversion process
 * @param {Context} ctx - Grammy context
 * @param {Object} file - File object from message (document, video, audio, or photo)
 * @param {Bot} bot - Bot instance for accessing bot.api with proper apiRoot
 */
const handleFile = async (ctx, file, bot) => {
  const userId = ctx.from.id;
  const lang = 'ru';

  console.log(`📥 Received file from user ${userId}:`);
  console.log(`   Name: ${file.file_name}`);
  console.log(`   Size: ${(file.file_size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   Telegram mime_type: ${file.mime_type}`);

  try {
    const fileSize = file.file_size;
    const fileSizeMb = fileSize / (1024 * 1024);

    // Check user limits
    await checkLimits(userId, fileSizeMb);
    
    // Check disk space (need at least 2x file size for conversion)
    const requiredSpaceGB = (fileSizeMb / 1024) * 2 + 1; // file + converted + 1GB buffer
    await ensureDiskSpace(requiredSpaceGB);

    const userDir = await getUserTempDir(userId);
    const timestamp = Date.now();
    const fileName = sanitizeFilename(file.file_name || `file_${timestamp}`);
    const tempPath = path.join(userDir, `${timestamp}_${fileName}`);

    await ctx.reply(t(lang, 'conversion.processing'));

    // Download file bypassing grammY to use local Bot API Server directly
    console.log(`💾 Downloading file to: ${tempPath}`);
    
    const apiRoot = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    console.log(`📥 Using API: ${apiRoot}`);
    
    // Step 1: Call getFile API directly to get file_path
    // Use native fetch (Node.js 18+)
    const getFileUrl = `${apiRoot}/bot${token}/getFile`;
    const getFileResponse = await fetch(getFileUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: file.file_id })
    });
    
    if (!getFileResponse.ok) {
      const errorText = await getFileResponse.text();
      throw new Error(`getFile failed: ${getFileResponse.status} ${errorText}`);
    }
    
    const getFileResult = await getFileResponse.json();
    if (!getFileResult.ok) {
      throw new Error(`getFile API error: ${getFileResult.description}`);
    }
    
    const filePath = getFileResult.result.file_path;
    console.log(`📄 Got file_path: ${filePath}`);
    
    // Step 2: Download/copy file
    // For local Bot API Server, file_path is absolute path on shared volume
    if (apiRoot.includes('telegram-bot-api')) {
      // Local Bot API Server - read file directly from shared volume
      console.log(`📂 Local API: copying file from shared volume`);
      console.log(`   Source: ${filePath}`);
      console.log(`   Destination: ${tempPath}`);
      
      // Check if file exists on shared volume
      const fs = require('fs').promises;
      try {
        await fs.access(filePath);
        await fs.copyFile(filePath, tempPath);
        console.log(`✅ File copied successfully from shared volume`);
      } catch (error) {
        throw new Error(`Failed to copy file from shared volume: ${error.message}`);
      }
    } else {
      // Standard Telegram API - download via HTTP
      const downloadUrl = `${apiRoot}/file/bot${token}/${filePath}`;
      console.log(`⬇️ Downloading from: ${downloadUrl.substring(0, 70)}...`);
      
      const downloadResponse = await fetch(downloadUrl);
      
      if (!downloadResponse.ok) {
        throw new Error(`File download failed: ${downloadResponse.status} ${downloadResponse.statusText}`);
      }
      
      // Save file to disk
      const fileStream = require('fs').createWriteStream(tempPath);
      await new Promise((resolve, reject) => {
        downloadResponse.body.pipe(fileStream);
        downloadResponse.body.on('error', reject);
        fileStream.on('finish', resolve);
      });
      console.log(`✅ File downloaded successfully`);
    }
    
    console.log(`✅ File downloaded successfully`);

    console.log(`🔍 Validating file type...`);
    const fileType = await validateFileType(tempPath);

    if (!fileType) {
      console.log(`❌ File validation failed - unsupported file type`);
      await fs.unlink(tempPath);
      await ctx.reply(t(lang, 'errors.invalid_file'));
      return;
    }

    console.log(`✅ File validated: ${fileType.format} (${fileType.group})`);
    console.log(`   Detected mime: ${fileType.mimeType}`);

    ctx.session = ctx.session || {};
    ctx.session.currentFile = {
      path: tempPath,
      format: fileType.format,
      group: fileType.group,
      sizeMb: fileSizeMb
    };

    const keyboard = formatSelector(fileType.format);
    
    if (!keyboard) {
      await fs.unlink(tempPath);
      await ctx.reply(t(lang, 'conversion.unsupported'));
      return;
    }

    await ctx.reply(t(lang, 'conversion.select_format'), {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Error handling file:', error);
    
    if (error.code === 'FILE_TOO_LARGE') {
      // Use detailed error message from limiter
      await ctx.reply(error.message);
    } else if (error.code === 'DAILY_LIMIT_EXCEEDED') {
      await ctx.reply(t(lang, 'errors.daily_limit'));
    } else if (error.code === 'INSUFFICIENT_DISK_SPACE') {
      await ctx.reply('⚠️ На сервере недостаточно места. Попробуйте позже или отправьте файл поменьше.');
    } else {
      await ctx.reply(t(lang, 'conversion.error'));
    }
  }
};

module.exports = { handleFile, getUserTempDir, sanitizeFilename };
