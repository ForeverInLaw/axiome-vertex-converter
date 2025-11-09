require('dotenv').config();
const { Bot, GrammyError, HttpError, session } = require('grammy');
const { hydrateFiles } = require('@grammyjs/files');
const { startCommand } = require('./commands/start');
const { subscribeCommand } = require('./commands/subscribe');
const { statusCommand } = require('./commands/status');
const { helpCommand } = require('./commands/help');
const { startCleanupService } = require('./services/cleanup');
const { resetDailyConversions: resetDB } = require('./services/database');
const { mainMenu } = require('./keyboards/mainMenu');
const { handleFile } = require('./handlers/fileHandler');
const { handlePotentialBatch } = require('./handlers/batchHandler');
const { handleFormatSelection, handleQualitySelection } = require('./handlers/conversionHandler');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not defined');
}

// Configure local Bot API Server if TELEGRAM_API_ROOT is set
const apiRoot = process.env.TELEGRAM_API_ROOT;

// Create bot with apiRoot for local Bot API Server
const botConfig = apiRoot 
  ? { client: { apiRoot } }
  : {};

const bot = new Bot(token, botConfig);

console.log(apiRoot 
  ? `🚀 Bot using local API server: ${apiRoot} (file limit: 2000 MB)`
  : '🚀 Bot using standard Telegram API (file limit: 20 MB download, 50 MB upload)');

// Enable files plugin with local API root configuration
bot.api.config.use(hydrateFiles(token, apiRoot ? { apiRoot } : {}));

bot.use(session({ initial: () => ({}) }));

bot.command('start', startCommand);
bot.command('subscribe', subscribeCommand);
bot.command('status', statusCommand);
bot.command('help', helpCommand);

bot.callbackQuery('subscribe', async (ctx) => {
  await ctx.answerCallbackQuery();
  await subscribeCommand(ctx);
});

bot.callbackQuery('status', async (ctx) => {
  await ctx.answerCallbackQuery();
  await statusCommand(ctx);
});

bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await helpCommand(ctx);
});

bot.callbackQuery('convert_file', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('📎 Отправьте файл для конвертации');
});

bot.callbackQuery(/^format:/, handleFormatSelection);
bot.callbackQuery(/^quality:/, handleQualitySelection);

bot.callbackQuery('cancel_conversion', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session && ctx.session.currentFile) {
    const { deleteFile } = require('./services/cleanup');
    await deleteFile(ctx.session.currentFile.path);
    delete ctx.session.currentFile;
    delete ctx.session.targetFormat;
  }
  await ctx.editMessageText('❌ Конвертация отменена', {
    reply_markup: mainMenu('ru')
  });
});

bot.on('message:document', async (ctx) => {
  await handlePotentialBatch(ctx, ctx.message.document, bot);
});

bot.on('message:photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  await handlePotentialBatch(ctx, photo, bot);
});

bot.on('message:video', async (ctx) => {
  await handlePotentialBatch(ctx, ctx.message.video, bot);
});

bot.on('message:audio', async (ctx) => {
  await handlePotentialBatch(ctx, ctx.message.audio, bot);
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

const startBot = async () => {
  console.log('Starting Axiome Vertex Converter Bot...');
  
  // Log admin configuration
  const { logAdminConfig } = require('./services/adminCheck');
  logAdminConfig();
  
  // Log disk space
  const { logDiskSpace } = require('./services/diskMonitor');
  await logDiskSpace();
  
  startCleanupService();
  
  // Reset daily conversions every 24 hours (not every hour!)
  setInterval(async () => {
    try {
      await resetDB();
      console.log('Daily conversions reset completed');
    } catch (error) {
      console.error('Error resetting daily conversions:', error);
    }
  }, 86400000); // 24 hours in milliseconds
  
  bot.start({
    allowed_updates: ['message', 'callback_query'],
  });
  
  console.log('Bot is running...');
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await bot.stop();
  const { pool } = require('./services/database');
  await pool.end();
  console.log('Database connections closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await bot.stop();
  const { pool } = require('./services/database');
  await pool.end();
  console.log('Database connections closed');
  process.exit(0);
});

startBot();
