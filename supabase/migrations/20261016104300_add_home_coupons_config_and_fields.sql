-- Migration: add_home_coupons_config_and_fields
-- Safe addition of home display fields to coupons and default config to store_settings

ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS home_priority INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_coupons_home ON public.coupons (show_on_home, home_priority DESC) WHERE active = true;

INSERT INTO public.store_settings (setting_key, setting_value)
VALUES (
  'home_coupons_config',
  '{"mode": "auto", "max_items": 5, "auto_criteria": "highest_discount"}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;
