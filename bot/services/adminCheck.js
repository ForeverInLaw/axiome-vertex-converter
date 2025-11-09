/**
 * Admin checker utility
 * Admins get unlimited access without subscription
 */

// Parse admin user IDs from environment
const getAdminIds = () => {
  const adminIds = process.env.ADMIN_USER_IDS || '';
  
  if (!adminIds.trim()) {
    return new Set();
  }
  
  return new Set(
    adminIds
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id))
  );
};

const adminIds = getAdminIds();

/**
 * Check if user is admin
 * @param {number} userId - Telegram user ID
 * @returns {boolean}
 */
const isAdmin = (userId) => {
  return adminIds.has(userId);
};

/**
 * Get admin count
 * @returns {number}
 */
const getAdminCount = () => {
  return adminIds.size;
};

/**
 * Log admin configuration at startup
 */
const logAdminConfig = () => {
  if (adminIds.size > 0) {
    console.log(`Admin mode enabled: ${adminIds.size} admin(s) configured`);
    console.log(`Admin IDs: ${Array.from(adminIds).join(', ')}`);
  } else {
    console.log('No admins configured (ADMIN_USER_IDS is empty)');
  }
};

module.exports = {
  isAdmin,
  getAdminCount,
  logAdminConfig,
};
