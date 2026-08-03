export type UserRole = "hq_admin" | "bkk_manager" | "country_manager" | "supplier";

export const ROLE_LABELS: Record<UserRole, string> = {
  hq_admin: "HQ Admin",
  bkk_manager: "BKK Manager",
  country_manager: "Country Manager",
  supplier: "Supplier",
};

// Zones each role can see. `null` means "all zones" (HQ Admin) or
// "resolved dynamically from supplier_id" (Supplier).
//
// This is only the DEMO-MODE fallback (used when Supabase isn't configured,
// via the "view as" switcher). Real logins get their zones from each user's
// own `profiles.assigned_zones` row instead (see src/lib/profile.ts) — kept
// here in sync with the real assignment so demo mode matches production:
// BKK Manager covers 511/512/513/550, Country Manager covers 520/530/540/560.
export const ROLE_ZONES: Record<UserRole, string[] | null> = {
  hq_admin: null,
  bkk_manager: ["511", "512", "513", "550"],
  country_manager: ["520", "530", "540", "560"],
  supplier: null,
};

// Sidebar route -> roles allowed to view it.
//
// bkk_manager / country_manager get the same "/dashboard" everyone else
// does (merged with the old standalone "/status" page — same underlying
// data, just was two separate pages with diverging numbers before, which
// was confusing). They still don't get Asset Register (technical NVR/HDD
// details), Maintenance, Audit, Reports, or Settings — those stay HQ Admin
// (+ Supplier where noted) only, both at the UI level and via RLS.
export const ROUTE_ACCESS: Record<string, UserRole[]> = {
  "/dashboard": ["hq_admin", "bkk_manager", "country_manager"],
  "/store-list": ["hq_admin", "bkk_manager", "country_manager"],
  "/recovery": ["hq_admin", "bkk_manager", "country_manager"],
  "/assets": ["hq_admin", "supplier"],
  "/live-access": ["hq_admin", "bkk_manager", "country_manager", "supplier"],
  "/maintenance": ["hq_admin", "supplier"],
  "/audit": ["hq_admin"],
  "/reports": ["hq_admin"],
  "/reports/import": ["hq_admin"],
  "/settings": ["hq_admin"],
};

// Where to land each role right after login / when they hit a page their
// role isn't allowed to see. Keep in sync with ROUTE_ACCESS above.
export const DEFAULT_ROUTE_BY_ROLE: Record<UserRole, string> = {
  hq_admin: "/dashboard",
  bkk_manager: "/dashboard",
  country_manager: "/dashboard",
  supplier: "/maintenance",
};

export function canAccessRoute(pathname: string, role: UserRole): boolean {
  const match = Object.keys(ROUTE_ACCESS)
    .sort((a, b) => b.length - a.length)
    .find((r) => pathname === r || pathname.startsWith(r + "/"));
  if (!match) return true;
  return ROUTE_ACCESS[match].includes(role);
}

// Master-data write permission (stores / assets / users / suppliers).
export function canManageMasterData(role: UserRole): boolean {
  return role === "hq_admin";
}

// Maintenance-activity write permission (suppliers can log repairs).
export function canLogMaintenance(role: UserRole): boolean {
  return role === "hq_admin" || role === "bkk_manager" || role === "country_manager" || role === "supplier";
}
