const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const helpCommand = async (ctx) => {
  try {
    const lang = 'ru';
    
    const message = t(lang, 'help.title') + '\n\n' + t(lang, 'help.text');
    
    await ctx.reply(message, {
      reply_markup: mainMenu(lang),
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Error in help command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { helpCommand };
