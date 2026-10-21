"""
hpp_reader.py — อ่านไฟล์ Export "Site Details" ของ Hik-Partner Pro แล้วคืน ReadResult รูปแบบเดียวกับ ivms_reader
(ไม่แตะ Windows/เน็ต ทดสอบได้ทุกเครื่อง — ตัวกด Export อยู่ใน hpp_auto_export.py)

รูปแบบไฟล์ (ตรวจกับไฟล์จริง 19 ต.ค. 2026, Exported At 10:57:46):
  ชีต "site"
    แถวบน:  Exported At | 2026/10/19 10:57:46   · Total Number of Devices | 122
    หัวตาราง: Site Name | ... | Device Name | Device Type | Device Model | Device Serial No. | Device Network Status | ...
    แถวละ 1 เครื่อง · Site Name เติมเฉพาะแถวแรกของแต่ละ Site
  Device Name ขึ้นต้นด้วยรหัสสาขา 5 หลัก: "54023 - CentralPlaza Chonburi" (บางแถวไม่มีขีด: "53023 TOPS Plaza Phol")

การจับคู่สาขา: key = "รหัส@SN:serial" ให้ state.resolve() เทียบรหัสกับ Serial ใน DB เอง
(ไม่ตรงกัน -> เชื่อ Serial) · ชื่อสาขาใน HPP สะกดไม่ตรงกับ portal จึงไม่ใช้ชื่อจับคู่
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from serials import make_key, with_code
from state import BKK, ReadResult

HEADERS = {
    "name": "device name",
    "serial": "device serial no.",
    "status": "device network status",
}
STATUS_MAP = {"online": "Online", "offline": "Offline"}
CODE_RE = re.compile(r"^\s*(\d{5})(?!\d)")
MAX_AGE_MINUTES = 15   # ไฟล์เก่ากว่านี้ = ไม่ใช่ผลของรอบนี้ (กันอ่านไฟล์ค้างในโฟลเดอร์)


class ExportFormatError(Exception):
    pass


def _norm(v) -> str:
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()


def _label_value(rows, label: str) -> Optional[str]:
    """แถวบนแบบ 'ป้าย | ค่า' เช่น Exported At / Total Number of Devices"""
    for r in rows:
        if r and _norm(r[0]).lower() == label.lower() and len(r) > 1:
            return _norm(r[1]) or None
    return None


def parse_exported_at(v: Optional[str]) -> Optional[datetime]:
    """'2026/10/19 10:57:46' (เวลาไทยตามเบราว์เซอร์ที่ Export) -> datetime aware"""
    if not v:
        return None
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(v, fmt).replace(tzinfo=BKK)
        except ValueError:
            continue
    return None


def parse_rows(rows: list) -> dict:
    """แถวทั้งชีต (list ของ tuple) -> {"devices": [...], "skipped": [...], "total": int|None, "exported_at": dt|None}
    devices: [{"key", "code", "serial", "name", "status"}]"""
    hdr_i, cols = None, {}
    for i, r in enumerate(rows):
        cells = [_norm(c).lower() for c in (r or ())]
        if HEADERS["status"] in cells and HEADERS["name"] in cells:
            hdr_i = i
            cols = {k: cells.index(h) for k, h in HEADERS.items() if h in cells}
            break
    if hdr_i is None or len(cols) < len(HEADERS):
        raise ExportFormatError("ไม่เจอหัวตาราง Device Name / Device Serial No. / Device Network Status — "
                                "Hik-Partner Pro อาจเปลี่ยนรูปแบบไฟล์ Export")

    top = rows[:hdr_i]
    total_s = _label_value(top, "Total Number of Devices")
    total = int(total_s) if total_s and total_s.isdigit() else None

    devices, skipped = [], []
    for r in rows[hdr_i + 1:]:
        r = tuple(r or ())
        get = lambda k: _norm(r[cols[k]]) if cols[k] < len(r) else ""  # noqa: E731
        name, serial, raw = get("name"), get("serial"), get("status")
        if not (name or serial):
            continue  # แถวว่าง
        status = STATUS_MAP.get(raw.lower())
        m = CODE_RE.match(name)
        code = m.group(1) if m else None
        rest = name[m.end():].strip(" -–") if m else name
        skey = make_key(serial)
        if status is None:
            skipped.append(f"{name or serial}: สถานะ '{raw or 'ว่าง'}' ไม่รู้จัก")
            continue
        if not code and not skey:
            skipped.append(f"{name}: ไม่มีรหัสสาขาในชื่อ และไม่มี Serial")
            continue
        key = with_code(code, skey) if code else skey
        devices.append({"key": key, "code": code, "serial": serial, "name": rest, "status": status})
    return {"devices": devices, "skipped": skipped, "total": total,
            "exported_at": parse_exported_at(_label_value(top, "Exported At"))}


def read_rows_xlsx(path: str) -> list:
    import warnings
    from openpyxl import load_workbook
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")   # ไฟล์จาก HPP ไม่มี default style -> openpyxl เตือนทุกครั้ง
        wb = load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb["site"] if "site" in wb.sheetnames else wb.worksheets[0]
        return [tuple(r) for r in ws.iter_rows(values_only=True)]
    finally:
        wb.close()


def to_read_result(parsed: dict, now: Optional[datetime] = None, max_age_minutes: int = MAX_AGE_MINUTES,
                   log=print) -> ReadResult:
    """รวมเป็นรายสาขาแบบเดียวกับ ivms_reader: สาขาเดียวมีหลายเครื่อง -> มีตัวไหน Offline ถือว่า Offline"""
    devices, total = parsed["devices"], parsed["total"]
    exported = parsed["exported_at"]
    if now is not None and exported is not None and now - exported > timedelta(minutes=max_age_minutes):
        return ReadResult(ok=False, error=f"ไฟล์ Export เก่าเกินไป (Exported At {exported:%d/%m %H:%M}) — ไม่ใช่ผลของรอบนี้")
    if not devices:
        return ReadResult(ok=False, error="ไฟล์ Export ไม่มีรายการเครื่องเลย")

    by_key = {}
    for d in devices:
        cur = by_key.get(d["key"])
        if cur is None or d["status"] == "Offline":
            by_key[d["key"]] = d
    offline = sorted((k, d["name"]) for k, d in by_key.items() if d["status"] == "Offline")
    online = sorted((k, d["name"]) for k, d in by_key.items() if d["status"] == "Online")

    seen = len(devices) + len(parsed["skipped"])
    if total is None:
        total = seen
    complete = not parsed["skipped"] and len(devices) >= total
    for s in parsed["skipped"]:
        log(f"warn: ข้ามแถว {s}")
    if seen != total:
        log(f"warn: ไฟล์บอก Total {total} เครื่อง แต่มี {seen} แถว")
        complete = False
    return ReadResult(ok=True, total=total, offline=offline, online=online, complete=complete)


def read_export_file(path: str, now: Optional[datetime] = None, log=print) -> ReadResult:
    try:
        return to_read_result(parse_rows(read_rows_xlsx(path)), now=now, log=log)
    except ExportFormatError as e:
        return ReadResult(ok=False, error=str(e))
    except Exception as e:
        return ReadResult(ok=False, error=f"อ่านไฟล์ Export ไม่ได้: {type(e).__name__}: {e}")


def read_hpp(log=print, keep_open: bool = False) -> ReadResult:
    """ใช้ใน monitor.py: สั่ง Export จาก Hik-Partner Pro แล้วอ่านไฟล์ที่ได้"""
    from hpp_auto_export import ExportError, export_site_details
    try:
        path = export_site_details(log=log, keep_open=keep_open)
    except ExportError as e:
        return ReadResult(ok=False, error=str(e))
    except Exception as e:  # ไม่ให้ loop หลักตาย
        return ReadResult(ok=False, error=f"Export ไม่สำเร็จ: {type(e).__name__}: {e}")
    return read_export_file(path, now=datetime.now(BKK), log=log)


if __name__ == "__main__":
    # ทดสอบอ่านไฟล์ที่ Export ไว้แล้ว: python hpp_reader.py <ไฟล์.xlsx>
    import sys
    p = parse_rows(read_rows_xlsx(sys.argv[1]))
    r = to_read_result(p)
    print(f"Exported At {p['exported_at']} · ok={r.ok} total={r.total} complete={r.complete} "
          f"offline={len(r.offline)} online={len(r.online or [])} error={r.error}")
    print("Offline:", ", ".join(k.split("@")[0] for k, _ in r.offline))
    nocode = [d for d in p["devices"] if not d["code"]]
    if nocode:
        print(f"ชื่อไม่มีรหัสสาขา — จับคู่ด้วย Serial {len(nocode)} เครื่อง:", ", ".join(d["serial"] for d in nocode))
