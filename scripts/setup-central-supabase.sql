-- ============================================================================
-- Supabase CENTRAL — Definitive Setup for MoreHub
-- Run this in your CENTRAL Supabase SQL Editor (morehub-central project).
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- ── 1. Core tables ──────────────────────────────────────────────────────────

-- 1a. Data Centers — reusable Supabase instances shared by multiple businesses
CREATE TABLE IF NOT EXISTS data_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    data_url TEXT NOT NULL,
    data_anon_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT data_centers_name_key UNIQUE (name),
    CONSTRAINT data_centers_url_key UNIQUE (data_url)
);

ALTER TABLE data_centers ENABLE ROW LEVEL SECURITY;

-- 1b. Businesses
CREATE TABLE IF NOT EXISTS businesses (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Add data_center_id FK (idempotent)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS data_center_id UUID REFERENCES data_centers (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_businesses_data_center_id ON businesses (data_center_id);

-- 1c. Activation codes
CREATE TABLE IF NOT EXISTS activation_codes (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    used_by_device_id TEXT,
    used_at TIMESTAMPTZ,
    device_info JSONB, -- brand, model, OS, app version, etc.
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes (code);

-- 1d. Web page enabled flag on businesses
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS web_enabled BOOLEAN NOT NULL DEFAULT false;

-- 1d2. Web URL stored per business (set on creation)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS web_url TEXT;

-- Backfill web_url for existing businesses that don't have one
UPDATE businesses
SET web_url = 'https://morehub-webpage.vercel.app/' || id::TEXT
WHERE web_url IS NULL;

-- 1e. Web configs — per-business customisation for the public web page
CREATE TABLE IF NOT EXISTS web_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    -- Branding
    primary_color TEXT NOT NULL DEFAULT '#3b82f6',
    -- Content
    tagline TEXT,
    description TEXT,
    phone TEXT,
    whatsapp TEXT,
    -- Social
    instagram TEXT,
    facebook TEXT,
    tiktok TEXT,
    -- Layout
    show_prices BOOLEAN NOT NULL DEFAULT true,
    show_stock BOOLEAN NOT NULL DEFAULT false,
    theme TEXT NOT NULL DEFAULT 'light',
    -- Meta
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT web_configs_business_id_key UNIQUE (business_id)
);

ALTER TABLE web_configs ENABLE ROW LEVEL SECURITY;

-- ── 2. App RPCs (called by mobile app — anonymous access) ───────────────────

-- 2a. Validate and consume an activation code atomically.
--     Returns business_id + data_url + data_anon_key.
CREATE OR REPLACE FUNCTION validate_activation_code(
  p_code TEXT,
  p_device_id TEXT,
  p_device_info JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record activation_codes%ROWTYPE;
  v_dc     data_centers%ROWTYPE;
  v_biz    businesses%ROWTYPE;
BEGIN
  SELECT * INTO v_record
  FROM activation_codes
  WHERE code = p_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_record.used_by_device_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  END IF;

  IF v_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  -- Consume the code
  UPDATE activation_codes
  SET used_by_device_id = p_device_id,
      used_at = now(),
      device_info = p_device_info
  WHERE id = v_record.id;

  -- Lookup business → data center
  SELECT * INTO v_biz FROM businesses WHERE id = v_record.business_id;

  IF v_biz.data_center_id IS NOT NULL THEN
    SELECT * INTO v_dc FROM data_centers WHERE id = v_biz.data_center_id;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'business_id',   v_record.business_id,
    'data_url',      COALESCE(v_dc.data_url, ''),
    'data_anon_key', COALESCE(v_dc.data_anon_key, '')
  );
END;
$$;

-- 2b. Fetch data connection at any time (verifies device ownership).
CREATE OR REPLACE FUNCTION get_data_connection(
  p_business_id UUID,
  p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN;
  v_dc    data_centers%ROWTYPE;
  v_biz   businesses%ROWTYPE;
BEGIN
  -- Verify device was activated for this business
  SELECT EXISTS(
    SELECT 1 FROM activation_codes
    WHERE business_id = p_business_id
      AND used_by_device_id = p_device_id
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Get business → data center
  SELECT * INTO v_biz FROM businesses WHERE id = p_business_id;

  IF v_biz.data_center_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_connection');
  END IF;

  SELECT * INTO v_dc FROM data_centers WHERE id = v_biz.data_center_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_connection');
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'data_url',      v_dc.data_url,
    'data_anon_key', v_dc.data_anon_key
  );
END;
$$;

-- 2c. Get web config for a business (app reads).
CREATE OR REPLACE FUNCTION get_web_config(
  p_business_id UUID,
  p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN;
  v_biz   businesses%ROWTYPE;
  v_wc    web_configs%ROWTYPE;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM activation_codes
    WHERE business_id = p_business_id
      AND used_by_device_id = p_device_id
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_biz FROM businesses WHERE id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'business_not_found');
  END IF;

  SELECT * INTO v_wc FROM web_configs WHERE business_id = p_business_id;

  RETURN jsonb_build_object(
    'success',       true,
    'web_enabled',   v_biz.web_enabled,
    'web_url',       v_biz.web_url,
    'config',        CASE WHEN v_wc.id IS NOT NULL THEN row_to_json(v_wc)::jsonb ELSE NULL END
  );
END;
$$;

-- 2d. Update web config from the app (upserts web_configs + toggles web_enabled).
CREATE OR REPLACE FUNCTION update_web_config(
  p_business_id UUID,
  p_device_id TEXT,
  p_web_enabled BOOLEAN,
  p_config JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM activation_codes
    WHERE business_id = p_business_id
      AND used_by_device_id = p_device_id
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Toggle web_enabled flag
  UPDATE businesses SET web_enabled = p_web_enabled WHERE id = p_business_id;

  -- Upsert web_configs
  INSERT INTO web_configs (
    business_id, primary_color,
    tagline, description, phone, whatsapp,
    instagram, facebook, tiktok,
    show_prices, show_stock, theme, updated_at
  ) VALUES (
    p_business_id,
    COALESCE(p_config->>'primary_color', '#3b82f6'),
    p_config->>'tagline',
    p_config->>'description',
    p_config->>'phone',
    p_config->>'whatsapp',
    p_config->>'instagram',
    p_config->>'facebook',
    p_config->>'tiktok',
    COALESCE((p_config->>'show_prices')::BOOLEAN, true),
    COALESCE((p_config->>'show_stock')::BOOLEAN, false),
    COALESCE(p_config->>'theme', 'light'),
    now()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    primary_color = EXCLUDED.primary_color,
    tagline       = EXCLUDED.tagline,
    description   = EXCLUDED.description,
    phone         = EXCLUDED.phone,
    whatsapp      = EXCLUDED.whatsapp,
    instagram     = EXCLUDED.instagram,
    facebook      = EXCLUDED.facebook,
    tiktok        = EXCLUDED.tiktok,
    show_prices   = EXCLUDED.show_prices,
    show_stock    = EXCLUDED.show_stock,
    theme         = EXCLUDED.theme,
    updated_at    = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 3. Console RPCs (called by web admin — require auth) ────────────────────

-- 3a. Data Centers

CREATE OR REPLACE FUNCTION console_list_data_centers()
RETURNS SETOF data_centers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM data_centers ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION console_create_data_center(
  p_name TEXT,
  p_data_url TEXT,
  p_data_anon_key TEXT
)
RETURNS data_centers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row data_centers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO data_centers (name, data_url, data_anon_key)
  VALUES (trim(p_name), trim(p_data_url), trim(p_data_anon_key))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- 3b. Businesses

CREATE OR REPLACE FUNCTION console_list_businesses()
RETURNS SETOF businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM businesses ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION console_create_business(
  p_name TEXT,
  p_data_center_id UUID
)
RETURNS businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row businesses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM data_centers WHERE id = p_data_center_id) THEN
    RAISE EXCEPTION 'data_center_not_found';
  END IF;

  INSERT INTO businesses (name, data_center_id)
  VALUES (trim(p_name), p_data_center_id)
  RETURNING * INTO v_row;

  -- Set web_url with the actual generated id
  UPDATE businesses
  SET web_url = 'https://morehub-webpage.vercel.app/' || v_row.id::TEXT
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION console_delete_business(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM businesses WHERE id = p_id;
END;
$$;

-- 3b2. Update business web_url

CREATE OR REPLACE FUNCTION console_update_business_web_url(
  p_id UUID,
  p_web_url TEXT
)
RETURNS businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row businesses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE businesses SET web_url = trim(p_web_url) WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_not_found'; END IF;
  RETURN v_row;
END;
$$;

-- 3c. Activation Codes

CREATE OR REPLACE FUNCTION console_list_activation_codes(p_business_id UUID DEFAULT NULL)
RETURNS SETOF activation_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_business_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM activation_codes
      WHERE business_id = p_business_id ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM activation_codes ORDER BY created_at DESC;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION console_create_activation_code(
  p_code TEXT,
  p_business_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS activation_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row activation_codes;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.id = p_business_id AND b.data_center_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'business_without_data_center';
  END IF;

  INSERT INTO activation_codes (code, business_id, expires_at)
  VALUES (p_code, p_business_id, p_expires_at)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION console_delete_activation_code(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM activation_codes WHERE id = p_id;
END;
$$;

-- ── 4. RLS policies ─────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'No direct access to data_centers') THEN
    CREATE POLICY "No direct access to data_centers"
      ON data_centers FOR ALL USING (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'No direct access to businesses') THEN
    CREATE POLICY "No direct access to businesses"
      ON businesses FOR ALL USING (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'No direct access to activation_codes') THEN
    CREATE POLICY "No direct access to activation_codes"
      ON activation_codes FOR ALL USING (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'No direct access to web_configs') THEN
    CREATE POLICY "No direct access to web_configs"
      ON web_configs FOR ALL USING (false);
  END IF;
END $$;

-- 3d. Web Configs (console)

CREATE OR REPLACE FUNCTION console_list_web_configs()
RETURNS SETOF web_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT * FROM web_configs ORDER BY updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION console_upsert_web_config(
  p_business_id UUID,
  p_web_enabled BOOLEAN,
  p_config JSONB DEFAULT '{}'::JSONB
)
RETURNS web_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row web_configs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Toggle web_enabled flag on business
  UPDATE businesses SET web_enabled = p_web_enabled WHERE id = p_business_id;

  -- Upsert web_configs
  INSERT INTO web_configs (
    business_id, primary_color,
    tagline, description, phone, whatsapp,
    instagram, facebook, tiktok,
    show_prices, show_stock, theme, updated_at
  ) VALUES (
    p_business_id,
    COALESCE(p_config->>'primary_color', '#3b82f6'),
    p_config->>'tagline',
    p_config->>'description',
    p_config->>'phone',
    p_config->>'whatsapp',
    p_config->>'instagram',
    p_config->>'facebook',
    p_config->>'tiktok',
    COALESCE((p_config->>'show_prices')::BOOLEAN, true),
    COALESCE((p_config->>'show_stock')::BOOLEAN, false),
    COALESCE(p_config->>'theme', 'light'),
    now()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    primary_color = EXCLUDED.primary_color,
    tagline       = EXCLUDED.tagline,
    description   = EXCLUDED.description,
    phone         = EXCLUDED.phone,
    whatsapp      = EXCLUDED.whatsapp,
    instagram     = EXCLUDED.instagram,
    facebook      = EXCLUDED.facebook,
    tiktok        = EXCLUDED.tiktok,
    show_prices   = EXCLUDED.show_prices,
    show_stock    = EXCLUDED.show_stock,
    theme         = EXCLUDED.theme,
    updated_at    = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── 5. Public storefront RPC (anonymous — no auth required) ─────────────────
-- Returns business info + web_config + data center creds for rendering the
-- public storefront page. Only works if the business has web_enabled = true.

CREATE OR REPLACE FUNCTION get_public_storefront(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz businesses%ROWTYPE;
  v_dc  data_centers%ROWTYPE;
  v_wc  web_configs%ROWTYPE;
BEGIN
  SELECT * INTO v_biz FROM businesses WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF NOT v_biz.web_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_enabled');
  END IF;

  -- Fetch data center
  IF v_biz.data_center_id IS NOT NULL THEN
    SELECT * INTO v_dc FROM data_centers WHERE id = v_biz.data_center_id;
  END IF;

  IF NOT FOUND OR v_biz.data_center_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_data_center');
  END IF;

  -- Fetch web config
  SELECT * INTO v_wc FROM web_configs WHERE business_id = p_business_id;

  RETURN jsonb_build_object(
    'success',       true,
    'business',      jsonb_build_object(
      'id',              v_biz.id,
      'name',            v_biz.name,
      'data_center_id',  v_biz.data_center_id,
      'web_enabled',     v_biz.web_enabled,
      'web_url',         v_biz.web_url,
      'created_at',      v_biz.created_at
    ),
    'config',        CASE WHEN v_wc.id IS NOT NULL THEN jsonb_build_object(
      'id',            v_wc.id,
      'business_id',   v_wc.business_id,
      'primary_color', v_wc.primary_color,
      'tagline',       v_wc.tagline,
      'description',   v_wc.description,
      'phone',         v_wc.phone,
      'whatsapp',      v_wc.whatsapp,
      'instagram',     v_wc.instagram,
      'facebook',      v_wc.facebook,
      'tiktok',        v_wc.tiktok,
      'show_prices',   v_wc.show_prices,
      'show_stock',    v_wc.show_stock,
      'theme',         v_wc.theme
    ) ELSE NULL END,
    'data_url',      v_dc.data_url,
    'data_anon_key', v_dc.data_anon_key
  );
END;
$$;