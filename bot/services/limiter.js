const { getUserLimits } = require('./database');
const { isAdmin } = require('./adminCheck');

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);
const MAX_FREE_FILE_SIZE_MB = parseInt(process.env.MAX_FREE_FILE_SIZE_MB || '20', 10);
const DAILY_LIMIT_FREE = parseInt(process.env.DAILY_LIMIT_FREE || '3', 10);
const DAILY_LIMIT_SUBSCRIBED = parseInt(process.env.DAILY_LIMIT_SUBSCRIBED || '100', 10);

const userRequestLimiter = new Map();

const checkRequestLimit = (userId) => {
  // Admins bypass rate limiting
  if (isAdmin(userId)) {
    return true;
  }
  
  const now = Date.now();
  const limit = userRequestLimiter.get(userId);
  
  if (!limit || now > limit.resetAt) {
    userRequestLimiter.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 10) {
    throw new Error('Слишком много запросов. Подождите 1 минуту.');
  }
  
  limit.count++;
  return true;
};

const checkLimits = async (userId, fileSizeMb) => {
  checkRequestLimit(userId);
  
  // Admins get unlimited access
  if (isAdmin(userId)) {
    return { 
      isSubscribed: true, 
      isAdmin: true,
      remainingConversions: 999999 
    };
  }
  
  const limits = await getUserLimits(userId);
  const maxSize = limits.is_subscribed ? MAX_FILE_SIZE_MB : MAX_FREE_FILE_SIZE_MB;
  const maxDaily = limits.is_subscribed ? DAILY_LIMIT_SUBSCRIBED : DAILY_LIMIT_FREE;
  
  if (fileSizeMb > maxSize) {
    const error = new Error(`Файл слишком большой. Максимум: ${maxSize} МБ`);
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }
  
  if (limits.daily_conversions >= maxDaily) {
    const error = new Error('Исчерпан дневной лимит конвертаций');
    error.code = 'DAILY_LIMIT_EXCEEDED';
    throw error;
  }
  
  return { 
    isSubscribed: limits.is_subscribed, 
    isAdmin: false,
    remainingConversions: maxDaily - limits.daily_conversions 
  };
};

module.exports = {
  checkLimits,
  checkRequestLimit,
};
