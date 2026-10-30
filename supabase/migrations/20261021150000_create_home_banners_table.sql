-- Migration: 20261021150000_create_home_banners_table.sql
-- Safe additive creation of home_banners table for dynamic home carousel

CREATE TABLE IF NOT EXISTS public.home_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'home_banners' AND policyname = 'Public Read for home_banners'
  ) THEN
    CREATE POLICY "Public Read for home_banners" 
    ON public.home_banners FOR SELECT 
    USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'home_banners' AND policyname = 'Admins can manage home_banners'
  ) THEN
    CREATE POLICY "Admins can manage home_banners" 
    ON public.home_banners FOR ALL 
    TO authenticated 
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
    );
  END IF;
END $$;
