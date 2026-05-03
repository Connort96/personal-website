-- 1. Create an admin_settings table to safely store the admin's UUID
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT PRIMARY KEY DEFAULT 1,
  admin_user_id UUID REFERENCES auth.users(id)
);

-- 2. Insert the admin's UUID automatically by looking up the email
INSERT INTO admin_settings (id, admin_user_id)
VALUES (1, (SELECT id FROM auth.users WHERE email = 'theconison96@gmail.com'))
ON CONFLICT (id) DO UPDATE SET admin_user_id = EXCLUDED.admin_user_id;

-- 3. Enable public read access to admin_settings
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view admin settings" ON admin_settings FOR SELECT USING (true);

-- 4. Enable public read access to user_books so visitors can see the admin's library
DROP POLICY IF EXISTS "Users can view their own books" ON user_books;
CREATE POLICY "Anyone can view books" ON user_books FOR SELECT USING (true);
