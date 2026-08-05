"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppDataProvider, useAppData } from "@/components/providers/AppDataProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

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

  return (
    <AppDataProvider>
      <div className="flex h-screen overflow-hidden bg-surface-muted dark:bg-surface-dark">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <PortalShell onMenuClick={() => setMobileNavOpen(true)}>{children}</PortalShell>
          </main>
        </div>
      </div>
    </AppDataProvider>
  );
}
