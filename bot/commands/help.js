const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const helpCommand = async (ctx) => {
  try {
    const lang = 'ru';
    
    const message = t(lang, 'help.title') + '\n\n' + t(lang, 'help.text');
    
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
    console.error('Error in help command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { helpCommand };
