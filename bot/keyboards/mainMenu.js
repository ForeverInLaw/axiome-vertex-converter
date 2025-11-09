const { InlineKeyboard } = require('grammy');
const { t } = require('../i18n');

const mainMenu = (lang = 'ru') => {
  return new InlineKeyboard()
    .text(t(lang, 'buttons.convert'), 'convert_file').row()
    .text(t(lang, 'buttons.subscribe'), 'subscribe').row()
    .text(t(lang, 'buttons.status'), 'status')
    .text(t(lang, 'buttons.help'), 'help');
};

module.exports = { mainMenu };
