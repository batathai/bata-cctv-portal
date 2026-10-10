"""
ivms_reader.py — อ่านหน้า Cloud P2P Device ของ iVMS-4200 จากภาพหน้าจอ (Windows เท่านั้น)

ยกมาจาก probe_ocr.py (v6) + probe_refresh.py ที่ทดสอบผ่านแล้ว 2026-10-07:
  - หาหน้าต่าง iVMS-4200 (ต้องตรงทั้งชื่อหน้าต่างและโปรแกรม ไม่จับ Notepad)
  - คลิกปุ่ม Refresh -> รอให้หน้าจอนิ่ง (~20 วิ)
  - OCR + ดูสีไอคอนสถานะ (เขียว = Online, เทา = Offline) อ่าน 2 ครั้งห่างกัน ต้องตรงกัน
  - ตารางต้องเรียง Offline ไว้บนสุด (คลิกหัวคอลัมน์ Resource Usage Status ครั้งเดียว ลำดับค้างหลัง Refresh)
ไม่กดปุ่มอื่นใน iVMS นอกจาก Refresh
"""
from __future__ import annotations

import asyncio
import ctypes
import re
import time

from state import ReadResult

# ต้องตั้งก่อน import pywinauto: ให้พิกัดหน้าต่างกับภาพหน้าจอเป็นพิกเซลจริงชุดเดียวกัน
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

from pywinauto import Desktop, mouse  # noqa: E402
from PIL import ImageGrab, ImageOps  # noqa: E402
from winsdk.windows.media.ocr import OcrEngine  # noqa: E402
from winsdk.windows.globalization import Language  # noqa: E402
from winsdk.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat, BitmapAlphaMode  # noqa: E402
from winsdk.windows.storage.streams import DataWriter  # noqa: E402

SCALE = 2
SETTLE_SECONDS = 20          # หลัง Refresh หน้าจอยังไม่นิ่ง ~5 วิ (ทดสอบแล้ว) เผื่อไว้ 20
SECOND_READ_GAP = 5
# ชื่อเครื่องใน iVMS มีทั้ง "52017 - Lotus Maesot" และ "52002 CentralPlaza Chiang Rai" (ไม่มีขีด)
# เดิมบังคับต้องมีขีด -> แถวแบบไม่มีขีดถูกข้ามเงียบๆ (พบ 10 ต.ค.: Offline 10 แต่อ่านได้ 8)
CODE_RE = re.compile(r"\b(\d{5})\s*(?:[-–]\s*)?([^\d\s].*)")
STATUS_RE = re.compile(r"\b(Online|Offline)\b", re.I)
TOTAL_RE = re.compile(r"Total\s*\((\d+)\)")
CAPTURE = "ivms_capture.png"


class ReaderError(Exception):
    pass


# ---------- หน้าต่าง ----------
def _process_name(pid):
    try:
        import win32api, win32con, win32process
        h = win32api.OpenProcess(win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        try:
            return win32process.GetModuleFileNameEx(h, 0).split("\\")[-1]
        finally:
            win32api.CloseHandle(h)
    except Exception:
        return "?"


def find_ivms_window():
    by_title = None
    for w in Desktop(backend="uia").windows():
        try:
            title = (w.window_text() or "").strip()
            exe = _process_name(w.element_info.process_id).lower()
        except Exception:
            continue
        if exe.startswith("ivms") and title == "iVMS-4200":
            return w
        if title == "iVMS-4200" and exe not in ("notepad.exe", "python.exe", "cmd.exe"):
            by_title = by_title or w
    return by_title


def _bring_to_front(win, log=print):
    """ดึง iVMS ขึ้นบนสุดก่อนจับภาพ (ภาพจับตามพื้นที่หน้าต่าง ถ้ามีหน้าต่างอื่นบังจะอ่านผิด)
    pywinauto set_focus() ใช้ไม่ได้กับ iVMS บางเครื่อง (NoPatternInterfaceError) -> ใช้ Win32 API แทน"""
    try:
        if win.is_minimized():
            win.restore()
    except Exception:
        pass
    try:
        win.set_focus()
        return
    except Exception as e:
        first_err = e
    try:
        import win32con, win32gui, win32api
        hwnd = win.handle
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        # Windows อนุญาตให้ย้ายหน้าต่างขึ้นหน้าได้หลังมีการกดคีย์ -> กด/ปล่อย Alt หนึ่งครั้ง
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0, 0, 0, 0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
        win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0, 0, 0, 0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
        win32gui.SetForegroundWindow(hwnd)
    except Exception as e:
        log(f"warn: ดึงหน้าต่างขึ้นหน้าไม่ได้ ({first_err!r} / {e!r}) — ย่อหน้าต่างอื่นที่บัง iVMS ออก")


def _minimize_own_console(log=print):
    """ย่อหน้าต่าง Command Prompt ที่รันสคริปต์นี้เอง ก่อนอ่านทุกรอบ — ไม่ให้ไปทับ iVMS
    (พบจริง 10 ต.ค.: หน้าต่างนี้ทับคอลัมน์สถานะ ทำให้อ่านผิด) ดู log ได้ที่ monitor.log หรือหน้าเว็บ"""
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd and not ctypes.windll.user32.IsIconic(hwnd):
            ctypes.windll.user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
            time.sleep(0.5)
    except Exception as e:  # รันแบบไม่มีหน้าต่าง (pythonw / Task Scheduler) ก็ไม่เป็นไร
        log(f"warn: ย่อหน้าต่าง Command Prompt ไม่ได้ ({e!r})")


def _window_at(x, y):
    """(hwnd, pid, title) of the top-level window that is visible at screen point (x, y)."""
    import win32con, win32gui, win32process
    h = win32gui.WindowFromPoint((x, y))
    root = win32gui.GetAncestor(h, win32con.GA_ROOT) if h else 0
    pid = win32process.GetWindowThreadProcessId(root)[1] if root else 0
    title = win32gui.GetWindowText(root) if root else ""
    return root, pid, title


def _check_unobstructed(win, rect):
    """ภาพจับตามพื้นที่บนจอ: ถ้ามีหน้าต่างอื่น (เช่น Command Prompt, เบราว์เซอร์) บัง iVMS อยู่
    สคริปต์จะอ่านหน้าต่างนั้นแทนไอคอนสถานะ -> ได้ "Offline 0" ปลอม แล้วทุกสาขาถูกรีเซ็ตเป็น Online
    (พบจริง 10 ต.ค. บนเครื่อง Design) จึงตรวจจุดตัวอย่างทั่วหน้าต่างก่อนอ่าน ถ้าจุดไหนไม่ใช่ iVMS
    ให้ล้มรอบนี้ (status=failed ไม่เปลี่ยนสถานะใคร) ดีกว่าอ่านผิด"""
    try:
        import win32process
        ivms_pid = win32process.GetWindowThreadProcessId(win.handle)[1]
    except Exception:
        return  # ไม่มี pywin32 -> ข้ามการตรวจ (พฤติกรรมเดิม)
    w, h = rect.right - rect.left, rect.bottom - rect.top
    for fx in (0.05, 0.25, 0.5, 0.62, 0.75, 0.95):
        for fy in (0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95):
            x, y = rect.left + int(w * fx), rect.top + int(h * fy)
            hwnd, pid, title = _window_at(x, y)
            if pid and pid != ivms_pid:
                raise ReaderError(f"มีหน้าต่างอื่นบัง iVMS อยู่ ('{title or 'ไม่มีชื่อ'}') — ย่อหรือย้ายหน้าต่างนั้นออกจากพื้นที่ iVMS")


def _grab(rect):
    return ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom), all_screens=True).convert("RGB")


# ---------- OCR ----------
def _to_software_bitmap(img):
    from PIL import Image
    rgba = img.convert("RGBA")
    r, g, b, a = rgba.split()
    bgra = Image.merge("RGBA", (b, g, r, a)).tobytes()
    writer = DataWriter()
    try:
        writer.write_bytes(bgra)
    except TypeError:
        writer.write_bytes(list(bgra))
    return SoftwareBitmap.create_copy_from_buffer(writer.detach_buffer(), BitmapPixelFormat.BGRA8,
                                                  rgba.width, rgba.height, BitmapAlphaMode.PREMULTIPLIED)


_ENGINE = None


def _engine():
    global _ENGINE
    if _ENGINE is None:
        try:
            lang = Language("en-US")
            if OcrEngine.is_language_supported(lang):
                _ENGINE = OcrEngine.try_create_from_language(lang)
        except Exception:
            pass
        _ENGINE = _ENGINE or OcrEngine.try_create_from_user_profile_languages()
        if _ENGINE is None:
            raise ReaderError("Windows OCR ใช้ไม่ได้ (ไม่มี language pack ภาษาอังกฤษ)")
    return _ENGINE


async def _ocr_words_async(img):
    result = await _engine().recognize_async(_to_software_bitmap(img))
    words = []
    for line in result.lines:
        for w in line.words:
            r = w.bounding_rect
            words.append({"text": w.text, "x": r.x / SCALE, "y": r.y / SCALE, "w": r.width / SCALE, "h": r.height / SCALE})
    return words


def ocr_words(shot):
    prep = ImageOps.invert(ImageOps.grayscale(shot)).resize((shot.width * SCALE, shot.height * SCALE))
    return asyncio.run(_ocr_words_async(prep))


def _group_rows(words, tol=8):
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


def _icon_color(img, col_x, row_cy):
    x0, x1 = int(col_x - 10), int(col_x + 40)
    y0, y1 = int(row_cy - 7), int(row_cy + 7)
    green = grey = 0
    for x in range(max(x0, 0), min(max(x1, 0), img.width)):
        for y in range(max(y0, 0), min(max(y1, 0), img.height)):
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


def read_page(shot):
    """หนึ่งภาพ -> (rows=[(code, name, status)], total, words)"""
    words = ocr_words(shot)
    joined = " ".join(w["text"] for w in words)
    m_total = TOTAL_RE.search(joined)
    total = int(m_total.group(1)) if m_total else None

    header = next((w for w in words if w["text"].lower().startswith(("resource", "usage"))), None)
    status_words = [w for w in words if STATUS_RE.fullmatch(w["text"])]
    if header is not None:
        col_x = header["x"]
    elif status_words:
        xs = sorted(w["x"] for w in status_words)
        col_x = xs[len(xs) // 2] - 20
    else:
        return [], total, words

    rows = []
    for row in _group_rows(words):
        m = CODE_RE.search(row["text"])
        if not m:
            continue
        status = {"green": "Online", "grey": "Offline"}.get(_icon_color(shot, col_x, row["cy"]), "?")
        if status == "?":
            s = STATUS_RE.search(row["text"])
            status = s.group(1).capitalize() if s else "?"
        name = re.split(r"\s+(?:\S{1,2}\s+)?H?\s?ik-?Connect", m.group(2))[0].strip()[:60]
        rows.append((m.group(1), name, status))
    return rows, total, words


def _summarize(rows, total):
    statuses = [r[2] for r in rows]
    if total and not rows:
        raise ReaderError(f"iVMS บอก Total({total}) แต่อ่านแถวในตารางไม่ได้เลย")
    if "?" in statuses:
        raise ReaderError(f"อ่านสถานะไม่ได้ {statuses.count('?')} แถว")
    first_online = statuses.index("Online") if "Online" in statuses else len(statuses)
    if any(s != "Online" for s in statuses[first_online:]):
        seen = ", ".join(f"{c}:{s[:3]}" for c, _, s in rows[:30])
        raise ReaderError("ตารางไม่ได้เรียง Offline ไว้บนสุด — คลิกหัวคอลัมน์ 'Resource Usage Status' ใน iVMS 1 ครั้ง"
                          f" | ลำดับที่อ่านได้ ({len(rows)} แถว): {seen}")
    offline = [(c, n) for c, n, s in rows if s == "Offline"]
    page_full = bool(rows) and first_online == len(statuses)
    return {"total": total, "offline": offline, "page_full": page_full}


def read_ivms(log=print, save_capture=False) -> ReadResult:
    """กด Refresh แล้วอ่าน 2 ครั้ง ต้องได้ผลตรงกัน ; คืน ReadResult(ok=False, error=...) เมื่ออ่านไม่ได้"""
    try:
        win = find_ivms_window()
        if win is None:
            raise ReaderError("ไม่เจอหน้าต่าง iVMS-4200 (เปิดค้างไว้และรันสคริปต์แบบ administrator หรือยัง?)")
        _minimize_own_console(log)
        _bring_to_front(win, log)
        time.sleep(1.5)
        rect = win.rectangle()

        _check_unobstructed(win, rect)
        before = _grab(rect)
        words = ocr_words(before)
        btn = next((w for w in words if w["text"].lower().startswith("refresh")), None)
        if btn is None:
            raise ReaderError("ไม่เจอปุ่ม Refresh — iVMS ต้องเปิดหน้า Cloud P2P Device")
        mouse.click(coords=(rect.left + int(btn["x"] + btn["w"] / 2), rect.top + int(btn["y"] + btn["h"] / 2)))
        time.sleep(SETTLE_SECONDS)

        _bring_to_front(win, log)  # อาจถูกบังระหว่างรอ 20 วิ
        time.sleep(1.0)
        rect = win.rectangle()
        _check_unobstructed(win, rect)
        shot1 = _grab(rect)
        rows1, total1, _ = read_page(shot1)
        time.sleep(SECOND_READ_GAP)
        _check_unobstructed(win, rect)
        shot2 = _grab(rect)
        rows2, total2, _ = read_page(shot2)
        if save_capture:
            shot2.save(CAPTURE)

        if total1 is None or total2 is None:
            raise ReaderError("อ่านยอดรวม Total(...) ไม่ได้")
        a, b = _summarize(rows1, total1), _summarize(rows2, total2)
        if a["total"] != b["total"] or sorted(a["offline"]) != sorted(b["offline"]):
            raise ReaderError(f"อ่าน 2 ครั้งไม่ตรงกัน (Offline {len(a['offline'])} vs {len(b['offline'])}, Total {a['total']} vs {b['total']})")
        return ReadResult(ok=True, total=b["total"], offline=b["offline"], page_full=b["page_full"])
    except ReaderError as e:
        return ReadResult(ok=False, error=str(e))
    except Exception as e:  # ไม่ให้ loop หลักตาย
        return ReadResult(ok=False, error=f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    # ทดสอบอ่านอย่างเดียว ไม่เขียนอะไรขึ้น Supabase: python ivms_reader.py
    r = read_ivms(save_capture=True)
    print(r)
    print(f"ภาพที่สคริปต์เห็นบันทึกไว้ที่ {CAPTURE}")
