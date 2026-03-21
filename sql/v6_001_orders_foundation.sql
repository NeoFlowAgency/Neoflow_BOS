-- ============================================================
-- NeoFlow BOS v6.001 - Orders Foundation Migration
-- Architecture order-centric + stock + fournisseurs + paiements
-- Executez dans le SQL Editor Supabase
-- ============================================================

-- ============================================================
-- PART 1: ENHANCED PRODUCTS
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS reference VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_ht NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_sheet TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Reference unique par workspace (NULL autorise pour produits sans reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_reference_workspace
  ON products(workspace_id, reference)
  WHERE reference IS NOT NULL;

-- ============================================================
-- PART 2: ORDERS TABLE (entite centrale)
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_number VARCHAR(50),
  order_type VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (order_type IN ('quick_sale', 'standard')),
  status VARCHAR(30) NOT NULL DEFAULT 'brouillon'
    CHECK (status IN ('brouillon', 'confirme', 'en_cours', 'livre', 'termine', 'annule')),
  source VARCHAR(20) NOT NULL DEFAULT 'direct'
    CHECK (source IN ('direct', 'from_quote')),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  -- Financials
  subtotal_ht NUMERIC(12,2) DEFAULT 0,
  total_tva NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,
  discount_global NUMERIC(12,2) DEFAULT 0,
  discount_type VARCHAR(10) DEFAULT 'percent'
    CHECK (discount_type IN ('percent', 'euro')),
  amount_paid NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2) DEFAULT 0,

  -- Delivery
  requires_delivery BOOLEAN DEFAULT FALSE,
  delivery_type VARCHAR(20) DEFAULT 'none'
    CHECK (delivery_type IN ('delivery', 'pickup', 'none')),

  -- Meta
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_workspace ON orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(workspace_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "orders_delete" ON orders FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 3: ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ht NUMERIC(12,2) NOT NULL,
  cost_price_ht NUMERIC(12,2),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 20,
  discount_item NUMERIC(12,2) DEFAULT 0,
  discount_item_type VARCHAR(10) DEFAULT 'percent'
    CHECK (discount_item_type IN ('percent', 'euro')),
  total_ht NUMERIC(12,2) NOT NULL,
  position INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "order_items_insert" ON order_items FOR INSERT
  WITH CHECK (order_id IN (
    SELECT id FROM orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "order_items_update" ON order_items FOR UPDATE
  USING (order_id IN (
    SELECT id FROM orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "order_items_delete" ON order_items FOR DELETE
  USING (order_id IN (
    SELECT id FROM orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

-- ============================================================
-- PART 4: PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'full'
    CHECK (payment_type IN ('deposit', 'partial', 'balance', 'full')),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'card', 'check', 'transfer', 'other')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(workspace_id, payment_date DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "payments_insert" ON payments FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "payments_update" ON payments FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "payments_delete" ON payments FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 5: STOCK LOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'store'
    CHECK (type IN ('store', 'warehouse', 'display')),
  address TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_locations_workspace ON stock_locations(workspace_id);

ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_locations_select" ON stock_locations FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "stock_locations_insert" ON stock_locations FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "stock_locations_update" ON stock_locations FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "stock_locations_delete" ON stock_locations FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 6: STOCK LEVELS
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_workspace ON stock_levels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_location ON stock_levels(location_id);

ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_levels_select" ON stock_levels FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "stock_levels_insert" ON stock_levels FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "stock_levels_update" ON stock_levels FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "stock_levels_delete" ON stock_levels FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 7: STOCK MOVEMENTS (audit trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL
    CHECK (movement_type IN ('in', 'out', 'transfer_in', 'transfer_out', 'adjustment', 'reservation', 'unreservation')),
  quantity INTEGER NOT NULL,
  reference_type VARCHAR(30)
    CHECK (reference_type IN ('order', 'purchase_order', 'adjustment', 'transfer', 'initial')),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_workspace ON stock_movements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(workspace_id, created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

-- ============================================================
-- PART 8: SUPPLIERS
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'France',
  notes TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON suppliers(workspace_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 9: PURCHASE ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  po_number VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'brouillon'
    CHECK (status IN ('brouillon', 'envoye', 'confirme', 'reception_partielle', 'recu', 'annule')),
  expected_date DATE,
  received_date DATE,
  total_ht NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace ON purchase_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(workspace_id, status);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "purchase_orders_delete" ON purchase_orders FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- ============================================================
-- PART 10: PURCHASE ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost_ht NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 20,
  total_ht NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_items_select" ON purchase_order_items FOR SELECT
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "po_items_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

CREATE POLICY "po_items_update" ON purchase_order_items FOR UPDATE
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

CREATE POLICY "po_items_delete" ON purchase_order_items FOR DELETE
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

-- ============================================================
-- PART 11: PRODUCT-SUPPLIER LINK
-- ============================================================

CREATE TABLE IF NOT EXISTS product_suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_reference VARCHAR(100),
  supplier_cost_ht NUMERIC(12,2),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, supplier_id)
);

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_suppliers_select" ON product_suppliers FOR SELECT
  USING (product_id IN (
    SELECT id FROM products WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "product_suppliers_insert" ON product_suppliers FOR INSERT
  WITH CHECK (product_id IN (
    SELECT id FROM products WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

CREATE POLICY "product_suppliers_update" ON product_suppliers FOR UPDATE
  USING (product_id IN (
    SELECT id FROM products WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

CREATE POLICY "product_suppliers_delete" ON product_suppliers FOR DELETE
  USING (product_id IN (
    SELECT id FROM products WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
    )
  ));

-- ============================================================
-- PART 12: DOCUMENTATION ARTICLES
-- ============================================================

CREATE TABLE IF NOT EXISTS documentation_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  position INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_category ON documentation_articles(category, position);
CREATE INDEX IF NOT EXISTS idx_docs_slug ON documentation_articles(slug);

ALTER TABLE documentation_articles ENABLE ROW LEVEL SECURITY;

-- Documentation lisible par tous les utilisateurs authentifies
CREATE POLICY "docs_select" ON documentation_articles FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = TRUE);

-- Seul le service_role peut gerer les articles (via SQL direct ou Edge Function)
-- Pas de INSERT/UPDATE/DELETE policies pour les utilisateurs normaux

-- ============================================================
-- PART 13: MODIFY DELIVERIES TABLE
-- ============================================================

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'delivery';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS time_slot VARCHAR(30);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_fees NUMERIC(12,2) DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- Ajout CHECK sur delivery_type (seulement si pas deja present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_delivery_type_check'
  ) THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_delivery_type_check
      CHECK (delivery_type IN ('delivery', 'pickup'));
  END IF;
END$$;

-- Mise a jour contrainte statuts livraisons
-- D'abord supprimer l'ancienne contrainte AVANT de mettre a jour les valeurs
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;

-- Ensuite mettre a jour les valeurs existantes
UPDATE deliveries SET status = 'a_planifier' WHERE status = 'en_cours';
UPDATE deliveries SET status = 'livree' WHERE status = 'finalise';
UPDATE deliveries SET status = 'annulee' WHERE status = 'annule';

-- Ajouter la nouvelle contrainte
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('a_planifier', 'planifiee', 'en_cours', 'livree', 'annulee'));

CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_assigned ON deliveries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(workspace_id, status);

-- ============================================================
-- PART 14: MODIFY INVOICES TABLE
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_category VARCHAR(20) DEFAULT 'standard';

-- Ajout CHECK sur invoice_category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_category_check'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_category_check
      CHECK (invoice_category IN ('standard', 'deposit', 'balance', 'quick_sale'));
  END IF;
END$$;

-- Mise a jour contrainte invoice_type pour inclure facture_simplifiee
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('facture', 'avoir', 'facture_simplifiee'));

CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

-- ============================================================
-- PART 15: SQL FUNCTIONS
-- ============================================================

-- Numerotation commandes : SLUG-CMD-YEAR-NNN
CREATE OR REPLACE FUNCTION get_next_order_number(p_workspace_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_slug TEXT;
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN v_slug := 'WS'; END IF;
  v_slug := UPPER(v_slug);

  SELECT COUNT(*) INTO v_count
  FROM orders
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  v_number := v_slug || '-CMD-' || p_year::TEXT || '-' || LPAD((v_count + 1)::TEXT, 3, '0');

  RETURN jsonb_build_object('order_number', v_number);
END;
$$;

-- Numerotation bons de commande fournisseur : SLUG-PO-YEAR-NNN
CREATE OR REPLACE FUNCTION get_next_po_number(p_workspace_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_slug TEXT;
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN v_slug := 'WS'; END IF;
  v_slug := UPPER(v_slug);

  SELECT COUNT(*) INTO v_count
  FROM purchase_orders
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  v_number := v_slug || '-PO-' || p_year::TEXT || '-' || LPAD((v_count + 1)::TEXT, 3, '0');

  RETURN jsonb_build_object('po_number', v_number);
END;
$$;

-- ============================================================
-- PART 16: TRIGGER - Auto-recalcul paiements commande
-- ============================================================

CREATE OR REPLACE FUNCTION update_order_payment_totals()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_total_paid NUMERIC;
  v_total_ttc NUMERIC;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE order_id = v_order_id;

  SELECT total_ttc INTO v_total_ttc
  FROM orders WHERE id = v_order_id;

  UPDATE orders SET
    amount_paid = v_total_paid,
    remaining_amount = GREATEST(COALESCE(v_total_ttc, 0) - v_total_paid, 0),
    updated_at = NOW()
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_order_payments ON payments;
CREATE TRIGGER trigger_update_order_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_order_payment_totals();

-- ============================================================
-- PART 17: TRIGGER - Auto-creation emplacement stock par defaut
-- ============================================================

CREATE OR REPLACE FUNCTION auto_create_default_stock_location()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO stock_locations (workspace_id, name, type, is_default)
  VALUES (NEW.id, 'Magasin', 'store', TRUE);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_stock_location ON workspaces;
CREATE TRIGGER trigger_auto_stock_location
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION auto_create_default_stock_location();

-- ============================================================
-- PART 18: FUNCTION - Conversion devis en commande
-- ============================================================

CREATE OR REPLACE FUNCTION convert_quote_to_order(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_order_number TEXT;
  v_order_id UUID;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;
  IF v_quote.status = 'converted' THEN
    RAISE EXCEPTION 'Ce devis a deja ete converti';
  END IF;

  SELECT (get_next_order_number(v_quote.workspace_id, EXTRACT(YEAR FROM NOW())::INT))->>'order_number'
  INTO v_order_number;

  INSERT INTO orders (
    workspace_id, customer_id, order_number, order_type, status, source, quote_id,
    subtotal_ht, total_tva, total_ttc, discount_global, notes, created_by
  ) VALUES (
    v_quote.workspace_id, v_quote.customer_id, v_order_number, 'standard', 'confirme',
    'from_quote', p_quote_id,
    v_quote.subtotal_ht, v_quote.total_tva, v_quote.total_ttc,
    COALESCE(v_quote.discount_global, 0), v_quote.notes, v_quote.created_by
  ) RETURNING id INTO v_order_id;

  -- Copier les lignes du devis dans les lignes commande
  INSERT INTO order_items (order_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position)
  SELECT v_order_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position
  FROM quote_items WHERE quote_id = p_quote_id;

  -- Snapshot des prix d'achat pour calcul marge
  UPDATE order_items oi SET cost_price_ht = p.cost_price_ht
  FROM products p WHERE oi.product_id = p.id AND oi.order_id = v_order_id;

  -- Marquer le devis comme converti
  UPDATE quotes SET status = 'converted', converted_at = NOW()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

-- ============================================================
-- PART 19: FUNCTION - Generation facture depuis commande
-- ============================================================

CREATE OR REPLACE FUNCTION generate_invoice_from_order(p_order_id UUID, p_invoice_category VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_invoice_number_result JSONB;
  v_invoice_number TEXT;
  v_invoice_id UUID;
  v_amount_ht NUMERIC;
  v_amount_tva NUMERIC;
  v_amount_ttc NUMERIC;
  v_invoice_type TEXT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;

  -- Generer le numero de facture
  SELECT get_next_invoice_number(v_order.workspace_id, EXTRACT(YEAR FROM NOW())::INT)
  INTO v_invoice_number_result;
  v_invoice_number := v_invoice_number_result->>'invoice_number';

  -- Determiner les montants selon le type de facture
  IF p_invoice_category = 'deposit' THEN
    v_amount_ttc := v_order.amount_paid;
    v_amount_ht := v_amount_ttc / (1 + 0.20); -- approximation, sera raffinee par les items
    v_amount_tva := v_amount_ttc - v_amount_ht;
  ELSIF p_invoice_category = 'balance' THEN
    v_amount_ttc := v_order.remaining_amount;
    v_amount_ht := v_amount_ttc / (1 + 0.20);
    v_amount_tva := v_amount_ttc - v_amount_ht;
  ELSE
    v_amount_ht := v_order.subtotal_ht;
    v_amount_tva := v_order.total_tva;
    v_amount_ttc := v_order.total_ttc;
  END IF;

  -- Type de facture
  IF v_order.order_type = 'quick_sale' THEN
    v_invoice_type := 'facture_simplifiee';
  ELSE
    v_invoice_type := 'facture';
  END IF;

  INSERT INTO invoices (
    workspace_id, customer_id, created_by, invoice_number, invoice_type,
    invoice_category, order_id, status,
    subtotal_ht, total_tva, total_ttc, discount_global, notes,
    issue_date
  ) VALUES (
    v_order.workspace_id, v_order.customer_id, v_order.created_by,
    v_invoice_number, v_invoice_type,
    p_invoice_category, p_order_id, 'brouillon',
    v_amount_ht, v_amount_tva, v_amount_ttc,
    COALESCE(v_order.discount_global, 0), v_order.notes,
    CURRENT_DATE
  ) RETURNING id INTO v_invoice_id;

  -- Copier les lignes de commande dans les lignes facture
  INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position)
  SELECT v_invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position
  FROM order_items WHERE order_id = p_order_id;

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;

-- ============================================================
-- PART 20: BACKFILL - Creer emplacement stock par defaut pour workspaces existants
-- ============================================================

INSERT INTO stock_locations (workspace_id, name, type, is_default)
SELECT w.id, 'Magasin', 'store', TRUE
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM stock_locations sl WHERE sl.workspace_id = w.id AND sl.is_default = TRUE
);
