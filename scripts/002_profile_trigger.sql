-- Auto-create profile when user signs up
-- First user becomes admin automatically

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  should_be_admin BOOLEAN;
BEGIN
  -- Count existing users to make first user admin
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  should_be_admin := (user_count = 0);

  INSERT INTO public.profiles (id, email, full_name, is_approved, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    should_be_admin, -- First user is auto-approved
    should_be_admin  -- First user is admin
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
