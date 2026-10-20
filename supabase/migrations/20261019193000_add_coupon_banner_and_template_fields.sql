-- Migration: 20261019193000_add_coupon_banner_and_template_fields.sql
-- Safe addition of banner image, template origin and highlight flags to coupons

ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS banner_image_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS template_origin TEXT DEFAULT 'custom',
ADD COLUMN IF NOT EXISTS badge_label TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_banner_highlight BOOLEAN DEFAULT false;

-- Index for home banners query
CREATE INDEX IF NOT EXISTS idx_coupons_banner_highlight 
ON public.coupons (is_banner_highlight, home_priority DESC) 
WHERE active = true;

-- Storage bucket for coupon banners (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('coupon-banners', 'coupon-banners', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Public read for coupon-banners
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for coupon-banners'
  ) THEN
    CREATE POLICY "Public Access for coupon-banners"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'coupon-banners');
  END IF;
END $$;
