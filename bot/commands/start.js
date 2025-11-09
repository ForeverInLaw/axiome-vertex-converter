const { findOrCreateUser } = require('../services/database');
const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const startCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    await findOrCreateUser(userId);
    
    const lang = 'ru'; // TODO: get from user preferences
    const welcomeText = t(lang, 'start.welcome');
    
    // Check if this is a callback query (button press) or command
    if (ctx.callbackQuery) {
      // Edit existing message
      try {
        await ctx.editMessageText(welcomeText, {
          reply_markup: mainMenu(lang),
          parse_mode: 'Markdown'
        });
      } catch {
        // Fallback if editing fails
        await ctx.reply(welcomeText, {
          reply_markup: mainMenu(lang),
          parse_mode: 'Markdown'
        });
      }
    } else {
      // New message for command
      await ctx.reply(welcomeText, {
        reply_markup: mainMenu(lang),
        parse_mode: 'Markdown'
      });
    }
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { startCommand };
