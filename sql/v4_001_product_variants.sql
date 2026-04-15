-- ============================================================
-- NeoFlow BOS V4 - Migration 001: Variantes produits
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Colonnes literie sur products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS eco_participation_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_years INT DEFAULT 0;

-- 2. Table product_variants
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(20) NOT NULL,             -- ex: "160x200"
  comfort VARCHAR(30),                   -- ex: "medium", "ferme", "souple"
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  sku_supplier VARCHAR(100),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS product_variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_variants_select" ON product_variants;
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "product_variants_insert" ON product_variants;
CREATE POLICY "product_variants_insert" ON product_variants FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
        AND role IN ('proprietaire', 'manager', 'vendeur')
    )
    AND product_id IN (
      SELECT id FROM products WHERE workspace_id = product_variants.workspace_id
    )
  );

DROP POLICY IF EXISTS "product_variants_update" ON product_variants;
CREATE POLICY "product_variants_update" ON product_variants FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

DROP POLICY IF EXISTS "product_variants_delete" ON product_variants;
CREATE POLICY "product_variants_delete" ON product_variants FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 4. Extension stock_levels pour variantes
ALTER TABLE stock_levels ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- 5. Extension order_items pour variantes + éco-participation
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS eco_participation DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS eco_participation_tva_rate DECIMAL(5,2) DEFAULT 20;

-- 6. Index utiles
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_workspace_id ON product_variants(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_variant_id ON stock_levels(variant_id);
