-- ============================================================================
-- Supabase DATA instance setup for MoreHub
-- Run this in your DATA Supabase SQL Editor (e.g. morehub-data-01)
--
-- All tables carry a business_id column for multi-tenant isolation via RLS.
-- ============================================================================

-- ── Helper: RLS function ─────────────────────────────────────────────────────
-- Each admin device stores its business_id as a custom JWT claim or passes it
-- via an RPC parameter. For simplicity we use service_role from the app and
-- rely on the app always filtering by business_id. RLS is a safety net.

-- ── 1. Stores ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stores (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    logo_uri TEXT,
    logo_hash TEXT,
    cloud_logo_path TEXT,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    opening_time TEXT,
    closing_time TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_business_isolation" ON stores FOR ALL USING (true);

-- ── 2. Unit categories ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS unit_categories (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE unit_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_categories_business_isolation" ON unit_categories FOR ALL USING (true);

-- ── 3. Units ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS units (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    category_id BIGINT NOT NULL,
    to_base_factor REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "units_business_isolation" ON units FOR ALL USING (true);

-- ── 4. Products ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    price_per_base_unit REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    base_unit_id BIGINT NOT NULL,
    stock_base_qty REAL NOT NULL DEFAULT 0,
    sale_mode TEXT NOT NULL DEFAULT 'UNIT' CHECK (
        sale_mode IN ('UNIT', 'VARIABLE')
    ),
    photo_uri TEXT,
    photo_hash TEXT,
    cloud_photo_path TEXT,
    details TEXT,
    store_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_business_isolation" ON products FOR ALL USING (true);

-- ── 5. Users ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'WORKER' CHECK (role IN ('ADMIN', 'WORKER')),
    pin_hash TEXT NOT NULL,
    photo_uri TEXT,
    photo_hash TEXT,
    cloud_photo_path TEXT,
    store_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_business_isolation" ON users FOR ALL USING (true);

-- ── 6. Suppliers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    store_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_business_isolation" ON suppliers FOR ALL USING (true);

-- ── 7. Tickets ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT NOT NULL,
    business_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (
        payment_method IN ('CASH', 'CARD')
    ),
    total REAL NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 0,
    worker_id BIGINT,
    worker_name TEXT,
    worker_photo_uri TEXT,
    store_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'VOIDED')
    ),
    voided_at TIMESTAMPTZ,
    voided_by BIGINT,
    void_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets_business_isolation" ON tickets FOR ALL USING (true);

-- ── 8. Ticket items ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_items (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    ticket_id TEXT NOT NULL,
    product_id BIGINT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE ticket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_items_business_isolation" ON ticket_items FOR ALL USING (true);

-- ── 9. Purchases ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchases (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    supplier_id BIGINT,
    supplier_name TEXT NOT NULL,
    notes TEXT,
    total REAL NOT NULL DEFAULT 0,
    transport_cost REAL NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 0,
    store_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_business_isolation" ON purchases FOR ALL USING (true);

-- ── 10. Purchase items ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_items (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    purchase_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    subtotal REAL NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_items_business_isolation" ON purchase_items FOR ALL USING (true);

-- ── 11. Expenses ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
    id BIGINT NOT NULL,
    business_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN (
            'TRANSPORT',
            'ELECTRICITY',
            'RENT',
            'REPAIRS',
            'SUPPLIES',
            'OTHER'
        )
    ),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    store_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (business_id, id)
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_business_isolation" ON expenses FOR ALL USING (true);

-- ── 12. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_business ON products (business_id);

CREATE INDEX IF NOT EXISTS idx_tickets_business ON tickets (business_id);

CREATE INDEX IF NOT EXISTS idx_ticket_items_business ON ticket_items (business_id);

CREATE INDEX IF NOT EXISTS idx_purchases_business ON purchases (business_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_business ON purchase_items (business_id);

CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses (business_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers (business_id);

CREATE INDEX IF NOT EXISTS idx_users_business ON users (business_id);

CREATE INDEX IF NOT EXISTS idx_stores_business ON stores (business_id);

-- ── 13. Analytics RPC ────────────────────────────────────────────────────────
-- Returns all analytics aggregates in a single call.
-- Accepts p_business_id, p_from, p_to, p_store_id (NULL = all stores).

DROP FUNCTION IF EXISTS get_business_analytics(TEXT, TEXT);

DROP FUNCTION IF EXISTS get_business_analytics (UUID, TEXT);

DROP FUNCTION IF EXISTS get_business_analytics (UUID, DATE, DATE);

DROP FUNCTION IF EXISTS get_business_analytics (UUID, DATE, DATE, BIGINT);

CREATE OR REPLACE FUNCTION get_business_analytics(
  p_business_id UUID,
  p_from     DATE    DEFAULT '1970-01-01',
  p_to       DATE    DEFAULT CURRENT_DATE,
  p_store_id BIGINT  DEFAULT NULL            -- NULL = all stores
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  v_from := p_from::TIMESTAMPTZ;
  v_to   := (p_to + INTERVAL '1 day')::TIMESTAMPTZ;  -- inclusive end

  SELECT jsonb_build_object(
    -- ── Stores list (always returned for the selector) ──
    'stores', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.name)
      FROM (
        SELECT id, name FROM stores WHERE business_id = p_business_id
      ) r
    ), '[]'::JSONB),

    -- ── Summary totals ──
    'total_income', COALESCE((
      SELECT SUM(total) FROM tickets
      WHERE business_id = p_business_id AND status = 'ACTIVE'
        AND created_at >= v_from AND created_at < v_to
        AND (p_store_id IS NULL OR store_id = p_store_id)
    ), 0),
    'total_expenses', COALESCE((
      SELECT SUM(amount) FROM expenses
      WHERE business_id = p_business_id
        AND date::DATE >= p_from AND date::DATE <= p_to
        AND (p_store_id IS NULL OR store_id = p_store_id)
    ), 0),
    'total_purchases', COALESCE((
      SELECT SUM(total) FROM purchases
      WHERE business_id = p_business_id
        AND created_at >= v_from AND created_at < v_to
        AND (p_store_id IS NULL OR store_id = p_store_id)
    ), 0),
    'ticket_count', COALESCE((
      SELECT COUNT(*) FROM tickets
      WHERE business_id = p_business_id AND status = 'ACTIVE'
        AND created_at >= v_from AND created_at < v_to
        AND (p_store_id IS NULL OR store_id = p_store_id)
    ), 0),

    -- ── Daily sales ──
    'daily_sales', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.date)
      FROM (
        SELECT created_at::DATE AS date, SUM(total) AS total, COUNT(*) AS count
        FROM tickets
        WHERE business_id = p_business_id AND status = 'ACTIVE'
          AND created_at >= v_from AND created_at < v_to
          AND (p_store_id IS NULL OR store_id = p_store_id)
        GROUP BY created_at::DATE
      ) r
    ), '[]'::JSONB),

    -- ── Daily purchases ──
    'daily_purchases', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.date)
      FROM (
        SELECT created_at::DATE AS date, SUM(total) AS total
        FROM purchases
        WHERE business_id = p_business_id
          AND created_at >= v_from AND created_at < v_to
          AND (p_store_id IS NULL OR store_id = p_store_id)
        GROUP BY created_at::DATE
      ) r
    ), '[]'::JSONB),

    -- ── Daily expenses ──
    'daily_expenses', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.date)
      FROM (
        SELECT date::DATE AS date, SUM(amount) AS total
        FROM expenses
        WHERE business_id = p_business_id
          AND date::DATE >= p_from AND date::DATE <= p_to
          AND (p_store_id IS NULL OR store_id = p_store_id)
        GROUP BY date::DATE
      ) r
    ), '[]'::JSONB),

    -- ── Expenses by category ──
    'expenses_by_category', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.total DESC)
      FROM (
        SELECT category, SUM(amount) AS total
        FROM expenses
        WHERE business_id = p_business_id
          AND date::DATE >= p_from AND date::DATE <= p_to
          AND (p_store_id IS NULL OR store_id = p_store_id)
        GROUP BY category
      ) r
    ), '[]'::JSONB),

    -- ── Payment methods ──
    'payment_methods', COALESCE((
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT payment_method AS method, SUM(total) AS total, COUNT(*) AS count
        FROM tickets
        WHERE business_id = p_business_id AND status = 'ACTIVE'
          AND created_at >= v_from AND created_at < v_to
          AND (p_store_id IS NULL OR store_id = p_store_id)
        GROUP BY payment_method
      ) r
    ), '[]'::JSONB),

    -- ── Top products (top 10 by revenue) ──
    'top_products', COALESCE((
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT ti.product_name AS name, SUM(ti.subtotal) AS revenue, SUM(ti.quantity) AS qty
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id AND t.business_id = ti.business_id
        WHERE ti.business_id = p_business_id AND t.status = 'ACTIVE'
          AND t.created_at >= v_from AND t.created_at < v_to
          AND (p_store_id IS NULL OR t.store_id = p_store_id)
        GROUP BY ti.product_name
        ORDER BY revenue DESC
        LIMIT 10
      ) r
    ), '[]'::JSONB)

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Storage: photos bucket ───────────────────────────────────────────────────
-- Stores compressed thumbnails for cloud backup & web portal.
-- Path convention: {business_id}/products/{id}.jpg
--                  {business_id}/users/{id}.jpg
--                  {business_id}/stores/{id}.jpg

INSERT INTO
    storage.buckets (id, name, public)
VALUES ('photos', 'photos', true) ON CONFLICT (id) DO NOTHING;

-- Anyone can read (public thumbnails for web portal)
CREATE POLICY "photos_public_read" ON storage.objects FOR
SELECT USING (bucket_id = 'photos');

-- App can upload/update/delete via anon key
CREATE POLICY "photos_app_write" ON storage.objects FOR
INSERT
WITH
    CHECK (bucket_id = 'photos');

CREATE POLICY "photos_app_update" ON storage.objects FOR
UPDATE USING (bucket_id = 'photos');

CREATE POLICY "photos_app_delete" ON storage.objects FOR DELETE USING (bucket_id = 'photos');