const fs = require('fs');
const path = require('path');

const locales = {};

const loadLocale = (lang) => {
  const filePath = path.join(__dirname, 'locales', `${lang}.json`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    locales[lang] = JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load locale ${lang}:`, error.message);
  }
};

loadLocale('ru');
loadLocale('en');

const t = (lang, key, params = {}) => {
  const locale = locales[lang] || locales['ru'];
  const keys = key.split('.');
  let value = locale;
  
  for (const k of keys) {
    value = value[k];
    if (!value) return key;
  }
  
  if (typeof value === 'string' && params) {
    return value.replace(/{(\w+)}/g, (match, paramKey) => 
      paramKey in params ? params[paramKey] : match
    );
  }
  
  return value;
};

module.exports = { t };
