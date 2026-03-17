# Security Fixes & Mobile Adaptation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical security/stability issues then fully adapt NeoFlow BOS for mobile with app-native feel.

**Architecture:** Phase 1 patches XSS, hardcoded admin emails, missing error boundary, and overly permissive CORS. Phase 2 adds PWA support, redesigns forms/lists/settings for mobile-first, and polishes touch interactions.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, Supabase Edge Functions (Deno), DOMPurify

---

## Chunk 1: Phase 1 — Security & Stability Fixes

### Task 1: Fix XSS in NeoChat (DOMPurify)

**Files:**
- Modify: `src/components/NeoChat.jsx:32,37,44-49`
- Install: `dompurify` npm package

- [ ] **Step 1: Install DOMPurify**
```bash
npm install dompurify
```

- [ ] **Step 2: Import DOMPurify and sanitize inlineFormat output**

In `src/components/NeoChat.jsx`, add import at top:
```javascript
import DOMPurify from 'dompurify'
```

Modify `inlineFormat` function (lines 44-49) to sanitize output:
```javascript
function inlineFormat(text) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-700">$1</code>')
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'code'], ALLOWED_ATTR: ['class'] })
}
```

- [ ] **Step 3: Verify app still renders NeoChat correctly**

- [ ] **Step 4: Commit**
```bash
git add src/components/NeoChat.jsx package.json package-lock.json
git commit -m "fix(security): sanitize NeoChat HTML output with DOMPurify to prevent XSS"
```

---

### Task 2: Replace Hardcoded Admin Emails with app_metadata Flag

**Files:**
- Create: `sql/v7_001_internal_admin_flag.sql`
- Modify: `src/App.jsx:47-49,88`

- [ ] **Step 1: Create SQL migration to set app_metadata for admin users**

Create `sql/v7_001_internal_admin_flag.sql`:
```sql
-- Set is_internal_admin flag in app_metadata for internal users
-- This is only settable server-side (not from client SDK)
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_internal_admin": true}'::jsonb
WHERE email IN ('neoflowagency05@gmail.com', 'gnoakim05@gmail.com');
```

- [ ] **Step 2: Replace hardcoded emails in App.jsx**

Remove lines 46-49 (ADMIN_EMAIL, DEV_EMAIL, isInternalUser) and replace with:
```javascript
const isInternalUser = (user) => user?.app_metadata?.is_internal_admin === true
```

Update line 88 to pass `user` object instead of `user?.email`:
```javascript
if (requireWorkspace && currentWorkspace && !currentWorkspace.is_active && !allowSuspended && !isInternalUser(user)) {
```

- [ ] **Step 3: Commit**
```bash
git add src/App.jsx sql/v7_001_internal_admin_flag.sql
git commit -m "fix(security): replace hardcoded admin emails with app_metadata flag"
```

---

### Task 3: Add React Error Boundary

**Files:**
- Create: `src/components/ErrorBoundary.jsx`
- Modify: `src/App.jsx` (wrap routes)

- [ ] **Step 1: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.jsx` with:
- Class component (required for componentDidCatch)
- French error message
- Retry button that resets state
- Styled with Tailwind (centered, branded)

- [ ] **Step 2: Wrap Layout and public routes in ErrorBoundary in App.jsx**

Import ErrorBoundary and wrap the Routes content.

- [ ] **Step 3: Commit**
```bash
git add src/components/ErrorBoundary.jsx src/App.jsx
git commit -m "fix(stability): add React Error Boundary with French fallback UI"
```

---

### Task 4: Restrict CORS on Edge Functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Modify: 9 edge function `index.ts` files (all except stripe-webhook)

- [ ] **Step 1: Create shared CORS utility**

Create `supabase/functions/_shared/cors.ts`:
```typescript
const ALLOWED_ORIGINS = [
  'https://bos.neoflow-agency.cloud',
  'https://neoflow-2zyxhnw6g-neoflow-agencys-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
```

- [ ] **Step 2: Update all 9 edge functions to use shared CORS**

Replace static `corsHeaders` object with dynamic `getCorsHeaders(req)` in:
- accept-invitation/index.ts
- admin-data/index.ts
- create-checkout/index.ts
- create-portal-session/index.ts
- delete-account/index.ts
- generate-pdf/index.ts
- neo-chat/index.ts
- send-email/index.ts
- verify-checkout/index.ts

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/
git commit -m "fix(security): restrict CORS to production domain only"
```

---

## Chunk 2: Phase 2A — PWA Setup & Form Pages Mobile

### Task 5: PWA Manifest & Meta Tags

**Files:**
- Modify: `index.html`
- Create: `public/manifest.json`

- [ ] **Step 1: Add PWA meta tags to index.html**

Add after line 6 (viewport meta):
- theme-color (#040741)
- apple-mobile-web-app-capable
- apple-mobile-web-app-status-bar-style (black-translucent for fullscreen feel)
- viewport-fit=cover on existing viewport meta
- manifest link
- apple-touch-icon

- [ ] **Step 2: Create manifest.json**

Create `public/manifest.json` with:
- name: "NeoFlow BOS"
- short_name: "NeoFlow"
- start_url: "/dashboard"
- display: "standalone"
- theme_color: "#040741"
- background_color: "#040741"
- icons: reference existing logo

- [ ] **Step 3: Commit**
```bash
git add index.html public/manifest.json
git commit -m "feat(pwa): add web app manifest and meta tags for native feel"
```

---

### Task 6: Mobile Redesign — CreerFacture.jsx

**Files:**
- Modify: `src/pages/CreerFacture.jsx:398-479,495,594-655`

- [ ] **Step 1: Convert line items from grid-cols-12 to mobile cards**

Lines 398-479: Replace `hidden md:grid grid-cols-12` headers and `grid-cols-1 md:grid-cols-12` items with:
- Mobile: stacked card layout with labeled fields
- Desktop: keep existing grid layout
- Use `md:hidden` / `hidden md:block` pattern

- [ ] **Step 2: Make action buttons sticky on mobile**

Lines 594-655: Wrap submit/action buttons in:
```jsx
<div className="sticky bottom-0 bg-white border-t p-4 -mx-4 md:static md:border-0 md:p-0 md:mx-0">
```

- [ ] **Step 3: Commit**
```bash
git add src/pages/CreerFacture.jsx
git commit -m "feat(mobile): redesign CreerFacture line items and actions for mobile"
```

---

### Task 7: Mobile Redesign — CreerDevis.jsx

**Files:**
- Modify: `src/pages/CreerDevis.jsx:429-487,503`

- [ ] **Step 1: Apply same card-based line item pattern as CreerFacture**
- [ ] **Step 2: Make action buttons sticky on mobile**
- [ ] **Step 3: Commit**

---

### Task 8: Mobile Redesign — CreerCommande.jsx

**Files:**
- Modify: `src/pages/CreerCommande.jsx` (similar grid patterns)

- [ ] **Step 1: Apply same card-based line item pattern**
- [ ] **Step 2: Sticky action buttons**
- [ ] **Step 3: Commit**

---

## Chunk 3: Phase 2B — Lists, Settings, & Polish

### Task 9: Mobile Polish — ListeFactures.jsx & ListeDevis.jsx

**Files:**
- Modify: `src/pages/ListeFactures.jsx:140-198`
- Modify: `src/pages/ListeDevis.jsx:142-200`

- [ ] **Step 1: Improve mobile card layout in ListeFactures**

Lines 157-171 already have `md:hidden` mobile layout. Improve it with:
- Better visual hierarchy (amount prominent, status badge)
- Touch-friendly tap target (entire card clickable)
- Swipe hint or action menu

- [ ] **Step 2: Apply same improvements to ListeDevis**
- [ ] **Step 3: Commit**

---

### Task 10: Mobile Polish — Settings.jsx Tab Navigation

**Files:**
- Modify: `src/pages/Settings.jsx` (tab section)

- [ ] **Step 1: Make tabs horizontally scrollable on mobile**

Convert tab navigation to horizontal scroll with:
- `overflow-x-auto scrollbar-hide` on mobile
- `snap-x snap-mandatory` for snap scrolling
- Active tab indicator
- Full-width content area below

- [ ] **Step 2: Commit**

---

### Task 11: Mobile Polish — Livraisons Kanban

**Files:**
- Modify: `src/pages/Livraisons.jsx:462`

- [ ] **Step 1: Make kanban horizontally scrollable on mobile**

Line 462: Change from `grid grid-cols-1 lg:grid-cols-4` to:
- Mobile: horizontal scroll with `flex overflow-x-auto snap-x snap-mandatory gap-4`
- Each column: `min-w-[280px] snap-center`
- Desktop: keep grid layout

- [ ] **Step 2: Commit**

---

### Task 12: Quick Fixes (PhoneInput, Produits)

**Files:**
- Modify: `src/components/ui/PhoneInput.jsx:100`
- Modify: `src/pages/Produits.jsx:251`

- [ ] **Step 1: Fix PhoneInput dropdown width**
Line 100: Change `w-72` to `w-full sm:w-72`

- [ ] **Step 2: Fix Produits grid responsive logic**
Ensure proper responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

- [ ] **Step 3: Commit**

---

### Task 13: Global Mobile Polish

**Files:**
- Modify: `src/index.css`
- Modify: various modal components across pages

- [ ] **Step 1: Add global mobile utilities to index.css**
- Hide scrollbars on horizontal scroll: `.scrollbar-hide`
- Smooth scroll behavior
- Touch-action utilities
- Safe area padding utilities

- [ ] **Step 2: Ensure all modals use bottom-sheet pattern on mobile**
- Full-width on mobile
- Slide-up animation
- Max-height with scroll
- Backdrop blur

- [ ] **Step 3: Final commit**
