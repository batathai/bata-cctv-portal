"""
probe_ocr.py — ทดสอบอ่านตาราง Cloud P2P Device ของ iVMS-4200 จากภาพหน้าจอ
อ่านอย่างเดียว: ไม่กดปุ่ม ไม่แก้ค่าใดๆ ใน iVMS (แค่ดึงหน้าต่าง iVMS ขึ้นมาด้านหน้าเพื่อถ่ายภาพ)

ใช้ OCR ที่มากับ Windows 10/11 (Windows.Media.Ocr) + เช็คสีไอคอนสถานะ

วิธีใช้ (Command Prompt แบบ Run as administrator):
  1. pip install winsdk pillow
  2. เปิด iVMS-4200 หน้า Maintenance and Management > Device > Cloud P2P Device
  3. python probe_ocr.py
  4. ส่งไฟล์ ivms_ocr_probe.txt กลับมา (ไฟล์ ivms_capture.png คือภาพที่สคริปต์เห็น ใช้เช็คได้)
"""
import asyncio
import re
import sys
import time
from datetime import datetime

try:
    from pywinauto import Desktop
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
    for w in Desktop(backend="uia").windows():
        try:
            title = w.window_text() or ""
            exe = process_name(w.element_info.process_id)
        except Exception:
            continue
        if "ivms" in exe.lower() or "ivms" in title.lower():
            return w
    return None


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

    rect = win.rectangle()
    shot = ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom),
                          all_screens=True).convert("RGB")
    shot.save(CAPTURE)
    lines.append(f"captured {shot.width}x{shot.height} -> {CAPTURE}")

    # ธีมมืด: กลับสีเป็นตัวดำพื้นขาว + ขยาย ก่อน OCR
    prep = ImageOps.invert(ImageOps.grayscale(shot)).resize(
        (shot.width * SCALE, shot.height * SCALE))
    words = asyncio.run(ocr_words(prep))
    lines.append(f"OCR words: {len(words)}")

    # หาตำแหน่งคอลัมน์สถานะจากหัวตาราง "Resource Usage Status"
    header = next((w for w in words if w["text"].lower().startswith("resource")), None)
    if header is None:
        lines.append("RESULT: ไม่เจอหัวคอลัมน์ 'Resource Usage Status' ❌ "
                     "(เปิดหน้า Cloud P2P Device ไว้หรือยัง?)")
        return write(lines)
    col_x = header["x"]

    stores = []
    for row in group_rows(words):
        m = CODE_RE.search(row["text"])
        if not m:
            continue
        color = icon_color(shot, col_x, row["cy"])
        status = {"green": "Online", "grey": "Offline"}.get(color, "?")
        s = STATUS_RE.search(row["text"])          # ตัวหนังสือ ใช้เป็นตัวเช็คเสริม
        text_status = s.group(1).capitalize() if s else "-"
        agree = text_status in ("-", status)
        stores.append((m.group(1), m.group(2)[:30], status, text_status, agree))

    on = sum(s[2] == "Online" for s in stores)
    off = sum(s[2] == "Offline" for s in stores)
    unk = sum(s[2] == "?" for s in stores)
    mismatch = sum(not s[4] for s in stores)
    lines.append(f"rows with store code: {len(stores)}  "
                 f"(Online={on}, Offline={off}, unread={unk})")
    lines.append(f"icon vs OCR text disagree: {mismatch}")
    if stores and unk == 0 and mismatch == 0:
        lines.append("RESULT: อ่านจากภาพได้ ✅")
    elif stores:
        lines.append("RESULT: อ่านได้บางส่วน ⚠️ — ดูรายการด้านล่าง")
    else:
        lines.append("RESULT: อ่านจากภาพไม่ได้ ❌")

    lines.append("")
    lines.append("---- code | name | status (icon) | OCR text | agree ----")
    for code, name, status, text_status, agree in stores:
        lines.append(f"{code} | {name} | {status} | {text_status} | {'ok' if agree else 'CHECK'}")
    lines.append("")
    lines.append("---- raw OCR rows (first 80) ----")
    for row in group_rows(words)[:80]:
        lines.append(row["text"])
    write(lines)


def write(lines):
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:8]))
    print(f"\nบันทึกผลไว้ที่ {OUT}")


if __name__ == "__main__":
    main()
