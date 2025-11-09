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

const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const getUserTempDir = async (userId) => {
  await ensureTempDir();
  const userDir = path.join(TEMP_DIR, `user_${userId}`);
  try {
    await fs.access(userDir);
  } catch {
    await fs.mkdir(userDir, { mode: 0o700 });
  }
  return userDir;
};

const validateFileType = async (filePath, expectedGroup) => {
  const fileType = await fileTypeFromFile(filePath);
  
  if (!fileType) {
    return null;
  }

  const mimeType = fileType.mime;
  const ext = fileType.ext;

  const ALLOWED_TYPES = {
    video: ['video/mp4', 'video/x-msvideo', 'video/x-matroska', 'video/quicktime', 'video/webm', 'video/x-flv'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/x-m4a'],
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'],
    document: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };

  for (const [group, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) {
      return { group, format: ext, mimeType };
    }
  }

  return null;
};

const handleFile = async (ctx, file) => {
  const userId = ctx.from.id;
  const lang = 'ru';

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

    // Download file using Grammy API (secure, no token exposure)
    await ctx.api.downloadFile(file.file_id, tempPath);

    const fileType = await validateFileType(tempPath);

    if (!fileType) {
      await fs.unlink(tempPath);
      await ctx.reply(t(lang, 'errors.invalid_file'));
      return;
    }

    console.log(`File validated: ${fileType.format} (${fileType.group})`);

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
      const maxSize = error.message.match(/\d+/)[0];
      await ctx.reply(t(lang, 'errors.file_too_large', { max: maxSize }));
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
