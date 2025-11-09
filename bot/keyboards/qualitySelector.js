const { InlineKeyboard } = require('grammy');
const { t } = require('../i18n');

const qualitySelector = (lang = 'ru', fileType = 'video') => {
  // Map file group to i18n key
  const typeKey = fileType === 'audio' ? 'audio' : fileType === 'image' ? 'image' : 'video';
  
  return new InlineKeyboard()
    .text(t(lang, `quality.${typeKey}.original`), 'quality:original').row()
    .text(t(lang, `quality.${typeKey}.high`), 'quality:high').row()
    .text(t(lang, `quality.${typeKey}.medium`), 'quality:medium').row()
    .text(t(lang, `quality.${typeKey}.low`), 'quality:low').row()
    .text(t(lang, `quality.${typeKey}.minimum`), 'quality:minimum').row()
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
