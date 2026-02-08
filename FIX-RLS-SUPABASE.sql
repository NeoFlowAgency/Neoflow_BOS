-- =============================================================
-- FIX RLS POLICIES - NeoFlow BOS
-- Corrects infinite recursion on workspace_users
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================================

-- =============================================
-- STEP 1: DROP ALL EXISTING POLICIES
-- =============================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
        RAISE NOTICE 'Dropped policy % on %', pol.policyname, pol.tablename;
    END LOOP;
END $$;

-- =============================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE public.workspace_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 3: WORKSPACE_USERS (the critical table)
-- Uses user_id = auth.uid() directly - NO recursion
-- =============================================
CREATE POLICY "workspace_users_select"
  ON public.workspace_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "workspace_users_insert"
  ON public.workspace_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "workspace_users_update"
  ON public.workspace_users FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "workspace_users_delete"
  ON public.workspace_users FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- STEP 4: WORKSPACES
-- =============================================
CREATE POLICY "workspaces_select"
  ON public.workspaces FOR SELECT
  USING (id IN (
    SELECT workspace_id FROM public.workspace_users
    WHERE user_id = auth.uid()
  ));

-- Any authenticated user can create a workspace
CREATE POLICY "workspaces_insert"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "workspaces_update"
  ON public.workspaces FOR UPDATE
  USING (id IN (
    SELECT workspace_id FROM public.workspace_users
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "workspaces_delete"
  ON public.workspaces FOR DELETE
  USING (id IN (
    SELECT workspace_id FROM public.workspace_users
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- =============================================
-- STEP 5: TABLES WITH workspace_id COLUMN
-- Pattern: workspace_id must belong to user
-- =============================================

-- CUSTOMERS
CREATE POLICY "customers_select" ON public.customers FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- PRODUCTS
CREATE POLICY "products_select" ON public.products FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "products_insert" ON public.products FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "products_update" ON public.products FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "products_delete" ON public.products FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- INVOICES
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- QUOTES
CREATE POLICY "quotes_select" ON public.quotes FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- DELIVERIES
CREATE POLICY "deliveries_select" ON public.deliveries FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "deliveries_insert" ON public.deliveries FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "deliveries_update" ON public.deliveries FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "deliveries_delete" ON public.deliveries FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- JOBS
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- PAYMENT_REMINDERS
CREATE POLICY "payment_reminders_select" ON public.payment_reminders FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "payment_reminders_insert" ON public.payment_reminders FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "payment_reminders_update" ON public.payment_reminders FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));
CREATE POLICY "payment_reminders_delete" ON public.payment_reminders FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid()));

-- =============================================
-- STEP 6: CHILD TABLES (no workspace_id)
-- Access through parent table relationship
-- =============================================

-- INVOICE_ITEMS (via invoices.workspace_id)
CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM public.invoices
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "invoice_items_insert" ON public.invoice_items FOR INSERT
  WITH CHECK (invoice_id IN (
    SELECT id FROM public.invoices
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "invoice_items_update" ON public.invoice_items FOR UPDATE
  USING (invoice_id IN (
    SELECT id FROM public.invoices
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "invoice_items_delete" ON public.invoice_items FOR DELETE
  USING (invoice_id IN (
    SELECT id FROM public.invoices
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));

-- QUOTE_ITEMS (via quotes.workspace_id)
CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT
  USING (quote_id IN (
    SELECT id FROM public.quotes
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "quote_items_insert" ON public.quote_items FOR INSERT
  WITH CHECK (quote_id IN (
    SELECT id FROM public.quotes
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE
  USING (quote_id IN (
    SELECT id FROM public.quotes
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE
  USING (quote_id IN (
    SELECT id FROM public.quotes
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));

-- CLIENT_INTERACTIONS (via customers.workspace_id)
CREATE POLICY "client_interactions_select" ON public.client_interactions FOR SELECT
  USING (customer_id IN (
    SELECT id FROM public.customers
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "client_interactions_insert" ON public.client_interactions FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT id FROM public.customers
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "client_interactions_update" ON public.client_interactions FOR UPDATE
  USING (customer_id IN (
    SELECT id FROM public.customers
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));
CREATE POLICY "client_interactions_delete" ON public.client_interactions FOR DELETE
  USING (customer_id IN (
    SELECT id FROM public.customers
    WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_users WHERE user_id = auth.uid())
  ));

-- =============================================
-- DONE! Verify by running:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
-- =============================================
