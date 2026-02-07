-- ============================================================
-- NeoFlow BOS - Supabase Functions
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Generate next invoice number for a workspace
-- Format: {SLUG}-FACT-{YEAR}-{NNN}
-- Example: MDLL-FACT-2026-001
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_workspace_id uuid, p_year int)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text;
  v_count int;
  v_number text;
BEGIN
  -- Get workspace slug
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN
    v_slug := 'WS';
  END IF;

  -- Count existing invoices for this workspace and year
  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  -- Format number
  v_number := UPPER(v_slug) || '-FACT-' || p_year::text || '-' || LPAD(v_count::text, 3, '0');

  RETURN v_number;
END;
$$;

-- 2. Generate next quote number for a workspace
-- Format: {SLUG}-DEV-{YEAR}-{NNN}
-- Example: MDLL-DEV-2026-001
CREATE OR REPLACE FUNCTION get_next_quote_number(p_workspace_id uuid, p_year int)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text;
  v_count int;
  v_number text;
BEGIN
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN
    v_slug := 'WS';
  END IF;

  SELECT COUNT(*) + 1 INTO v_count
  FROM quotes
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  v_number := UPPER(v_slug) || '-DEV-' || p_year::text || '-' || LPAD(v_count::text, 3, '0');

  RETURN v_number;
END;
$$;

-- 3. Convert a quote to an invoice (atomic operation)
CREATE OR REPLACE FUNCTION convert_quote_to_invoice(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_quote record;
  v_invoice_number text;
  v_invoice_id uuid;
BEGIN
  -- Get the quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  IF v_quote.status = 'converted' THEN
    RAISE EXCEPTION 'Quote already converted: %', p_quote_id;
  END IF;

  -- Generate invoice number
  SELECT get_next_invoice_number(v_quote.workspace_id, EXTRACT(YEAR FROM NOW())::int)
  INTO v_invoice_number;

  -- Create the invoice
  INSERT INTO invoices (
    workspace_id, customer_id, created_by, invoice_number,
    invoice_type, status, discount_global,
    subtotal_ht, total_tva, total_ttc,
    validity_days, notes, converted_from_quote_id
  )
  VALUES (
    v_quote.workspace_id, v_quote.customer_id, v_quote.created_by, v_invoice_number,
    'facture', 'brouillon', v_quote.discount_global,
    v_quote.subtotal_ht, v_quote.total_tva, v_quote.total_ttc,
    30, v_quote.notes, p_quote_id
  )
  RETURNING id INTO v_invoice_id;

  -- Copy quote items to invoice items
  INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position)
  SELECT v_invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position
  FROM quote_items
  WHERE quote_id = p_quote_id;

  -- Update quote status
  UPDATE quotes
  SET status = 'converted',
      converted_to_invoice_id = v_invoice_id,
      converted_at = NOW()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number
  );
END;
$$;
