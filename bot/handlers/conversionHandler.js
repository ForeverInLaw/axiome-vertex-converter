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
    
    // Send status immediately and add to queue without blocking
    const statusMsg = await ctx.reply(t(lang, 'conversion.processing'));
    const queueStatus = conversionQueue.getStatus();
    if (queueStatus.queued > 0) {
      await ctx.reply(`⏳ В очереди: ${queueStatus.queued} задач. Ваш файл будет обработан.`);
    }
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performConversion(ctx, fileInfo, targetFormat, 'medium');
    }).catch(async (error) => {
      console.error('Conversion error:', error);
      await ctx.reply(t(lang, 'conversion.error'));
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
    
    // Send status immediately
    await ctx.reply(`⏳ Обрабатываю ${batchFiles.length} файлов...`);
    const queueStatus = conversionQueue.getStatus();
    if (queueStatus.queued > 0) {
      await ctx.reply(`⏳ В очереди: ${queueStatus.queued} задач. Ваши файлы будут обработаны.`);
    }
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performBatchConversion(ctx, batchFiles, targetFormat, quality);
    }).catch(async (error) => {
      console.error('Batch conversion error:', error);
      await ctx.reply('❌ Ошибка обработки пакета файлов');
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

  // Send status immediately and add to queue without blocking
  const statusMsg = await ctx.reply(t(lang, 'conversion.processing'));
  const queueStatus = conversionQueue.getStatus();
  if (queueStatus.queued > 0) {
    await ctx.reply(`⏳ В очереди: ${queueStatus.queued} задач. Ваш файл будет обработан.`);
  }
  
  // Add to queue (non-blocking)
  conversionQueue.add(async () => {
    return await performConversion(ctx, fileInfo, targetFormat, quality);
  }).catch(async (error) => {
    console.error('Conversion error:', error);
    await ctx.reply(t(lang, 'conversion.error'));
  });
};

const performConversion = async (ctx, fileInfo, targetFormat, quality) => {
  const lang = 'ru';
  const userId = ctx.from.id;

  let progressMessage;
  try {
    progressMessage = await ctx.editMessageText(
      t(lang, 'conversion.converting', { format: targetFormat.toUpperCase() })
    );
  } catch {
    progressMessage = await ctx.reply(
      t(lang, 'conversion.converting', { format: targetFormat.toUpperCase() })
    );
  }

  const inputExt = path.extname(fileInfo.path);
  const basePath = fileInfo.path.substring(0, fileInfo.path.length - inputExt.length);
  const outputPath = `${basePath}_converted.${targetFormat}`;

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
    } else {
      throw new Error('Unsupported file group');
    }

    await ctx.api.editMessageText(
      ctx.chat.id,
      progressMessage.message_id,
      t(lang, 'conversion.completed')
    );

    const convertedFile = new InputFile(convertedPath);
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
      if (error.message.includes('timeout')) {
        await ctx.api.editMessageText(
          ctx.chat.id,
          progressMessage.message_id,
          t(lang, 'conversion.timeout')
        );
      } else {
        await ctx.api.editMessageText(
          ctx.chat.id,
          progressMessage.message_id,
          t(lang, 'conversion.error')
        );
      }
    } catch {}

    await deleteFile(fileInfo.path);
    await deleteFile(outputPath);
    
    await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb, 'failed');
  }
};

const performBatchConversion = async (ctx, batchFiles, targetFormat, quality) => {
  const lang = 'ru';
  const userId = ctx.from.id;
  
  const totalFiles = batchFiles.length;
  let progressMessage;
  
  try {
    progressMessage = await ctx.editMessageText(
      `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ 0/${totalFiles} завершено`
    );
  } catch {
    progressMessage = await ctx.reply(
      `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ 0/${totalFiles} завершено`
    );
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
          progressMessage.message_id,
          `🔄 Конвертирую ${totalFiles} файлов в ${targetFormat.toUpperCase()}...\n⏳ ${completed}/${totalFiles} завершено`
        );
      } catch {}
    });

    await Promise.all(conversionPromises);
  }

  // Send results
  if (convertedFiles.length > 0) {
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        progressMessage.message_id,
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
