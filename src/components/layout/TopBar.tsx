"use client";

import Image from "next/image";
import { Menu, Sun, Moon, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { useAppData, ROLE_LABELS } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ZONES, SUPPLIERS } from "@/lib/mockData";
import type { UserRole } from "@/lib/rbac";

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { dark, toggle } = useTheme();
  const { role, setRole, filters, setFilters, isDemoMode } = useAppData();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    if (isSupabaseConfigured) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 bg-white/95 dark:bg-surface-dark/95 backdrop-blur border-b border-black/5 dark:border-white/10">
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3">
        <button onClick={onMenuClick} className="lg:hidden text-ink-soft dark:text-white/70">
          <Menu size={20} />
        </button>

        <Image src="/logo-bata.svg" alt="BATA" width={110} height={30} priority />
        <div className="hidden md:block h-6 w-px bg-black/10 dark:bg-white/10 mx-1" />
        <div className="hidden md:block font-display font-semibold text-sm text-ink dark:text-white">
          CCTV Command Center
        </div>

        <div className="flex-1" />

        <div className="hidden xl:flex items-center gap-2 mr-2">
          <Select value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={["Bangkok", "Upcountry"]} placeholder="Region" />
          <Select value={filters.zone} onChange={(v) => setFilters({ ...filters, zone: v })} options={ZONES.map((z) => z.code)} placeholder="Zone" />
          <Select value={filters.supplier} onChange={(v) => setFilters({ ...filters, supplier: v })} options={SUPPLIERS} placeholder="Supplier" />
          <Select value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={["Healthy", "Partial", "Offline", "Unknown"]} placeholder="Status" />
        </div>

        <button
          onClick={toggle}
          className="w-8 h-8 rounded-md flex items-center justify-center text-ink-soft dark:text-white/70 hover:bg-surface-muted dark:hover:bg-white/5"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-md hover:bg-surface-muted dark:hover:bg-white/5"
          >
            <div className="w-7 h-7 rounded-full bg-brand-50 text-brand flex items-center justify-center text-xs font-semibold">
              {ROLE_LABELS[role][0]}
            </div>
            <span className="hidden sm:block text-xs font-medium text-ink dark:text-white">{ROLE_LABELS[role]}</span>
            <ChevronDown size={13} className="text-ink-faint" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-md shadow-card p-2 text-sm">
              {isDemoMode && (
                <div className="mb-2">
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-ink-faint">Demo: view as</div>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRole(r);
                        setMenuOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded ${r === role ? "bg-brand-50 text-brand font-medium" : "hover:bg-surface-muted dark:hover:bg-white/5"}`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                  <div className="my-2 h-px bg-black/5 dark:bg-white/10" />
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-brand hover:bg-brand-50"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
