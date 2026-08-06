"use client";

import { useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import type { StoreWithAssets } from "@/types/database";

interface Props {
  store: StoreWithAssets;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-soft dark:text-white/60 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-black/10 dark:border-white/10 rounded-md px-3 py-2 bg-surface-muted dark:bg-white/5 outline-none focus:border-brand";

/** Preset options + the field's current value, so switching to a dropdown never hides/loses existing data that isn't in the preset list. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

// Every device onboarded is Hikvision, and this exact NVR model — kept as
// single-option dropdowns (not free text) so nobody can typo a different
// brand/model in by mistake. withCurrent() still adds back whatever a
// store's existing value is if it's ever something else, so older/legacy
// records aren't silently hidden or wiped by narrowing this list.
const NVR_BRANDS = ["Hikvision"];
const NVR_MODELS = ["DS-7204HGHI-K1"];

export function EditAssetModal({ store, onClose }: Props) {
  const { editAssetDetails } = useAppData();
  const a = store.asset;
  const h = store.hikconnect;

  // Store info
  const [storeName, setStoreName] = useState(store.store_name);
  const [address, setAddress] = useState(store.address ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [storeGroup, setStoreGroup] = useState(store.store_group ?? "");

  // NVR
  const [nvrBrand, setNvrBrand] = useState(a?.nvr_brand ?? "");
  const [nvrModel, setNvrModel] = useState(a?.nvr_model ?? "");
  const [nvrSerial, setNvrSerial] = useState(a?.nvr_serial ?? "");
  const [nvrInstallDate, setNvrInstallDate] = useState(a?.nvr_install_date ?? "");
  const [nvrOnline, setNvrOnline] = useState(a?.nvr_online ? "Yes" : "No");

  // Cameras
  const [cameraTotal, setCameraTotal] = useState(a ? String(a.camera_total) : "");

  // Storage
  const [hddCapacity, setHddCapacity] = useState(a?.hdd_capacity ?? "");

  // Hik-Connect
  const [deviceName, setDeviceName] = useState(h?.device_name ?? "");
  const [hikStatus, setHikStatus] = useState(h?.hikconnect_status ?? "");
  const [ownerAccount, setOwnerAccount] = useState(h?.owner_account ?? "");
  const [verificationCode, setVerificationCode] = useState(h?.verification_code ?? "");
  const [lastVerifiedDate, setLastVerifiedDate] = useState(h?.last_verified_date ?? "");
  const [ivmsAccount, setIvmsAccount] = useState(h?.ivms_account ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await editAssetDetails(store.id, {
        store: {
          store_name: storeName,
          address: address || null,
          phone: phone || null,
          store_group: storeGroup || null,
        },
        asset: a
          ? {
              nvr_brand: nvrBrand || null,
              nvr_model: nvrModel || null,
              nvr_serial: nvrSerial || null,
              nvr_install_date: nvrInstallDate || null,
              nvr_online: nvrOnline === "Yes",
              camera_total: Number(cameraTotal) || 0,
              hdd_capacity: hddCapacity || null,
            }
          : undefined,
        hikconnect: h
          ? {
              device_name: deviceName || null,
              hikconnect_status: hikStatus || null,
              owner_account: ownerAccount || null,
              verification_code: verificationCode || null,
              last_verified_date: lastVerifiedDate || null,
              ivms_account: ivmsAccount || null,
            }
          : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-2xl bg-white dark:bg-surface-dark rounded-card shadow-card max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10 sticky top-0 bg-white dark:bg-surface-dark z-10">
          <div className="font-display font-semibold text-sm text-ink dark:text-white">Edit Detail — {store.store_code}</div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Store Info</div>
            <Field label="Store Name">
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} required className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Store Group">
                <input value={storeGroup} onChange={(e) => setStoreGroup(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Address">
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </Field>
          </section>

          {a && (
            <>
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">NVR</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand">
                    <Select value={nvrBrand} onChange={setNvrBrand} options={withCurrent(NVR_BRANDS, nvrBrand)} placeholder="Brand" variant="full" />
                  </Field>
                  <Field label="Model">
                    <Select value={nvrModel} onChange={setNvrModel} options={withCurrent(NVR_MODELS, nvrModel)} placeholder="Model" variant="full" />
                  </Field>
                  <Field label="Serial">
                    <input value={nvrSerial} onChange={(e) => setNvrSerial(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Install Date">
                    <input type="date" value={nvrInstallDate ?? ""} onChange={(e) => setNvrInstallDate(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Online">
                    <Select value={nvrOnline} onChange={setNvrOnline} options={["Yes", "No"]} placeholder="Online?" variant="full" />
                  </Field>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Cameras</div>
                <Field label="Total">
                  <input type="number" min="0" value={cameraTotal} onChange={(e) => setCameraTotal(e.target.value)} className={inputCls} />
                </Field>
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Storage</div>
                <Field label="HDD Capacity">
                  <input value={hddCapacity ?? ""} onChange={(e) => setHddCapacity(e.target.value)} className={inputCls} />
                </Field>
              </section>
            </>
          )}

          {h && (
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Hik-Connect</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Device Name">
                  <input value={deviceName ?? ""} onChange={(e) => setDeviceName(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Status">
                  <Select value={hikStatus ?? ""} onChange={setHikStatus} options={["Online", "Offline"]} placeholder="Status" variant="full" />
                </Field>
                <Field label="Owner Account">
                  <input value={ownerAccount ?? ""} onChange={(e) => setOwnerAccount(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Verification Code">
                  <input value={verificationCode ?? ""} onChange={(e) => setVerificationCode(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Last Verified">
                  <input type="date" value={lastVerifiedDate ?? ""} onChange={(e) => setLastVerifiedDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label="iVMS Account">
                  <input value={ivmsAccount ?? ""} onChange={(e) => setIvmsAccount(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </section>
          )}

          {error && (
            <p className="text-xs text-brand flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-surface-dark pb-1">
            <button type="button" onClick={onClose} className="text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-4 py-2 text-ink-soft dark:text-white/60">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand text-white rounded-md px-4 py-2 disabled:opacity-60"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
