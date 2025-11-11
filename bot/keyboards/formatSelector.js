const { InlineKeyboard } = require('grammy');

const FORMAT_GROUPS = {
  video: ['mp4', 'avi', 'mkv', 'mov', 'webm', 'flv'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
  image: ['jpg', 'png', 'webp', 'gif', 'tiff', 'heic', 'heif'],
  document: ['pdf', 'txt', 'md']
};

const getFormatGroup = (format) => {
  for (const [group, formats] of Object.entries(FORMAT_GROUPS)) {
    if (formats.includes(format.toLowerCase())) {
      return group;
    }
  }
  return null;
};

const formatSelector = (currentFormat) => {
  const group = getFormatGroup(currentFormat);
  if (!group) return null;
  
  const formats = FORMAT_GROUPS[group];
  const keyboard = new InlineKeyboard();
  
  let row = [];
  for (let i = 0; i < formats.length; i++) {
    const fmt = formats[i];
    if (fmt !== currentFormat.toLowerCase()) {
      row.push({ text: fmt.toUpperCase(), callback_data: `format:${fmt}` });
      
      if (row.length === 3) {
        keyboard.row(...row);
        row = [];
      }
    }
  }
  
  // Add remaining buttons
  if (row.length > 0) {
    keyboard.row(...row);
  }
  
  keyboard.row({ text: '◀️ Назад', callback_data: 'cancel_conversion' });
  
  return keyboard;
};

module.exports = { formatSelector, getFormatGroup, FORMAT_GROUPS };
