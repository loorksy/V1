-- User-specific data tables (migrated from IndexedDB)

-- Characters table
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  visual_traits TEXT,
  images JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "characters_select_own" ON public.characters 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "characters_insert_own" ON public.characters 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "characters_update_own" ON public.characters 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "characters_delete_own" ON public.characters 
  FOR DELETE USING (auth.uid() = user_id);

-- Storyboards table
CREATE TABLE IF NOT EXISTS public.storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scenes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storyboards_select_own" ON public.storyboards 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "storyboards_insert_own" ON public.storyboards 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "storyboards_update_own" ON public.storyboards 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "storyboards_delete_own" ON public.storyboards 
  FOR DELETE USING (auth.uid() = user_id);

-- Media Gallery table
CREATE TABLE IF NOT EXISTS public.media_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'image', 'thumbnail')),
  title TEXT NOT NULL,
  description TEXT,
  data TEXT NOT NULL, -- base64 or URL
  source TEXT,
  character_name TEXT,
  aspect_ratio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.media_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_select_own" ON public.media_gallery 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "media_insert_own" ON public.media_gallery 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "media_update_own" ON public.media_gallery 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "media_delete_own" ON public.media_gallery 
  FOR DELETE USING (auth.uid() = user_id);

-- Ad Campaigns table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  images JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own" ON public.ad_campaigns 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "campaigns_insert_own" ON public.ad_campaigns 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaigns_update_own" ON public.ad_campaigns 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "campaigns_delete_own" ON public.ad_campaigns 
  FOR DELETE USING (auth.uid() = user_id);
