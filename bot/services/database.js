const { Pool } = require('pg');
const { isAdmin } = require('./adminCheck');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  query_timeout: 30000, // 30 second query timeout
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  // In production, critical pool errors should terminate the process
  if (process.env.NODE_ENV === 'production') {
    console.error('Critical database error in production - exiting');
    process.exit(-1);
  }
});

const findOrCreateUser = async (userId) => {
  const client = await pool.connect();
  try {
    let result = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      result = await client.query(
        'INSERT INTO users (id) VALUES ($1) RETURNING *',
        [userId]
      );
    }
    return result.rows[0];
  } finally {
    client.release();
  }
};

const getUserLimits = async (userId) => {
  // Admins always get PRO limits
  if (isAdmin(userId)) {
    return { 
      daily_conversions: 0, 
      is_subscribed: true,
      is_admin: true 
    };
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        daily_conversions,
        subscription_expires_at > CURRENT_TIMESTAMP as is_subscribed
      FROM users WHERE id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      await findOrCreateUser(userId);
      return { daily_conversions: 0, is_subscribed: false, is_admin: false };
    }
    
    return { ...result.rows[0], is_admin: false };
  } finally {
    client.release();
  }
};

const incrementConversionCount = async (userId) => {
  await pool.query(
    'UPDATE users SET daily_conversions = daily_conversions + 1 WHERE id = $1',
    [userId]
  );
};

const logConversion = async (userId, originalFormat, targetFormat, fileSizeMb, status = 'completed') => {
  await pool.query(
    'INSERT INTO conversions (user_id, original_format, target_format, file_size_mb, status) VALUES ($1, $2, $3, $4, $5)',
    [userId, originalFormat, targetFormat, fileSizeMb, status]
  );
};

const getSubscriptionStatus = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].subscription_expires_at;
  } finally {
    client.release();
  }
};

const resetDailyConversions = async () => {
  await pool.query(`
    UPDATE users
    SET daily_conversions = 0,
        last_conversion_reset = CURRENT_TIMESTAMP
    WHERE last_conversion_reset < CURRENT_TIMESTAMP - INTERVAL '1 day'
  `);
};

module.exports = {
  pool,
  findOrCreateUser,
  getUserLimits,
  incrementConversionCount,
  logConversion,
  getSubscriptionStatus,
  resetDailyConversions,
};
