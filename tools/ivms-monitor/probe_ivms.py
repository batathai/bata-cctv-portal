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


def process_name(pid):
    """ชื่อไฟล์ .exe ของ process (ใช้ pywin32 ที่ติดมากับ pywinauto)"""
    try:
        import win32api, win32con, win32process
        h = win32api.OpenProcess(
            win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        try:
            return win32process.GetModuleFileNameEx(h, 0).split("\\")[-1]
        finally:
            win32api.CloseHandle(h)
    except Exception:
        return "?"


def list_windows():
    """ทุกหน้าต่างบนจอ: (window, title, exe)"""
    out = []
    for w in Desktop(backend="uia").windows():
        try:
            title = w.window_text() or ""
            exe = process_name(w.element_info.process_id)
        except Exception:
            continue
        out.append((w, title, exe))
    return out


def find_ivms_window(windows):
    # หาจากชื่อ .exe ก่อน (ชื่อหน้าต่างของ iVMS อาจว่างหรือไม่ตรงกับที่เห็น)
    for w, title, exe in windows:
        if "ivms" in exe.lower() or "ivms" in title.lower():
            return w
    return None


def main():
    lines = [f"probe time: {datetime.now():%Y-%m-%d %H:%M:%S}"]
    windows = list_windows()
    win = find_ivms_window(windows)
    if win is None:
        lines.append("RESULT: ไม่เจอหน้าต่าง iVMS-4200")
        lines.append("ลองปิด Command Prompt แล้วเปิดใหม่แบบ Run as administrator แล้วรันอีกครั้ง")
        lines.append("")
        lines.append("---- หน้าต่างทั้งหมดที่สคริปต์มองเห็น (exe | title) ----")
        for _, title, exe in windows:
            lines.append(f"{exe} | {title!r}")
        write(lines, preview=len(lines))
        return

    lines.append(f"window: {win.window_text()!r} "
                 f"exe={process_name(win.element_info.process_id)}")
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


def write(lines, preview=8):
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:preview]))
    print(f"\nบันทึกผลไว้ที่ {OUT}")


if __name__ == "__main__":
    main()
