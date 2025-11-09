const { getSubscriptionStatus } = require('../services/database');
const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const subscribeCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const lang = 'ru';
    
    const expiresAt = await getSubscriptionStatus(userId);
    const walletAddress = process.env.AXIOME_WALLET_ADDRESS;
    
    let message = t(lang, 'subscribe.title') + '\n\n';
    
    if (expiresAt && new Date(expiresAt) > new Date()) {
      const dateStr = new Date(expiresAt).toLocaleDateString('ru-RU');
      message += t(lang, 'subscribe.active', { date: dateStr });
    } else {
      message += t(lang, 'subscribe.info');
      message += t(lang, 'subscribe.instruction', {
        wallet: walletAddress,
        userId: userId.toString()
      });
    }
    
    // Check if this is a callback query (button press) or command
    if (ctx.callbackQuery) {
      // Edit existing message
      try {
        await ctx.editMessageText(message, {
          reply_markup: mainMenu(lang),
          parse_mode: 'Markdown'
        });
      } catch {
        // Fallback if editing fails
        await ctx.reply(message, {
          reply_markup: mainMenu(lang),
          parse_mode: 'Markdown'
        });
      }
    } else {
      // New message for command
      await ctx.reply(message, {
        reply_markup: mainMenu(lang),
        parse_mode: 'Markdown'
      });
    }
  } catch (error) {
    console.error('Error in subscribe command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { subscribeCommand };
