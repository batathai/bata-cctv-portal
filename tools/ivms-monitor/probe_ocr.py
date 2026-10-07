"""
probe_ocr.py — ทดสอบอ่านตาราง Cloud P2P Device ของ iVMS-4200 จากภาพหน้าจอ
ไม่แก้ค่าใดๆ ใน iVMS: แค่ดึงหน้าต่างขึ้นหน้า และหมุนล้อเมาส์เลื่อนตารางเพื่ออ่านให้ครบทุกแถว
(ระหว่างรันอย่าขยับเมาส์ ประมาณ 15-30 วินาที)

ใช้ OCR ที่มากับ Windows 10/11 (Windows.Media.Ocr) + เช็คสีไอคอนสถานะ

วิธีใช้ (Command Prompt แบบ Run as administrator):
  1. pip install winsdk pillow
  2. เปิด iVMS-4200 หน้า Maintenance and Management > Device > Cloud P2P Device
  3. python probe_ocr.py
  4. ส่งไฟล์ ivms_ocr_probe.txt กลับมา (ไฟล์ ivms_capture.png คือภาพที่สคริปต์เห็น ใช้เช็คได้)
"""
import asyncio
import ctypes
import re
import sys
import time
from datetime import datetime

# ต้องตั้งก่อน import pywinauto: ให้พิกัดหน้าต่างกับภาพหน้าจอเป็นพิกเซลจริงชุดเดียวกัน
# (ถ้า Windows ตั้ง Display Scale 125%/150% แล้วไม่ตั้งค่านี้ ภาพจะถูกตัดขาด)
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)   # per-monitor DPI aware
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

try:
    from pywinauto import Desktop, mouse
    from PIL import ImageGrab, ImageOps
    from winsdk.windows.media.ocr import OcrEngine
    from winsdk.windows.globalization import Language
    from winsdk.windows.graphics.imaging import (
        SoftwareBitmap, BitmapPixelFormat, BitmapAlphaMode)
    from winsdk.windows.storage.streams import DataWriter
except ImportError as e:
    sys.exit(f"ขาดไลบรารี ({e.name}) — รัน: pip install winsdk pillow pywinauto")

OUT = "ivms_ocr_probe.txt"
CAPTURE = "ivms_capture.png"
SCALE = 2                       # ขยายภาพก่อน OCR ให้อ่านตัวเล็กได้แม่นขึ้น
CODE_RE = re.compile(r"\b(\d{5})\s*[-–]\s*(.+)")
STATUS_RE = re.compile(r"\b(Online|Offline)\b", re.I)
MAX_PAGES = 15                  # กันวนไม่จบ
WHEEL_STEP = 10                 # หมุนล้อเมาส์ลงทีละกี่ขีดต่อหน้า


# ---------- หาหน้าต่าง iVMS ----------
def process_name(pid):
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


def find_ivms_window():
    """หาหน้าต่างหลักของ iVMS-4200
    ห้ามจับจากคำว่า 'ivms' ในชื่อหน้าต่างเฉยๆ — เคยจับผิดไปเป็น Notepad ที่เปิด ivms_probe.txt"""
    by_title = None
    for w in Desktop(backend="uia").windows():
        try:
            title = (w.window_text() or "").strip()
            exe = process_name(w.element_info.process_id).lower()
        except Exception:
            continue
        if exe.startswith("ivms") and title == "iVMS-4200":
            return w                      # ตรงทั้งโปรแกรมและชื่อหน้าต่าง
        if title == "iVMS-4200" and exe not in ("notepad.exe", "python.exe", "cmd.exe"):
            by_title = by_title or w
    return by_title


# ---------- OCR ----------
def to_software_bitmap(img):
    """PIL image -> WinRT SoftwareBitmap (BGRA8)"""
    rgba = img.convert("RGBA")
    r, g, b, a = rgba.split()
    from PIL import Image
    bgra = Image.merge("RGBA", (b, g, r, a)).tobytes()
    writer = DataWriter()
    try:
        writer.write_bytes(bgra)
    except TypeError:
        writer.write_bytes(list(bgra))
    return SoftwareBitmap.create_copy_from_buffer(
        writer.detach_buffer(), BitmapPixelFormat.BGRA8,
        rgba.width, rgba.height, BitmapAlphaMode.PREMULTIPLIED)


def make_engine():
    eng = None
    try:
        lang = Language("en-US")
        if OcrEngine.is_language_supported(lang):
            eng = OcrEngine.try_create_from_language(lang)
    except Exception:
        pass
    return eng or OcrEngine.try_create_from_user_profile_languages()


async def ocr_words(img):
    engine = make_engine()
    if engine is None:
        raise RuntimeError("Windows OCR ใช้ไม่ได้ (ไม่มี language pack ภาษาอังกฤษ)")
    result = await engine.recognize_async(to_software_bitmap(img))
    words = []
    for line in result.lines:
        for w in line.words:
            r = w.bounding_rect
            words.append({
                "text": w.text,
                "x": r.x / SCALE, "y": r.y / SCALE,
                "w": r.width / SCALE, "h": r.height / SCALE,
            })
    return words


# ---------- จัดคำเป็นแถว ----------
def group_rows(words, tol=8):
    rows = []
    for w in sorted(words, key=lambda w: w["y"] + w["h"] / 2):
        cy = w["y"] + w["h"] / 2
        if rows and abs(rows[-1]["cy"] - cy) <= tol:
            rows[-1]["words"].append(w)
        else:
            rows.append({"cy": cy, "words": [w]})
    for r in rows:
        r["words"].sort(key=lambda w: w["x"])
        r["text"] = " ".join(w["text"] for w in r["words"])
    return rows


def icon_color(img, col_x, row_cy):
    """ดูสีไอคอนสถานะในคอลัมน์ Resource Usage Status ของแถวนี้: green / grey / ?
    (ทดสอบกับภาพจริงแล้ว: Online = ไอคอนเขียว, Offline = ไอคอนเทา)"""
    x0, x1 = int(col_x - 10), int(col_x + 40)
    y0, y1 = int(row_cy - 7), int(row_cy + 7)
    green = grey = 0
    for x in range(max(x0, 0), max(x1, 0)):
        for y in range(max(y0, 0), max(y1, 0)):
            r, g, b = img.getpixel((x, y))[:3]
            if g > 150 and r < 120 and b < 140:
                green += 1
            elif abs(r - g) < 25 and abs(g - b) < 25 and 100 < r < 235:
                grey += 1
    if green > 10:
        return "green"
    if grey > 10:
        return "grey"
    return "?"


def main():
    lines = [f"probe time: {datetime.now():%Y-%m-%d %H:%M:%S}"]
    win = find_ivms_window()
    if win is None:
        lines.append("RESULT: ไม่เจอหน้าต่าง iVMS-4200 (รัน Command Prompt แบบ administrator หรือยัง?)")
        return write(lines)

    try:
        if win.is_minimized():
            win.restore()
        win.set_focus()
    except Exception as e:
        lines.append(f"warn: ดึงหน้าต่างขึ้นหน้าไม่ได้ ({e!r}) — ภาพอาจโดนหน้าต่างอื่นบัง")
    time.sleep(1.5)

    lines.append(f"window: {win.window_text()!r} exe={process_name(win.element_info.process_id)}")
    try:
        scale = ctypes.windll.shcore.GetScaleFactorForDevice(0)
    except Exception:
        scale = "?"
    rect = win.rectangle()
    # จุดสำหรับหมุนล้อเมาส์: กลางตาราง (ค่อนไปทางขวาของเมนูซ้าย)
    wheel_at = (rect.left + int(rect.width() * 0.55), rect.top + int(rect.height() * 0.6))

    # เลื่อนกลับขึ้นบนสุดก่อน แล้วอ่านทีละหน้าจนไม่เจอแถวใหม่
    mouse.scroll(coords=wheel_at, wheel_dist=40)
    time.sleep(1.0)

    found = {}          # code -> (name, status, text_status, agree)
    col_x = None
    pages = 0
    no_new = 0
    while pages < MAX_PAGES and no_new < 2:
        pages += 1
        shot = ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom),
                              all_screens=True).convert("RGB")
        if pages == 1:
            shot.save(CAPTURE)
            lines.append(f"captured {shot.width}x{shot.height} -> {CAPTURE} (display scale {scale}%)")
        page_rows, col_x = read_page(shot, col_x)
        if col_x is None:
            lines.append("RESULT: ไม่เจอคอลัมน์สถานะ ❌ — ส่งไฟล์ ivms_capture.png มาให้ดู")
            return write(lines)
        new = 0
        for code, rest in page_rows:
            if code not in found:
                found[code] = rest
                new += 1
        lines.append(f"page {pages}: rows={len(page_rows)} new={new}")
        no_new = no_new + 1 if new == 0 else 0
        mouse.scroll(coords=wheel_at, wheel_dist=-WHEEL_STEP)
        time.sleep(1.0)

    stores = sorted(found.items())
    on = sum(r[1] == "Online" for _, r in stores)
    off = sum(r[1] == "Offline" for _, r in stores)
    unk = sum(r[1] == "?" for _, r in stores)
    mismatch = sum(not r[3] for _, r in stores)
    total = read_total(lines)
    lines.insert(2, f"TOTAL read: {len(stores)} (iVMS Total={total})  "
                    f"Online={on}  Offline={off}  unread={unk}  disagree={mismatch}")
    ok = stores and unk == 0 and mismatch == 0 and (total in (None, len(stores)))
    lines.insert(3, "RESULT: อ่านครบทั้งตาราง ✅" if ok else
                    "RESULT: ยังไม่ครบหรือมีแถวที่ต้องเช็ค ⚠️ — ดูรายการด้านล่าง")

    lines.append("")
    lines.append("---- OFFLINE ----")
    for code, (name, status, _, _) in stores:
        if status == "Offline":
            lines.append(f"{code} | {name}")
    lines.append("")
    lines.append("---- code | name | status (icon) | OCR text | agree ----")
    for code, (name, status, text_status, agree) in stores:
        lines.append(f"{code} | {name} | {status} | {text_status} | {'ok' if agree else 'CHECK'}")
    write(lines, preview=4 + pages + 2)


_TOTAL = {"value": None}


def read_total(_lines):
    return _TOTAL["value"]


def read_page(shot, col_x):
    """OCR หนึ่งหน้าจอ -> [(code, (name, status, text_status, agree))], col_x"""
    prep = ImageOps.invert(ImageOps.grayscale(shot)).resize(
        (shot.width * SCALE, shot.height * SCALE))
    words = asyncio.run(ocr_words(prep))

    m_total = re.search(r"Total\s*\((\d+)\)", " ".join(w["text"] for w in words))
    if m_total and _TOTAL["value"] is None:
        _TOTAL["value"] = int(m_total.group(1))

    if col_x is None:
        header = next((w for w in words
                       if w["text"].lower().startswith(("resource", "usage"))), None)
        status_words = [w for w in words if STATUS_RE.fullmatch(w["text"])]
        if header is not None:
            col_x = header["x"]
        elif status_words:
            xs = sorted(w["x"] for w in status_words)
            col_x = xs[len(xs) // 2] - 20
        else:
            return [], None

    rows = []
    for row in group_rows(words):
        m = CODE_RE.search(row["text"])
        if not m:
            continue
        color = icon_color(shot, col_x, row["cy"])
        status = {"green": "Online", "grey": "Offline"}.get(color, "?")
        s = STATUS_RE.search(row["text"])
        text_status = s.group(1).capitalize() if s else "-"
        agree = text_status in ("-", status)
        # ตัดคอลัมน์ Connection Type ที่ติดมา (OCR อาจอ่าน "Hik-Connect" เพี้ยนเป็น "H ik-Connect")
        name = re.split(r"\s+(?:\S{1,2}\s+)?H?\s?ik-?Connect", m.group(2))[0].strip()[:40]
        rows.append((m.group(1), (name, status, text_status, agree)))
    return rows, col_x


def write(lines, preview=8):
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:preview]))
    print(f"\nบันทึกผลไว้ที่ {OUT}")


if __name__ == "__main__":
    main()
