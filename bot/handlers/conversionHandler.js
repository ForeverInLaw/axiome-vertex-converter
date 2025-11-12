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
  
  const messageId = ctx.callbackQuery.message.message_id;

  // Check if batch mode
  if (isBatchMode(ctx, messageId)) {
    const batchFiles = getBatchFiles(ctx, messageId);
    if (!batchFiles) {
      await ctx.answerCallbackQuery('Ошибка: batch файлы не найдены');
      return;
    }
    const firstFile = batchFiles[0];
    
    if (firstFile.group === 'video' || firstFile.group === 'image' || firstFile.group === 'audio') {
      // Store target format with message ID
      ctx.session.pendingBatches[messageId].targetFormat = targetFormat;
      
      await ctx.editMessageText(t(lang, 'conversion.select_quality'), {
        reply_markup: qualitySelector(lang, firstFile.group)
      });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.answerCallbackQuery();
      
      // Clone batchFiles to prevent race conditions with multiple groups
      const batchFilesCopy = batchFiles.map(f => ({ ...f }));
      
      // Clear batch immediately to allow next group to start
      clearBatch(ctx, messageId);
      
      // Send initial status message
      const queueStatus = conversionQueue.getStatus();
      let statusText = `⏳ Обрабатываю ${batchFilesCopy.length} файлов...`;
      if (queueStatus.queued > 0) {
        statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
      }
      const statusMsg = await ctx.reply(statusText);
      
      // Add to queue (non-blocking)
      conversionQueue.add(async () => {
        return await performBatchConversion(ctx, batchFilesCopy, targetFormat, 'medium', statusMsg.message_id);
      }).catch(async (error) => {
        console.error('Batch conversion error:', error);
        try {
          await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '❌ Ошибка обработки пакета файлов');
        } catch {
          await ctx.reply('❌ Ошибка обработки пакета файлов');
        }
      });
    }
    return;
  }

  // Single file mode
  // Check if file is in pendingFiles by message ID (for mixed media groups)
  let fileInfo = ctx.session?.pendingFiles?.[messageId] || ctx.session?.currentFile;
  
  if (!fileInfo) {
    await ctx.answerCallbackQuery('Ошибка: файл не найден');
    return;
  }

  if (fileInfo.group === 'video' || fileInfo.group === 'image' || fileInfo.group === 'audio') {
    // Store target format and file for quality selection
    ctx.session = ctx.session || {};
    ctx.session.pendingConversions = ctx.session.pendingConversions || {};
    ctx.session.pendingConversions[messageId] = { fileInfo, targetFormat };
    
    await ctx.editMessageText(t(lang, 'conversion.select_quality'), {
      reply_markup: qualitySelector(lang, fileInfo.group)
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
    
    // Clone fileInfo to prevent race conditions
    const fileInfoCopy = { ...fileInfo };
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performConversion(ctx, fileInfoCopy, targetFormat, 'medium', statusMsg.message_id, messageId);
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
  
  const messageId = ctx.callbackQuery.message.message_id;

  // Check if batch mode
  if (isBatchMode(ctx, messageId)) {
    const batchFiles = getBatchFiles(ctx, messageId);
    if (!batchFiles) {
      await ctx.reply('Ошибка: batch файлы не найдены');
      return;
    }
    
    const targetFormat = ctx.session.pendingBatches[messageId]?.targetFormat;
    const lang = 'ru';
    
    if (!targetFormat) {
      await ctx.reply('Ошибка: формат не выбран');
      return;
    }
    
    // Clone batchFiles to prevent race conditions with multiple groups
    const batchFilesCopy = batchFiles.map(f => ({ ...f }));
    
    // Clear batch immediately to allow next group to start
    clearBatch(ctx, messageId);
    
    // Send initial status message
    const queueStatus = conversionQueue.getStatus();
    let statusText = `⏳ Обрабатываю ${batchFilesCopy.length} файлов...`;
    if (queueStatus.queued > 0) {
      statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
    }
    const statusMsg = await ctx.reply(statusText);
    
    // Add to queue (non-blocking)
    conversionQueue.add(async () => {
      return await performBatchConversion(ctx, batchFilesCopy, targetFormat, quality, statusMsg.message_id);
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
  // Check if conversion is in pendingConversions (for mixed media groups)
  const pendingConversion = ctx.session?.pendingConversions?.[messageId];
  
  let fileInfo, targetFormat;
  
  if (pendingConversion) {
    // Use pending conversion data
    fileInfo = pendingConversion.fileInfo;
    targetFormat = pendingConversion.targetFormat;
  } else if (ctx.session?.currentFile && ctx.session?.targetFormat) {
    // Fallback to legacy session data
    fileInfo = ctx.session.currentFile;
    targetFormat = ctx.session.targetFormat;
  } else {
    await ctx.reply('Ошибка: данные не найдены');
    return;
  }
  
  const lang = 'ru';

  // Send initial status message
  const queueStatus = conversionQueue.getStatus();
  let statusText = t(lang, 'conversion.processing');
  if (queueStatus.queued > 0) {
    statusText += `\n⏳ В очереди: ${queueStatus.queued} задач`;
  }
  const statusMsg = await ctx.reply(statusText);
  
  // Clone fileInfo to prevent race conditions
  const fileInfoCopy = { ...fileInfo };
  
  // Add to queue (non-blocking)
  conversionQueue.add(async () => {
    return await performConversion(ctx, fileInfoCopy, targetFormat, quality, statusMsg.message_id, messageId);
  }).catch(async (error) => {
    console.error('Conversion error:', error);
    try {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, t(lang, 'conversion.error'));
    } catch {
      await ctx.reply(t(lang, 'conversion.error'));
    }
  });
};

const performConversion = async (ctx, fileInfo, targetFormat, quality, statusMessageId, messageId = null) => {
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
      
      // Cleanup session data
      if (messageId) {
        if (ctx.session.pendingFiles) delete ctx.session.pendingFiles[messageId];
        if (ctx.session.pendingConversions) delete ctx.session.pendingConversions[messageId];
      }
      if (ctx.session.currentFile) delete ctx.session.currentFile;
      if (ctx.session.targetFormat) delete ctx.session.targetFormat;
      return;
    }
    
    await ctx.replyWithDocument(convertedFile);

    await incrementConversionCount(userId);
    await logConversion(userId, fileInfo.format, targetFormat, fileInfo.sizeMb);

    await deleteFile(fileInfo.path);
    await deleteFile(convertedPath);

    // Cleanup session data
    if (messageId) {
      if (ctx.session.pendingFiles) delete ctx.session.pendingFiles[messageId];
      if (ctx.session.pendingConversions) delete ctx.session.pendingConversions[messageId];
    }
    if (ctx.session.currentFile) delete ctx.session.currentFile;
    if (ctx.session.targetFormat) delete ctx.session.targetFormat;

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
    
    // Cleanup session data
    if (messageId) {
      if (ctx.session.pendingFiles) delete ctx.session.pendingFiles[messageId];
      if (ctx.session.pendingConversions) delete ctx.session.pendingConversions[messageId];
    }
    if (ctx.session.currentFile) delete ctx.session.currentFile;
    if (ctx.session.targetFormat) delete ctx.session.targetFormat;
  }
};

/**
 * Retry function for Telegram API calls with rate limit handling
 */
const retryWithDelay = async (fn, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.error_code === 429 && attempt < maxRetries) {
        const retryAfter = error.parameters?.retry_after || 3;
        console.log(`Rate limited (429). Retrying after ${retryAfter} seconds... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      } else {
        throw error;
      }
    }
  }
};

const performBatchConversion = async (ctx, batchFiles, targetFormat, quality, statusMessageId) => {
  const lang = 'ru';
  const userId = ctx.from.id;
  
  const totalFiles = batchFiles.length;
  
  console.log(`Starting batch conversion: ${totalFiles} files to ${targetFormat.toUpperCase()} (quality: ${quality})`);
  console.log(`File paths: ${batchFiles.map(f => path.basename(f.path)).join(', ')}`);
  
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
  // For documents, use sequential processing (LibreOffice can't run in parallel)
  const concurrencyLimit = batchFiles[0].group === 'document' ? 1 : 3;
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

        // Validate converted file exists and is not empty
        try {
          const stats = await fs.stat(convertedPath);
          if (stats.size === 0) {
            throw new Error(`Converted file is empty: ${convertedPath}`);
          }
        } catch (statError) {
          throw new Error(`Converted file validation failed: ${statError.message}`);
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
      // Small delay to reduce rate limit issues when multiple batches processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to send as media group if possible (photos/videos only, max 10)
      const canSendAsGroup = convertedFiles.length <= 10 && 
                             (batchFiles[0].group === 'image' || batchFiles[0].group === 'video');

      if (canSendAsGroup) {
        // Build media group - validate files before adding
        const mediaGroup = [];
        const invalidFiles = [];
        
        for (const file of convertedFiles) {
          try {
            const stats = await fs.stat(file.path);
            if (stats.size === 0) {
              console.error(`Skipping empty file: ${file.path}`);
              invalidFiles.push(file);
              continue;
            }
            
            // For images, validate dimensions (Telegram rejects too small images)
            if (file.original.group === 'image') {
              try {
                const sharp = require('sharp');
                const metadata = await sharp(file.path).metadata();
                
                // Skip if image is too small (less than 10x10)
                if (metadata.width < 10 || metadata.height < 10) {
                  console.error(`Skipping too small image: ${file.path} (${metadata.width}x${metadata.height})`);
                  invalidFiles.push(file);
                  continue;
                }
              } catch (metaError) {
                console.error(`Error reading image metadata ${file.path}:`, metaError);
                invalidFiles.push(file);
                continue;
              }
              
              mediaGroup.push(InputMediaBuilder.photo(new InputFile(file.path)));
            } else if (file.original.group === 'video') {
              mediaGroup.push(InputMediaBuilder.video(new InputFile(file.path)));
            }
          } catch (error) {
            console.error(`Error validating file ${file.path}:`, error);
            invalidFiles.push(file);
          }
        }

        if (mediaGroup.length > 0) {
          // Use retry logic for rate limit handling
          await retryWithDelay(async () => {
            await ctx.replyWithMediaGroup(mediaGroup);
          });
          
          await ctx.api.editMessageText(
            ctx.chat.id,
            statusMessageId,
            `✅ Готово! Конвертировано ${mediaGroup.length} из ${totalFiles} файлов`
          );
        }
        
        if (invalidFiles.length > 0) {
          await ctx.reply(`⚠️ ${invalidFiles.length} файлов не удалось отправить (пустые или повреждены)`);
        }
      } else {
        // Send individually with rate limit handling
        for (let i = 0; i < convertedFiles.length; i++) {
          const file = convertedFiles[i];
          await retryWithDelay(async () => {
            await ctx.replyWithDocument(new InputFile(file.path));
          });
          
          // Small delay between individual files to avoid rate limit
          if (i < convertedFiles.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMessageId,
          `✅ Готово! Конвертировано ${convertedFiles.length} из ${totalFiles} файлов`
        );
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
};

module.exports = { handleFormatSelection, handleQualitySelection };
