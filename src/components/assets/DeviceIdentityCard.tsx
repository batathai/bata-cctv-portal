"use client";

import { useEffect, useState } from "react";
import { QrCode, Upload, Loader2, AlertCircle, MoveRight } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import type { StoreWithAssets } from "@/types/database";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-black/5 dark:border-white/5 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink dark:text-white">{value}</span>
    </div>
  );
}

export function DeviceIdentityCard({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { allStores, resolveAttachmentUrl, uploadQrCode, relocateAsset } = useAppData();
  const a = store.asset;

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (a?.qr_code_path) {
      resolveAttachmentUrl(a.qr_code_path).then((u) => mounted && setQrUrl(u));
    } else {
      setQrUrl(null);
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.qr_code_path]);

  if (!a) return <p className="text-sm text-ink-faint">No device record for this store yet.</p>;

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadQrCode(store.store_code, store.id, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR code upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault();
    if (!moveTarget) return;
    setMoving(true);
    setError(null);
    try {
      await relocateAsset(store.id, moveTarget);
      setMoveTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move device.");
    } finally {
      setMoving(false);
    }
  }

  const otherStores = allStores.filter((s) => s.store_code !== store.store_code);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
      <div>
        <Row label="Brand" value={a.nvr_brand} />
        <Row label="Model" value={a.nvr_model} />
        <Row label="Serial Number" value={<span className="font-mono text-xs">{a.nvr_serial}</span>} />
        <Row label="Current Store" value={<span className="font-mono text-xs">{store.store_code}</span>} />

        <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mt-4 mb-1">Storage</div>
        <Row label="Capacity" value={a.hdd_capacity} />

        {canEdit && (
          <form onSubmit={handleMove} className="mt-3 flex items-center gap-2 flex-wrap">
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className="text-xs rounded-md border border-black/10 dark:border-white/10 bg-surface-muted dark:bg-white/5 px-2 py-1.5 outline-none focus:border-brand"
            >
              <option value="">Move to store…</option>
              {otherStores.map((s) => (
                <option key={s.id} value={s.store_code}>
                  {s.store_code} — {s.store_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!moveTarget || moving}
              className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 hover:bg-surface-muted dark:hover:bg-white/5 disabled:opacity-50"
            >
              {moving ? <Loader2 size={12} className="animate-spin" /> : <MoveRight size={12} />}
              Move Device
            </button>
          </form>
        )}
        {error && (
          <p className="text-xs text-brand flex items-start gap-1.5 mt-2">
            <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="w-28 h-28 rounded-md border border-black/10 dark:border-white/10 flex items-center justify-center bg-surface-muted dark:bg-white/5 overflow-hidden">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="QR Code" className="w-full h-full object-contain" />
          ) : (
            <QrCode size={28} className="text-ink-faint" />
          )}
        </div>
        {canEdit && (
          <label className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-surface-muted dark:hover:bg-white/5">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {a.qr_code_path ? "Replace QR" : "Upload QR"}
            <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} disabled={uploading} />
          </label>
        )}
      </div>
    </div>
  );
}
