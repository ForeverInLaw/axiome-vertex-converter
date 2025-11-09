-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    subscription_expires_at TIMESTAMP,
    daily_conversions INTEGER DEFAULT 0,
    last_conversion_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversions table
CREATE TABLE IF NOT EXISTS conversions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    original_format VARCHAR(20),
    target_format VARCHAR(20),
    file_size_mb DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    transaction_hash TEXT UNIQUE NOT NULL,
    amount_axm DECIMAL(20,6),
    subscription_days INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);

-- Function: Auto-update subscription on payment
CREATE OR REPLACE FUNCTION update_subscription_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users
    SET subscription_expires_at = CASE
        WHEN subscription_expires_at > CURRENT_TIMESTAMP 
        THEN subscription_expires_at + INTERVAL '30 days'
        ELSE CURRENT_TIMESTAMP + INTERVAL '30 days'
    END
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Subscription update
DROP TRIGGER IF EXISTS trigger_subscription_update ON transactions;
CREATE TRIGGER trigger_subscription_update
AFTER INSERT ON transactions
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION update_subscription_on_payment();

-- Function: Reset daily conversions
CREATE OR REPLACE FUNCTION reset_daily_conversions()
RETURNS void AS $$
BEGIN
    UPDATE users
    SET daily_conversions = 0,
        last_conversion_reset = CURRENT_TIMESTAMP
    WHERE last_conversion_reset < CURRENT_TIMESTAMP - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;
