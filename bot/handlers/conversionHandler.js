const path = require('path');
const fs = require('fs').promises;
const { InputFile, InputMediaBuilder } = require('grammy');
const { convertVideoWithTimeout } = require('../converters/videoConverter');
const { convertAudioWithTimeout } = require('../converters/audioConverter');
const { convertImageWithTimeout } = require('../converters/imageConverter');
const { convertDocumentWithTimeout } = require('../converters/documentConverter');
const { incrementConversionCount, logConversion } = require('../services/database');
const { conversionQueue } = require('../services/conversionQueue');
const { deleteFile } = require('../services/cleanup');
const { qualitySelector } = require('../keyboards/qualitySelector');
const { isBatchMode, getBatchFiles, clearBatch } = require('./batchHandler');
const { t } = require('../i18n');

const handleFormatSelection = async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const targetFormat = callbackData.split(':')[1];
  const lang = 'ru';

  // Check if batch mode
  if (isBatchMode(ctx)) {
    const batchFiles = getBatchFiles(ctx);
    const firstFile = batchFiles[0];
    
    if (firstFile.group === 'video' || firstFile.group === 'image') {
      ctx.session.targetFormat = targetFormat;
      await ctx.editMessageText(t(lang, 'conversion.select_quality'), {
        reply_markup: qualitySelector(lang)
      });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.answerCallbackQuery();
      await performBatchConversion(ctx, batchFiles, targetFormat, 'medium');
    }
    return;
  }

  // Single file mode
  if (!ctx.session || !ctx.session.currentFile) {
    await ctx.answerCallbackQuery('Ошибка: файл не найден');
    return;
  }

  const fileInfo = ctx.session.currentFile;

  if (fileInfo.group === 'video' || fileInfo.group === 'image') {
    ctx.session.targetFormat = targetFormat;
    await ctx.editMessageText(t(lang, 'conversion.select_quality'), {
      reply_markup: qualitySelector(lang)
    });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.answerCallbackQuery();
    
    // Send initial status message
    const queueStatus = conversionQueue.getStatus();
    let statusText = t(lang, 'conversion.processing');
    if (queueStatus.queued > 0) {
      statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
    }
    const statusMsg = await ctx.reply(statusText);
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performConversion(ctx, fileInfo, targetFormat, 'medium', statusMsg.message_id);
    }).catch(async (error) => {
      console.error('Conversion error:', error);
      try {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, t(lang, 'conversion.error'));
      } catch {
        await ctx.reply(t(lang, 'conversion.error'));
      }
    });
  }
};

const handleQualitySelection = async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const quality = callbackData.split(':')[1];

  await ctx.answerCallbackQuery();

  // Check if batch mode
  if (isBatchMode(ctx)) {
    const batchFiles = getBatchFiles(ctx);
    const targetFormat = ctx.session.targetFormat;
    const lang = 'ru';
    
    if (!targetFormat) {
      await ctx.reply('Ошибка: формат не выбран');
      return;
    }
    
    // Send initial status message
    const queueStatus = conversionQueue.getStatus();
    let statusText = `⏳ Обрабатываю ${batchFiles.length} файлов...`;
    if (queueStatus.queued > 0) {
      statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
    }
    const statusMsg = await ctx.reply(statusText);
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performBatchConversion(ctx, batchFiles, targetFormat, quality, statusMsg.message_id);
    }).catch(async (error) => {
      console.error('Batch conversion error:', error);
      try {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '❌ Ошибка обработки пакета файлов');
      } catch {
        await ctx.reply('❌ Ошибка обработки пакета файлов');
      }
    });
    
    return;
  }

  // Single file mode
  if (!ctx.session || !ctx.session.currentFile || !ctx.session.targetFormat) {
    await ctx.reply('Ошибка: данные не найдены');
    return;
  }
  
  const fileInfo = ctx.session.currentFile;
  const targetFormat = ctx.session.targetFormat;
  const lang = 'ru';

  // Send initial status message
  const queueStatus = conversionQueue.getStatus();
  let statusText = t(lang, 'conversion.processing');
  if (queueStatus.queued > 0) {
    statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
  }
  const statusMsg = await ctx.reply(statusText);
  
  // Add to queue (non-blocking)
  conversionQueue.add(async () => {
    return await performConversion(ctx, fileInfo, targetFormat, quality, statusMsg.message_id);
  }).catch(async (error) => {
    console.error('Conversion error:', error);
    try {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, t(lang, 'conversion.error'));
    } catch {
      await ctx.reply(t(lang, 'conversion.error'));
    }
  });
};

const performConversion = async (ctx, fileInfo, targetFormat, quality, statusMessageId) => {
  const lang = 'ru';
  const userId = ctx.from.id;

  let currentProgress = 0;
  let lastUpdateTime = 0;
  
  // Progress callback for converters
  const updateProgress = async (percent) => {
    currentProgress = percent;
    const now = Date.now();
    
    // Update no more than once per 2 seconds to avoid API rate limits
    if (now - lastUpdateTime < 2000 && percent < 100) return;
    lastUpdateTime = now;
    
    const progressBar = '▓'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        `${t(lang, 'conversion.converting', { format: targetFormat.toUpperCase() })}\n${progressBar} ${percent}%`
      );
    } catch (err) {
      // Ignore "message not modified" errors
    }
  };

  // Update initial status message
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessageId,
      `${t(lang, 'conversion.converting', { format: targetFormat.toUpperCase() })}\n░░░░░░░░░░░░░░░░░░░░ 0%`
    );
  } catch (err) {
    console.error('Error editing status message:', err.message);
  }

  const inputExt = path.extname(fileInfo.path);
  const basePath = fileInfo.path.substring(0, fileInfo.path.length - inputExt.length);
  const outputPath = `${basePath}_converted.${targetFormat}`;

  try {
    let convertedPath;

    if (fileInfo.group === 'video') {
      convertedPath = await convertVideoWithTimeout(fileInfo.path, outputPath, targetFormat, quality, 300000, updateProgress);
    } else if (fileInfo.group === 'audio') {
      convertedPath = await convertAudioWithTimeout(fileInfo.path, outputPath, targetFormat, quality, 300000, updateProgress);
    } else if (fileInfo.group === 'image') {
      await updateProgress(50);
      convertedPath = await convertImageWithTimeout(fileInfo.path, outputPath, targetFormat, quality);
      await updateProgress(100);
    } else if (fileInfo.group === 'document') {
      await updateProgress(50);
      convertedPath = await convertDocumentWithTimeout(fileInfo.path, outputPath, targetFormat);
      await updateProgress(100);
    } else {
      throw new Error('Unsupported file group');
    }

    // Update status to completed
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        t(lang, 'conversion.completed')
      );
    } catch (err) {
      console.error('Error editing completion message:', err.message);
    }

    const convertedFile = new InputFile(convertedPath);
    
    // Check converted file size before sending
    const stats = await fs.stat(convertedPath);
    const convertedSizeMb = stats.size / (1024 * 1024);
    
    // Use higher limit if local Bot API Server is configured (2000 MB vs 50 MB)
    const maxUploadSizeMb = process.env.TELEGRAM_API_ROOT ? 2000 : 50;
    
    if (convertedSizeMb > maxUploadSizeMb) {
      const apiType = process.env.TELEGRAM_API_ROOT ? 'локального Bot API Server' : 'Telegram API';
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        `❌ Конвертированный файл слишком большой для отправки (${convertedSizeMb.toFixed(2)} МБ).\n\n⚠️ ${apiType} не поддерживает отправку файлов больше ${maxUploadSizeMb} МБ.\n\n💡 Попробуйте:\n• Выбрать другой формат\n• Уменьшить качество\n• Использовать более сжатый формат (например, MP3 вместо FLAC)`
      );
      
      await deleteFile(fileInfo.path);
      await deleteFile(convertedPath);
      
      delete ctx.session.currentFile;
      delete ctx.session.targetFormat;
      return;
    }
    
    await ctx.replyWithDocument(convertedFile);

    await incrementConversionCount(userId);
    await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb);

    await deleteFile(fileInfo.path);
    await deleteFile(convertedPath);

    delete ctx.session.currentFile;
    delete ctx.session.targetFormat;

  } catch (error) {
    console.error('Conversion error:', error);
    
    try {
      let errorMessage;
      
      if (error.error_code === 413 || error.message.includes('Request Entity Too Large')) {
        // Telegram API file size limit exceeded
        errorMessage = `❌ Конвертированный файл слишком большой для отправки.\n\n⚠️ Telegram не поддерживает отправку файлов больше 50 МБ.\n\n💡 Попробуйте:\n• Выбрать другой формат\n• Уменьшить качество\n• Использовать более сжатый формат`;
      } else if (error.message.includes('timeout')) {
        errorMessage = t(lang, 'conversion.timeout');
      } else {
        errorMessage = t(lang, 'conversion.error');
      }
      
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        errorMessage
      );
    } catch (err) {
      console.error('Error updating error message:', err.message);
    }

    await deleteFile(fileInfo.path);
    await deleteFile(outputPath);
    
    await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb, 'failed');
  }
};

const performBatchConversion = async (ctx, batchFiles, targetFormat, quality, statusMessageId) => {
  const lang = 'ru';
  const userId = ctx.from.id;
  
  const totalFiles = batchFiles.length;
  
  // Start progress timer
  const startTime = Date.now();
  const progressInterval = setInterval(async () => {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ ${completed}/${totalFiles} завершено\n⏱ ${elapsedSeconds} сек.`
      );
    } catch (err) {
      // Ignore "message not modified" errors
    }
  }, 5000);
  
  // Update status message
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessageId,
      `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ 0/${totalFiles} завершено`
    );
  } catch (err) {
    console.error('Error editing batch status message:', err.message);
  }

  const convertedFiles = [];
  const failedFiles = [];
  let completed = 0;

  // Convert files in parallel (but limit to 3 concurrent)
  const concurrencyLimit = 3;
  for (let i = 0; i < batchFiles.length; i += concurrencyLimit) {
    const batch = batchFiles.slice(i, i + concurrencyLimit);
    
    const conversionPromises = batch.map(async (fileInfo, batchIndex) => {
      const globalIndex = i + batchIndex;
      const outputPath = fileInfo.path.replace(
        path.extname(fileInfo.path),
        `_converted.${targetFormat}`
      );

      try {
        let convertedPath;

        if (fileInfo.group === 'video') {
          convertedPath = await convertVideoWithTimeout(fileInfo.path, outputPath, targetFormat, quality);
        } else if (fileInfo.group === 'audio') {
          convertedPath = await convertAudioWithTimeout(fileInfo.path, outputPath, targetFormat, quality);
        } else if (fileInfo.group === 'image') {
          convertedPath = await convertImageWithTimeout(fileInfo.path, outputPath, targetFormat, quality);
        } else if (fileInfo.group === 'document') {
          convertedPath = await convertDocumentWithTimeout(fileInfo.path, outputPath, targetFormat);
        }

        convertedFiles.push({
          path: convertedPath,
          original: fileInfo,
          index: globalIndex,
        });

        await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb, 'completed');

      } catch (error) {
        console.error(`Error converting file ${globalIndex}:`, error);
        failedFiles.push(globalIndex);
        await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb, 'failed');
      }

      completed++;
      
      // Update progress
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMessageId,
          `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ ${completed}/${totalFiles} завершено`
        );
      } catch (err) {
        console.error('Error updating batch progress:', err.message);
      }
    });

    await Promise.all(conversionPromises);
  }

  // Send results
  if (convertedFiles.length > 0) {
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        `✅ Готово! Конвертировано ${convertedFiles.length} из ${totalFiles} файлов`
      );

      // Try to send as media group if possible (photos/videos only, max 10)
      const canSendAsGroup = convertedFiles.length <= 10 && 
                             (batchFiles[0].group === 'image' || batchFiles[0].group === 'video');

      if (canSendAsGroup) {
        // Build media group
        const mediaGroup = convertedFiles.map(file => {
          if (file.original.group === 'image') {
            return InputMediaBuilder.photo(new InputFile(file.path));
          } else if (file.original.group === 'video') {
            return InputMediaBuilder.video(new InputFile(file.path));
          }
        });

        await ctx.replyWithMediaGroup(mediaGroup);
      } else {
        // Send individually
        for (const file of convertedFiles) {
          await ctx.replyWithDocument(new InputFile(file.path));
        }
      }

      // Update conversion count
      await incrementConversionCount(userId);

    } catch (error) {
      console.error('Error sending converted files:', error);
      await ctx.reply('❌ Ошибка при отправке файлов');
    }
  }

  if (failedFiles.length > 0) {
    await ctx.reply(`⚠️ Не удалось конвертировать ${failedFiles.length} файлов`);
  }

  // Cleanup
  for (const fileInfo of batchFiles) {
    await deleteFile(fileInfo.path);
  }
  for (const file of convertedFiles) {
    await deleteFile(file.path);
  }

  // Clear batch session
  clearBatch(ctx);
  delete ctx.session.targetFormat;
};

module.exports = { handleFormatSelection, handleQualitySelection };
