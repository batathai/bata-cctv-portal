-- ============================================================
-- Migration: fixes zone "550"'s region classification.
--
-- Zone 550 is administratively part of the BKK Manager's coverage (see
-- rbac.ts ROLE_ZONES and supabase/seed_managers_example.sql, both already
-- listing 511/512/513/550 together) even though its stores are
-- geographically in Chonburi/Rayong ("East" area). The `region` column had
-- drifted out of sync with that — application code in mockData.ts,
-- importWrite.ts, and importHistory.ts classified zone 550 as "Upcountry"
-- instead of "Bangkok". Those code paths are now fixed; this migration
-- corrects any existing rows already stored in the database.
--
-- Safe to run multiple times. Run this once in the Supabase SQL Editor.
-- ============================================================

update public.stores
set region = 'Bangkok'
where zone = '550' and region <> 'Bangkok';
