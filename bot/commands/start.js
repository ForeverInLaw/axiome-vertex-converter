const { findOrCreateUser } = require('../services/database');
const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const startCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    await findOrCreateUser(userId);
    
    const lang = 'ru'; // TODO: get from user preferences
    const welcomeText = t(lang, 'start.welcome');
    
    await ctx.reply(welcomeText, {
      reply_markup: mainMenu(lang),
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { startCommand };
