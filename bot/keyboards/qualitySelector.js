const { InlineKeyboard } = require('grammy');
const { t } = require('../i18n');

const qualitySelector = (lang = 'ru') => {
  return new InlineKeyboard()
    .text(t(lang, 'quality.original'), 'quality:original').row()
    .text(t(lang, 'quality.high'), 'quality:high').row()
    .text(t(lang, 'quality.medium'), 'quality:medium').row()
    .text(t(lang, 'quality.low'), 'quality:low').row()
    .text(t(lang, 'quality.minimum'), 'quality:minimum').row()
    .text(t(lang, 'buttons.back'), 'cancel_conversion');
};

const QUALITY_SETTINGS = {
  original: { crf: 18, scale: 1.0, description: 'Best quality, original resolution' },
  high: { crf: 20, scale: 1.0, description: 'High quality, Full HD (1080p)' },
  medium: { crf: 23, scale: 0.75, description: 'Good quality, HD (720p)' },
  low: { crf: 28, scale: 0.5, description: 'Standard quality, SD (480p)' },
  minimum: { crf: 32, scale: 0.35, description: 'Low quality, fast transfer (360p)' }
};

module.exports = { qualitySelector, QUALITY_SETTINGS };
