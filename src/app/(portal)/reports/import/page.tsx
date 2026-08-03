"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportWizard } from "@/components/import/ImportWizard";
import { ImportHistory } from "@/components/import/ImportHistory";
import { useAppData } from "@/components/providers/AppDataProvider";
import { canManageMasterData } from "@/lib/rbac";

export default function ImportPage() {
  const { role } = useAppData();
  const [tab, setTab] = useState<"import" | "history">("import");

  if (!canManageMasterData(role)) {
    return <p className="text-sm text-ink-faint">Bulk import is restricted to HQ Admin.</p>;
  }

  return (
    <div className="space-y-4">
      <Link href="/reports" className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand w-fit">
        <ArrowLeft size={15} /> Back to Reports
      </Link>

      <div className="flex gap-1 border-b border-black/10 dark:border-white/10">
        {(["import", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? "border-brand text-brand" : "border-transparent text-ink-faint hover:text-ink dark:hover:text-white"
            }`}
          >
            {t === "import" ? "New Import" : "History & Rollback"}
          </button>
        ))}
      </div>

      {tab === "import" ? <ImportWizard /> : <ImportHistory />}
    </div>
  );
}
