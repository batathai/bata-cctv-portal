"""
probe_ivms.py — ทดสอบว่าสคริปต์อ่านตาราง Cloud P2P Device ของ iVMS-4200 ได้หรือไม่
อ่านอย่างเดียว: ไม่กดปุ่ม ไม่แก้ค่าใดๆ ใน iVMS

วิธีใช้ (บนเครื่องที่เปิด iVMS-4200 ตลอด 24 ชม.):
  1. ติดตั้ง Python 3 (python.org) แล้วรัน:  pip install pywinauto
  2. เปิด iVMS-4200 ไปที่ Maintenance and Management > Device > แท็บ Cloud P2P Device
  3. รัน:  python probe_ivms.py
  4. ส่งไฟล์ ivms_probe.txt ที่ได้กลับมา
"""
import re
import sys
from datetime import datetime

try:
    from pywinauto import Desktop
except ImportError:
    sys.exit("ยังไม่ได้ติดตั้ง pywinauto — รัน: pip install pywinauto")

STORE_RE = re.compile(r"^\s*(\d{5})\s*-\s*(.+)$")
STATUS_WORDS = ("online", "offline")
OUT = "ivms_probe.txt"


def find_ivms_window():
    for w in Desktop(backend="uia").windows():
        try:
            if "iVMS-4200" in w.window_text():
                return w
        except Exception:
            continue
    return None


def main():
    lines = [f"probe time: {datetime.now():%Y-%m-%d %H:%M:%S}"]
    win = find_ivms_window()
    if win is None:
        lines.append("RESULT: ไม่เจอหน้าต่าง iVMS-4200 (เปิดโปรแกรมไว้หรือยัง?)")
        write(lines)
        return

    lines.append(f"window: {win.window_text()!r}")
    texts = []
    try:
        for el in win.descendants():
            try:
                t = (el.window_text() or "").strip()
            except Exception:
                continue
            if t:
                texts.append((el.element_info.control_type, t))
    except Exception as e:
        lines.append(f"ERROR reading controls: {e!r}")

    stores = [t for _, t in texts if STORE_RE.match(t)]
    statuses = [t for _, t in texts if t.lower() in STATUS_WORDS]
    lines.append(f"controls with text: {len(texts)}")
    lines.append(f"store names found (#####-name): {len(stores)}")
    lines.append(f"Online/Offline labels found: {len(statuses)} "
                 f"(online={sum(s.lower()=='online' for s in statuses)}, "
                 f"offline={sum(s.lower()=='offline' for s in statuses)})")

    if stores and statuses:
        lines.append("RESULT: อ่านตารางได้ ✅")
    elif texts:
        lines.append("RESULT: อ่าน control ได้บางส่วน แต่ไม่เจอตารางสาขา — ต้องดูรายละเอียดด้านล่าง")
    else:
        lines.append("RESULT: อ่านข้อความจากหน้าต่างไม่ได้เลย ❌ (ต้องใช้วิธีอ่านภาพหน้าจอแทน)")

    lines.append("")
    lines.append("---- first 300 text controls (type | text) ----")
    for ctype, t in texts[:300]:
        lines.append(f"{ctype} | {t}")
    write(lines)


def write(lines):
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:8]))
    print(f"\nบันทึกผลไว้ที่ {OUT}")


if __name__ == "__main__":
    main()
