"use client";

import { useEffect, useState } from "react";
import { Paperclip, Upload, Loader2, Trash2, FileText, ImageIcon } from "lucide-react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Select } from "@/components/ui/Select";
import type { Attachment, AttachmentFolder, StoreWithAssets } from "@/types/database";

const FOLDERS: AttachmentFolder[] = [
  "NVR Photos",
  "DVR Photos",
  "Camera Photos",
  "HDD Photos",
  "Serial Sticker Photos",
  "Invoice",
  "Warranty",
  "Manual",
  "Audit Reports",
  "Repair Reports",
  // Installation Project (migration 020)
  "Site Survey Photos",
  "Permit Documents",
  "Camera Install Photos",
  "Verify Photos",
];
const DOCUMENT_FOLDERS: AttachmentFolder[] = ["Invoice", "Warranty", "Manual", "Audit Reports", "Repair Reports"];

function AttachmentRow({ att, onDelete }: { att: Attachment; onDelete: () => void }) {
  const { resolveAttachmentUrl } = useAppData();
  const [url, setUrl] = useState<string | null>(null);
  const isDoc = DOCUMENT_FOLDERS.includes(att.folder as AttachmentFolder);

  useEffect(() => {
    let mounted = true;
    resolveAttachmentUrl(att.file_path).then((u) => {
      if (mounted) setUrl(u);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.file_path]);

  return (
    <div className="flex items-center gap-2 bg-surface-muted dark:bg-white/5 rounded-md px-3 py-2 text-xs">
      {isDoc ? <FileText size={13} className="text-ink-faint shrink-0" /> : <ImageIcon size={13} className="text-ink-faint shrink-0" />}
      <a href={url ?? "#"} target="_blank" rel="noreferrer" className="flex-1 truncate text-brand hover:underline">
        {att.file_name ?? att.file_path}
      </a>
      <span className="text-ink-faint">{att.folder}</span>
      <button onClick={onDelete} className="text-ink-faint hover:text-status-offline">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function AttachmentsCard({ store, canEdit }: { store: StoreWithAssets; canEdit: boolean }) {
  const { attachments, uploadAttachment, deleteAttachment } = useAppData();
  const [folder, setFolder] = useState<AttachmentFolder>("NVR Photos");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeAttachments = attachments.filter((a) => a.store_id === store.id);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadAttachment(store.store_code, store.id, folder, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={folder} onChange={(v) => setFolder(v as AttachmentFolder)} options={FOLDERS} placeholder="Folder" />
          <label className="flex items-center gap-1.5 text-xs font-medium border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 cursor-pointer hover:bg-surface-muted dark:hover:bg-white/5">
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload File
            <input type="file" className="hidden" onChange={handleFile} disabled={uploading} accept="image/*,.pdf,.doc,.docx" />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-brand">{error}</p>}

      {storeAttachments.length === 0 ? (
        <p className="text-sm text-ink-faint flex items-center gap-1.5">
          <Paperclip size={13} /> No files uploaded yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {storeAttachments.map((att) => (
            <AttachmentRow key={att.id} att={att} onDelete={() => deleteAttachment(att.id, att.file_path)} />
          ))}
        </div>
      )}
    </div>
  );
}
