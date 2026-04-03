-- ============================================================================
-- Supabase setup for MoreHub activation system
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- 1. Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- 2. Activation codes table
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  used_by_device_id TEXT,          -- filled on first use
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- Index for quick lookup by code
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);

-- 3. RPC function to validate and consume an activation code atomically
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
BEGIN
  -- Find the code
  SELECT * INTO v_record
  FROM activation_codes
  WHERE code = p_code;

  -- Code not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Already used
  IF v_record.used_by_device_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  END IF;

  -- Expired
  IF v_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  -- Consume the code
  UPDATE activation_codes
  SET used_by_device_id = p_device_id,
      used_at = now()
  WHERE id = v_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'business_id', v_record.business_id
  );
END;
$$;

-- 4. RLS policies — only the RPC function (SECURITY DEFINER) touches these tables
--    No direct client access needed.
CREATE POLICY "No direct access to businesses"
  ON businesses FOR ALL
  USING (false);

CREATE POLICY "No direct access to activation_codes"
  ON activation_codes FOR ALL
  USING (false);
