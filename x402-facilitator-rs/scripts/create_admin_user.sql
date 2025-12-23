-- Create initial admin user for X402
-- Default password: 'x402admin123' (change this immediately after first login!)

INSERT INTO admin_users (username, password_hash, display_name, role, is_active) 
VALUES (
    'admin',
    '$2b$10$6HYhOaxM/XY294ExXfFGHOF7IMpXX6A5tYHqkLETBtbDPzR4Yy50W',
    'System Admin',
    'super_admin',
    TRUE
)
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    updated_at = NOW();

-- Verify the admin was created
SELECT id, username, display_name, role, is_active, created_at 
FROM admin_users 
WHERE username = 'admin';
