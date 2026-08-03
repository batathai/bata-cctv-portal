# BATA CCTV Command Center

Centralized CCTV asset, health-score, maintenance, and audit management portal for BATA Thailand
stores — built to scale from the 50-store pilot to 500+ stores.

**Stack:** Next.js 14 (App Router) · React · TypeScript · Tailwind CSS · Supabase (Postgres + Auth) · Cloudflare Pages

## What's included

| Requirement | Where |
|---|---|
| Import Excel/CSV **or a live Google Sheet link** (bulk update, column mapping, preview, history, rollback) | `/reports/import`, `src/components/import/`, `src/lib/importHistory.ts`, `src/app/api/import/google-sheet/route.ts` |
| Export PDF/Excel (Executive, Store Detail, Offline Store reports) | `/reports`, `src/lib/reports/exportPdf.ts`, `exportExcel.ts` |
| BATA red/white corporate theme, TopBar + Sidebar layout | `tailwind.config.ts`, `src/components/layout/` |
| Responsive design | Tailwind breakpoints throughout; sidebar collapses to a drawer on mobile |
| Role-based access control | `src/lib/rbac.ts`, `supabase/policies.sql`, enforced in `Sidebar.tsx` + middleware |
| Cloudflare Pages compatible | `next.config.mjs`, `wrangler.toml`, `@cloudflare/next-on-pages` |
| GitHub deployment ready | `.github/workflows/deploy.yml` |
| Supabase integration | `supabase/schema.sql`, `supabase/policies.sql`, `src/lib/supabase/` |
| Scales to 500+ stores | Indexed Postgres schema, paginated/virtualized-ready tables, zone-based RBAC |

## Demo mode

The app runs immediately with **no backend configured** — `npm run dev` shows a fully populated
50-store pilot dataset (deterministic mock data) so you can click through every screen, run
imports, and generate reports before Supabase is wired up. Once `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, every page automatically switches to live Supabase queries
(see `src/lib/data.ts`) — no UI code changes required.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values (optional for demo mode)
npm run dev
```

Open http://localhost:3000 — you'll land on `/dashboard`.

## 2. Importing from an existing Google Sheet

If store/asset data already lives in a Google Sheet, you don't need to export it first:

1. In Google Sheets: **Share → General access → Anyone with the link → Viewer**.
2. In the app, go to **Reports → Import Excel / CSV → From Google Sheet**, paste the sheet's URL
   (including `#gid=...` if you want a specific tab), and click **Fetch**.
3. It flows through the same column mapping, preview, and rollback steps as a normal file upload.

This works because `src/app/api/import/google-sheet/route.ts` fetches the sheet's CSV export
**server-side** (avoiding browser CORS issues) and hands it to the same parser used for uploaded
files. For sheets that are **not** publicly viewable, extend that route with a Google service
account (`googleapis` + a Sheets API key) instead of the public CSV export URL — the rest of the
import pipeline (mapping/preview/rollback) doesn't need to change.

**Importing into an empty database:** when the target table is `stores`, unmatched store codes
are **created as new stores** (not skipped) — so you can use this to populate `stores` from
scratch. `cctv_assets` rows require the store to exist first (they need a real `store_id`), so
import to `stores` before importing to `cctv_assets`. Supplier names are matched case-insensitively
against `suppliers.name` and created automatically if they don't exist yet.

**`maintenance_history` is different: it's a log, not a snapshot.** Every imported row becomes a
brand-new repair record — there's no "update" concept, since a store can have many repairs over
time. The store must already exist (matched by Store Code); rows with an unrecognized code are
skipped. Rollback deletes exactly the records that batch created.

## 3. Supabase setup

1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/policies.sql`.
   - **If your project was created before this note was added**, also run these migrations once,
     in order:
     - `supabase/migrations/001_cctv_assets_store_id_unique.sql` — unique constraint on
       `cctv_assets.store_id` needed by the bulk-import feature.
     - `supabase/migrations/002_store_address_and_camera_status.sql`
     - `supabase/migrations/003_maintenance_status_tracking.sql`
     - `supabase/migrations/004_manager_scope_restriction.sql` — **run this one even on existing
       projects.** It tightens `bkk_manager` / `country_manager` down to online/offline status +
       Hik-Connect access only (see below); without it, those roles could still read repair
       history, audit results, and NVR/HDD technical detail via the Supabase API directly, even
       though the UI doesn't show it to them.
3. Create a `profiles` row for each user (role: `hq_admin`, `bkk_manager`, `country_manager`, or
   `supplier`) linked to their `auth.users.id`.
   - `assigned_zones` is **required** for `bkk_manager`/`country_manager` — this is what scopes
     each manager to their own zone(s), e.g. `{511,512,513,550}` for the BKK Manager, `{520,530,540,560}`
     for the Country Manager. One row per manager, so each can have a different zone list.
   - `supplier_id` for `supplier` accounts (not provisioned yet in the current pilot).
4. Copy your Project URL and anon key into `.env.local` (or your Cloudflare Pages / GitHub Actions
   secrets — see below).
5. Optional: create a `cctv-attachments` Storage bucket for Module 13 (File Repository) photos/reports.

### What each role actually sees

| Role | Pages | Data scope |
|---|---|---|
| `hq_admin` | Everything | All zones, all tables |
| `bkk_manager` | Device Status, Live Access only | Online/offline + Hik-Connect for their `assigned_zones` |
| `country_manager` | Device Status, Live Access only | Online/offline + Hik-Connect for their `assigned_zones` |
| `supplier` | Asset Register, Maintenance, Live Access | Their assigned stores only (not provisioned yet) |

`bkk_manager` and `country_manager` intentionally do **not** get the full Dashboard (health score,
average cost), Asset Register (NVR/HDD technical fields), Maintenance, Audit, Reports, or Settings —
both at the UI level (route guard redirects them if they hit those URLs directly) and at the
database level (RLS in migration 004 blocks the underlying tables outright).

## 4. Deploying to Cloudflare Pages

**Via GitHub Actions (recommended):**

1. Push this repo to GitHub.
2. In your GitHub repo settings, add these secrets:
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Pages edit permission
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Push to `main` — `.github/workflows/deploy.yml` builds with `@cloudflare/next-on-pages` and
   deploys automatically.

**Manual deploy:**

```bash
npm run pages:build
npx wrangler pages deploy .vercel/output/static --project-name=bata-cctv-portal
```

## 5. Project structure

```
src/
  app/
    login/                     Supabase auth + demo-mode entry
    (portal)/                  authenticated shell (Sidebar + TopBar + RouteGuard)
      dashboard/                Module 1+2: Executive Dashboard & Health Score summary (hq_admin only)
      status/                    Lightweight online/offline list for bkk_manager / country_manager
      assets/[code]/             Module 3: Asset Register + store detail drawer-page (hq_admin/supplier)
      live-access/               Module 5: Hik-Connect / iVMS quick access
      maintenance/                Module 6: Maintenance History (hq_admin/supplier)
      audit/                       Module 7: Audit History (hq_admin only)
      reports/import/               Bulk CSV/Excel import wizard + history/rollback
      settings/                      HQ Admin: roles, suppliers
  components/
    layout/                    TopBar, Sidebar
    import/                    ImportWizard, ImportHistory
    reports/                   ExportButtons
    ui/                        Badge, Card, StatCard, SignalBars, Select
  lib/
    profile.ts                 fetches the signed-in user's real role + assigned_zones
    supabase/                  browser + server Supabase clients
    reports/                   Excel (SheetJS) + PDF (jsPDF) generators
    rbac.ts                    role → route/permission matrix
    importHistory.ts           column-mapping, preview, apply, rollback logic
    data.ts                    Supabase-first, mock-fallback data layer
    mockData.ts                deterministic 50-store demo dataset
supabase/
  schema.sql                   full table set (stores, assets, maintenance, audit, incidents, ...)
  policies.sql                 row-level security implementing the role matrix
```

## 6. Theme

Colors are defined once in `tailwind.config.ts` under the `brand` / `surface` / `ink` / `status`
keys (Primary `#D71920`, Secondary `#FFFFFF`, Accent `#333333`), so re-theming is a one-file change.
Dark mode is supported via the `dark:` variant and a toggle in the TopBar (`src/lib/theme.tsx`).

## 7. Next steps toward Phase 2 / 3

- Incident Management, Supplier Performance, Cost Analysis, Map View are scaffolded in the sidebar
  as locked "Roadmap" items — add routes under `src/app/(portal)/` the same way as existing modules.
- Swap `public/logo-bata.svg` for the official BATA logo asset.
- Wire Module 16 (Notification Center) to Supabase Edge Functions + Email/Teams/LINE webhooks.
- Add `generateStaticParams` or an edge API route for `/assets/[code]` if you need static export
  instead of the default Cloudflare Pages SSR mode.
