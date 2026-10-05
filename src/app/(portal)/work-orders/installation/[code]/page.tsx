"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, GitBranch, Paperclip, History, CheckSquare, FileText, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AttachmentsCard } from "@/components/assets/AttachmentsCard";
import { zoneCode, getAreaLabel, getRecoveryRegion } from "@/lib/recovery";
import { canLogMaintenance } from "@/lib/rbac";
import {
  INSTALLATION_STAGES,
  getStageLabel,
  canAdvanceStage,
  nextStage as nextStageOf,
  stageIndex,
  VERIFY_CHECKLIST,
  withinPostCompletionWindow,
} from "@/lib/installation";
import { exportInstallationHandoverPdf } from "@/lib/reports/exportInstallationPdf";
import type { InstallationStage } from "@/types/database";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-black/5 dark:border-white/5 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink dark:text-white text-right">{value}</span>
    </div>
  );
}

export const runtime = "edge";
export default function InstallationDetailPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { stores, installationProjects, installationStageHistory, vendorQuotations, role, loading } = useAppData();
  const canEdit = canLogMaintenance(role);

  if (loading) return <div className="text-sm text-ink-faint">Loading…</div>;

  const store = stores.find((s) => s.store_code === code);
  const project = store ? installationProjects.find((p) => p.store_id === store.id) : undefined;

  if (!store || !project) {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => router.back()} />
        <div className="text-sm text-ink-faint">
          ไม่พบ Installation Project สำหรับสาขา <span className="font-mono">{code}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackButton onClick={() => router.back()} />

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="font-display text-lg font-bold text-ink dark:text-white">{store.store_name}</div>
            <div className="font-mono text-xs text-ink-faint">{store.store_code} &middot; {project.wave}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs font-semibold text-brand bg-brand-50 dark:bg-brand/10 rounded-full px-3 py-1">{getStageLabel(project.current_stage)}</span>
            <button
              onClick={() => exportInstallationHandoverPdf(project, store)}
              className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-brand"
            >
              <FileText size={12} /> ใบส่งมอบงาน (PDF)
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={GitBranch}>ขั้นตอนการติดตั้ง</SectionTitle>
        <InstallationStepper canEdit={canEdit} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={MapPin}>Location</SectionTitle>
          <Row label="Region" value={getRecoveryRegion(store.zone)} />
          <Row label="Zone" value={zoneCode(store.zone)} />
          <Row label="Area" value={getAreaLabel(store.zone)} />
        </Card>
        <Card className="p-5">
          <SectionTitle icon={GitBranch}>วันสำคัญ</SectionTitle>
          <Row label="ยื่นขออนุญาต" value={project.permit_submitted_at ?? "-"} />
          <Row label="D1 — นัดติดตั้ง" value={project.d1_date ?? "-"} />
          <Row label="D2 — ติดตั้งจริง" value={project.d2_date ?? "-"} />
          <Row label="Completed" value={project.completed_at ?? "-"} />
        </Card>
      </div>

      {project.current_stage === "Quotation" && (
        <QuotationLinkCard canEdit={canEdit} />
      )}

      {(project.current_stage === "Verify" || project.current_stage === "Completed") && (
        <Card className="p-5">
          <SectionTitle icon={CheckSquare}>Verify Checklist ({project.verify_total}/12)</SectionTitle>
          <VerifyChecklistCard canEdit={canEdit} />
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle icon={Paperclip}>ไฟล์แนบ</SectionTitle>
        <AttachmentsCard store={store} canEdit={canEdit} />
      </Card>

      <Card className="p-5">
        <SectionTitle icon={History}>Activity Log</SectionTitle>
        {(() => {
          const storeHistory = [...installationStageHistory]
            .filter((h) => h.store_id === store.id)
            .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
          if (storeHistory.length === 0) return <p className="text-sm text-ink-faint">ยังไม่มีการเปลี่ยนสถานะ</p>;
          return (
            <div className="space-y-2">
              {storeHistory.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-[11px] text-ink-faint shrink-0 w-32">
                    {new Date(h.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <div className="flex-1">
                    <span className="text-ink dark:text-white">
                      {h.from_stage ? `${getStageLabel(h.from_stage)} → ${getStageLabel(h.to_stage)}` : `เปิดโปรเจกต์: ${getStageLabel(h.to_stage)}`}
                    </span>
                    {h.note && <div className="text-xs text-ink-soft dark:text-white/60 mt-0.5">{h.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-ink-soft dark:text-white/60 hover:text-brand">
      <ArrowLeft size={15} /> Back
    </button>
  );
}

function InstallationStepper({ canEdit }: { canEdit: boolean }) {
  const { code } = useParams<{ code: string }>();
  const { stores, installationProjects, vendorQuotations, advanceInstallationStage } = useAppData();
  const store = stores.find((s) => s.store_code === code)!;
  const project = installationProjects.find((p) => p.store_id === store.id)!;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = stageIndex(project.current_stage);
  const next = nextStageOf(project.current_stage);
  const prev = currentIdx > 0 ? INSTALLATION_STAGES[currentIdx - 1] : undefined;
  const canGoNext = next ? canAdvanceStage(project, vendorQuotations) : false;
  const inPostCompletionWindow = withinPostCompletionWindow(project);

  async function move(toStage: InstallationStage) {
    setSaving(true);
    setError(null);
    try {
      const extra: Record<string, unknown> = {};
      if (toStage === "Permit") extra.permit_submitted_at = new Date().toISOString().slice(0, 10);
      if (toStage === "Scheduled" && !project.d1_date) extra.d1_date = new Date().toISOString().slice(0, 10);
      if (toStage === "Installing" && !project.d2_date) extra.d2_date = new Date().toISOString().slice(0, 10);
      await advanceInstallationStage(project, toStage, extra);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ย้ายขั้นไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start overflow-x-auto pb-1">
        {INSTALLATION_STAGES.map((stage, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={stage} className="flex-1 min-w-[80px] flex flex-col items-center relative">
              {i > 0 && <div className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= currentIdx ? "bg-brand" : "bg-black/10 dark:bg-white/10"}`} />}
              <div
                className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                  isCurrent ? "bg-brand border-brand text-white" : reached ? "bg-brand-50 border-brand text-brand" : "bg-white dark:bg-surface-dark border-black/15 dark:border-white/15 text-ink-faint"
                }`}
              >
                {i + 1}
              </div>
              <div className={`mt-2 text-[10px] text-center leading-tight px-1 ${isCurrent ? "text-brand font-semibold" : reached ? "text-ink dark:text-white" : "text-ink-faint"}`}>
                {getStageLabel(stage)}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-brand flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {canEdit && (
        <div className="flex justify-end gap-2">
          {prev && (
            <button onClick={() => move(prev)} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-white/60 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 disabled:opacity-60">
              {saving && <Loader2 size={12} className="animate-spin" />} ← กลับไป &quot;{getStageLabel(prev)}&quot;
            </button>
          )}
          {next && (
            <button
              onClick={() => move(next)}
              disabled={saving || !canGoNext}
              title={!canGoNext ? "ต้องผูกใบเสนอราคาที่ Approved ก่อน" : undefined}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />} ไปขั้น &quot;{getStageLabel(next)}&quot;
            </button>
          )}
        </div>
      )}
      {!next && canEdit && !inPostCompletionWindow && <p className="text-xs text-status-healthy font-medium">งานติดตั้งเสร็จสมบูรณ์แล้ว</p>}
    </div>
  );
}

function QuotationLinkCard({ canEdit }: { canEdit: boolean }) {
  const { code } = useParams<{ code: string }>();
  const { stores, installationProjects, vendorQuotations, advanceInstallationStage } = useAppData();
  const store = stores.find((s) => s.store_code === code)!;
  const project = installationProjects.find((p) => p.store_id === store.id)!;
  const approved = vendorQuotations.filter((q) => q.store_id === store.id && q.approval_status === "Approved");
  const [selected, setSelected] = useState(project.approved_quotation_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await advanceInstallationStage(project, "Permit", { approved_quotation_id: selected, permit_submitted_at: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ผูกใบเสนอราคาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle icon={FileText}>ใบเสนอราคา / อนุมัติงบ (R3)</SectionTitle>
      {approved.length === 0 ? (
        <p className="text-sm text-ink-faint">ยังไม่มีใบเสนอราคาที่ Approved สำหรับสาขานี้ — เพิ่ม/อนุมัติได้จากหน้า Vendor Quotation เดิม</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-faint">เลือกใบเสนอราคาที่ Approved แล้วเพื่อผูกกับโปรเจกต์นี้ และย้ายไปขั้น &quot;ขออนุญาตห้าง&quot;</p>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!canEdit}
            className="w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-white dark:bg-surface-dark outline-none focus:border-brand"
          >
            <option value="">— เลือกใบเสนอราคา —</option>
            {approved.map((q) => (
              <option key={q.id} value={q.id}>
                {q.quotation_number ?? q.id} — {q.vendor_name} — {q.estimated_cost?.toLocaleString() ?? "-"} บาท
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-brand">{error}</p>}
          {canEdit && (
            <button
              onClick={link}
              disabled={saving || !selected}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-3 py-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 size={12} className="animate-spin" />} ผูกและไปขั้นถัดไป
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function VerifyChecklistCard({ canEdit }: { canEdit: boolean }) {
  const { code } = useParams<{ code: string }>();
  const { stores, installationProjects, updateVerifyChecklistItem, resetPostCompletionChecklist } = useAppData();
  const store = stores.find((s) => s.store_code === code)!;
  const project = installationProjects.find((p) => p.store_id === store.id)!;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);

  const groups = useMemo(() => {
    const g: Record<"A" | "B" | "C", typeof VERIFY_CHECKLIST> = { A: [], B: [], C: [] };
    VERIFY_CHECKLIST.forEach((item) => g[item.group].push(item));
    return g;
  }, []);
  const groupLabel: Record<"A" | "B" | "C", string> = {
    A: "กลุ่ม A — หน้างาน",
    B: "กลุ่ม B — ส่วนกลาง",
    C: "กลุ่ม C — ติดตามหลังปิดงาน 72 ชม.",
  };

  async function toggle(key: string, checked: boolean) {
    setBusyKey(key);
    try {
      await updateVerifyChecklistItem(project, key, checked);
    } finally {
      setBusyKey(null);
    }
  }

  const inWindow = withinPostCompletionWindow(project);

  return (
    <div className="space-y-4">
      {(["A", "B", "C"] as const).map((g) => (
        <div key={g}>
          <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1.5">{groupLabel[g]}</div>
          <div className="space-y-1.5">
            {groups[g].map((item) => {
              const checked = project.verify_checked.includes(item.key);
              return (
                <label key={item.key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit || busyKey === item.key || project.current_stage === "Completed"}
                    onChange={(e) => toggle(item.key, e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className={checked ? "text-ink dark:text-white" : "text-ink-soft dark:text-white/70"}>{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {project.current_stage === "Completed" && canEdit && (
        <div className="bg-status-partial/10 border border-status-partial/30 rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-ink dark:text-white flex items-center gap-1.5">
            <RotateCcw size={13} /> สาขาหลุด Offline ระหว่าง 72 ชม. หลังปิดงาน?
          </p>
          {inWindow ? (
            <>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="ระบุเหตุผล เช่น ไฟดับที่สาขา, เน็ตหลุด"
                rows={2}
                className="w-full text-xs border border-black/10 dark:border-white/10 rounded-md px-2.5 py-1.5 bg-white dark:bg-surface-dark outline-none focus:border-brand resize-none"
              />
              <button
                onClick={async () => {
                  if (!resetReason.trim()) return;
                  setResetting(true);
                  try {
                    await resetPostCompletionChecklist(project, resetReason.trim());
                    setResetReason("");
                  } finally {
                    setResetting(false);
                  }
                }}
                disabled={resetting || !resetReason.trim()}
                className="flex items-center gap-1.5 text-xs font-medium bg-status-partial text-white rounded-md px-3 py-1.5 disabled:opacity-60"
              >
                {resetting && <Loader2 size={12} className="animate-spin" />} ล้างข้อ C1/C2 และย้อนกลับไป &quot;ติดตั้ง&quot;
              </button>
            </>
          ) : (
            <p className="text-xs text-ink-faint">พ้นช่วง 72 ชม. หลังปิดงานแล้ว ไม่สามารถย้อนกลับจากหน้านี้ได้</p>
          )}
        </div>
      )}
    </div>
  );
}
