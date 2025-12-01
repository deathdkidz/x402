-- Add tier and rate limit columns to merchants table
ALTER TABLE merchants
ADD COLUMN tier VARCHAR(20) DEFAULT 'free' AFTER is_active,
ADD COLUMN verify_limit INT DEFAULT 60 AFTER tier,
ADD COLUMN settle_limit INT DEFAULT 20 AFTER verify_limit,
ADD COLUMN rate_limit_window INT DEFAULT 60 AFTER settle_limit,
ADD INDEX idx_tier (tier);

-- Update existing merchants to free tier
UPDATE merchants SET tier = 'free' WHERE tier IS NULL;

-- Example tiers:
-- 'free': 60 verify/min, 20 settle/min
-- 'basic': 120 verify/min, 40 settle/min
-- 'pro': 300 verify/min, 100 settle/min
-- 'enterprise': 1000 verify/min, 500 settle/min
