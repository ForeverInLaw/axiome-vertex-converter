const { getUserLimits, getSubscriptionStatus } = require('../services/database');
const { isAdmin } = require('../services/adminCheck');
const { mainMenu } = require('../keyboards/mainMenu');
const { t } = require('../i18n');

const statusCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const lang = 'ru';
    
    const limits = await getUserLimits(userId);
    const expiresAt = await getSubscriptionStatus(userId);
    
    const maxDaily = limits.is_subscribed ? 
      parseInt(process.env.DAILY_LIMIT_SUBSCRIBED || '100', 10) : 
      parseInt(process.env.DAILY_LIMIT_FREE || '3', 10);
    
    let message = t(lang, 'status.title') + '\n\n';
    
    // Admin status
    if (isAdmin(userId)) {
      message += '👑 *План:* ADMIN\n';
      message += '✨ *Статус:* Безлимитный доступ\n';
      message += '📊 *Конвертации:* Unlimited\n';
      message += '💾 *Макс. размер:* ' + process.env.MAX_FILE_SIZE_MB + ' МБ\n';
      message += '\n_Вы администратор бота с полным доступом ко всем функциям._';
    } else if (limits.is_subscribed && expiresAt) {
      const dateStr = new Date(expiresAt).toLocaleDateString('ru-RU');
      message += t(lang, 'status.subscribed', {
        date: dateStr,
        used: limits.daily_conversions,
        limit: maxDaily
      });
    } else {
      message += t(lang, 'status.free', {
        used: limits.daily_conversions,
        limit: maxDaily
      });
    }
    
    await ctx.reply(message, {
      reply_markup: mainMenu(lang),
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Error in status command:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
};

module.exports = { statusCommand };
