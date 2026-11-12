"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AppDataProvider, useAppData } from "@/components/providers/AppDataProvider";
import { MonitoringProvider } from "@/components/providers/MonitoringProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { DashboardHero } from "@/components/dashboard/DashboardHero";

/**
 * Shown instead of the whole app shell when someone is genuinely logged in
 * via Supabase but has no matching `profiles` row. Without this, they'd see
 * a fully-rendered dashboard with every count silently at zero — Postgres
 * RLS doesn't error when a policy excludes all rows, it just returns an
 * empty result, which is easy to mistake for "no data has been imported yet".
 */
function AccountNotProvisioned({ email }: { email: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted dark:bg-surface-dark px-4">
      <div className="max-w-md w-full bg-white dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-card shadow-card p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 text-brand flex items-center justify-center mb-4">
          <ShieldAlert size={22} />
        </div>
        <h1 className="font-display text-lg font-bold text-ink dark:text-white mb-2">Account not yet provisioned</h1>
        <p className="text-sm text-ink-soft dark:text-white/60 mb-1">
          The account <span className="font-mono text-xs">{email}</span> signed in successfully, but has no profile/role set up yet.
        </p>
        <p className="text-sm text-ink-soft dark:text-white/60">
          Please contact your HQ Admin to add this account to the <span className="font-mono text-xs">profiles</span> table in Supabase with the correct role assigned.
        </p>
      </div>
    </div>
  );
}

function PortalShell({ children, onMenuClick }: { children: React.ReactNode; onMenuClick: () => void }) {
  const { accountNotProvisioned, unprovisionedEmail, isDemoMode } = useAppData();

  // Demo mode never has a real profiles row (there's no real login), so this
  // check only applies to genuine Supabase logins.
  if (!isDemoMode && accountNotProvisioned) {
    return <AccountNotProvisioned email={unprovisionedEmail ?? "(unknown)"} />;
  }

  return <>{children}</>;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Every page opens with the banner, edge to edge up behind the top bar (owner
  // request, 2026-11-12). The bar floats over the picture, see-through until the
  // page is scrolled, then turns white again. The Dashboard renders its own tall
  // banner; all other pages get the compact one from here.
  const pathname = usePathname();
  const heroPage = true;
  const isDashboard = pathname === "/dashboard";
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    setScrolled((mainRef.current?.scrollTop ?? 0) > 8);
  }, [pathname]);

  return (
    <AppDataProvider>
      <MonitoringProvider>
      <div className="flex h-screen overflow-hidden bg-surface-muted dark:bg-surface-dark">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="relative flex-1 flex flex-col min-w-0">
          <TopBar onMenuClick={() => setMobileNavOpen(true)} floating={heroPage} transparent={heroPage && !scrolled} />
          <main ref={mainRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)} className="flex-1 overflow-y-auto p-4 lg:p-6">
            <PortalShell onMenuClick={() => setMobileNavOpen(true)}>
              {!isDashboard && <DashboardHero compact />}
              {children}
            </PortalShell>
          </main>
        </div>
      </div>
      </MonitoringProvider>
    </AppDataProvider>
  );
}
