const { InlineKeyboard } = require('grammy');
const { t } = require('../i18n');

const qualitySelector = (lang = 'ru') => {
  return new InlineKeyboard()
    .text(t(lang, 'quality.high'), 'quality:high').row()
    .text(t(lang, 'quality.medium'), 'quality:medium').row()
    .text(t(lang, 'quality.low'), 'quality:low').row()
    .text(t(lang, 'buttons.back'), 'cancel_conversion');
};

const QUALITY_SETTINGS = {
  high: { crf: 18, scale: 1.0 },
  medium: { crf: 23, scale: 0.85 },
  low: { crf: 28, scale: 0.7 }
};

module.exports = { qualitySelector, QUALITY_SETTINGS };
