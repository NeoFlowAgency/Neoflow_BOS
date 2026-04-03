-- Migration v9_004_orders_deposit.sql
-- Ajoute les champs d'acompte sur la table orders
-- Nécessaire pour que la conversion devis → commande conserve l'info d'acompte du devis

ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(10) DEFAULT 'percent'
  CHECK (deposit_type IN ('percent', 'euro'));

-- Mettre à jour la RPC convert_quote_to_order pour copier l'acompte du devis
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
    RAISE EXCEPTION 'Ce devis a déjà été converti';
  END IF;

  SELECT (get_next_order_number(v_quote.workspace_id, EXTRACT(YEAR FROM NOW())::INT))->>'order_number'
  INTO v_order_number;

  INSERT INTO orders (
    workspace_id, customer_id, order_number, order_type, status, source, quote_id,
    subtotal_ht, total_tva, total_ttc, discount_global, notes, created_by,
    deposit_amount, deposit_type,
    requires_delivery, delivery_type
  ) VALUES (
    v_quote.workspace_id, v_quote.customer_id, v_order_number, 'standard', 'confirme',
    'from_quote', p_quote_id,
    v_quote.subtotal_ht, v_quote.total_tva, v_quote.total_ttc,
    COALESCE(v_quote.discount_global, 0), v_quote.notes, v_quote.created_by,
    COALESCE(v_quote.deposit_amount, 0), COALESCE(v_quote.deposit_type, 'percent'),
    COALESCE(v_quote.requires_delivery, FALSE), COALESCE(v_quote.delivery_type, 'none')
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

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'deposit_amount', COALESCE(v_quote.deposit_amount, 0),
    'deposit_type', COALESCE(v_quote.deposit_type, 'percent'),
    'total_ttc', v_quote.total_ttc
  );
END;
$$;

-- S'assurer que les colonnes requires_delivery et delivery_type existent sur quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS requires_delivery BOOLEAN DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'none'
  CHECK (delivery_type IN ('delivery', 'pickup', 'none'));
