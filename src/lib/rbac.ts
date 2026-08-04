// Single-role deployment: only Bata IT staff use this portal, and everyone
// who logs in sees every zone/store with full access. Kept as a named type +
// guard functions (rather than deleting them outright) since callers still
// read `role` off the profile and gate a couple of write actions through
// canManageMasterData/canLogMaintenance — this just makes those checks
// unconditionally true instead of branching on a role that no longer varies.
export type UserRole = "hq_admin";

export const ROLE_LABELS: Record<UserRole, string> = {
  hq_admin: "HQ Admin",
};

export function canAccessRoute(_pathname: string, _role: UserRole): boolean {
  return true;
}

// Master-data write permission (stores / assets / users / suppliers).
export function canManageMasterData(_role: UserRole): boolean {
  return true;
}

// Maintenance-activity write permission (logging repairs).
export function canLogMaintenance(_role: UserRole): boolean {
  return true;
}
