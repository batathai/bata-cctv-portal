"use client";

import { Settings, Users, Building2, ShieldAlert } from "lucide-react";
import { useAppData, ROLE_LABELS } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { canManageMasterData, ROLE_ZONES } from "@/lib/rbac";
import { SUPPLIERS } from "@/lib/mockData";

export default function SettingsPage() {
  const { role } = useAppData();

  if (!canManageMasterData(role)) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-ink-faint">
        <ShieldAlert size={16} className="text-brand" /> Settings are restricted to HQ Admin.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={Users}>Roles &amp; Zone Access</SectionTitle>
          <div className="space-y-2 text-sm">
            {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
              <div key={r} className="flex justify-between border-b border-black/5 dark:border-white/5 py-2">
                <span className="text-ink dark:text-white">{ROLE_LABELS[r]}</span>
                <span className="text-ink-faint text-xs">
                  {ROLE_ZONES[r] ? `Zones ${ROLE_ZONES[r]!.join(", ")}` : r === "supplier" ? "Assigned stores only" : "All zones"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Building2}>Suppliers</SectionTitle>
          <div className="space-y-2 text-sm">
            {SUPPLIERS.map((s) => (
              <div key={s} className="flex justify-between border-b border-black/5 dark:border-white/5 py-2">
                <span className="text-ink dark:text-white">{s}</span>
                <span className="text-xs text-ink-faint">{s === "Flowbridge" ? "Current supplier" : "Onboarding-ready"}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle icon={Settings}>System</SectionTitle>
        <p className="text-sm text-ink-faint">
          User invitations, notification channel setup (Email / Microsoft Teams / LINE), and supplier
          onboarding will connect to Supabase Auth and the <span className="font-mono">profiles</span> /{" "}
          <span className="font-mono">suppliers</span> tables in Phase 2.
        </p>
      </Card>
    </div>
  );
}
