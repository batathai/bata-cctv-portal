"""
probe_refresh.py — ทดสอบว่าสคริปต์สั่งให้ iVMS-4200 โหลดสถานะใหม่ (Refresh) ได้หรือไม่
ใช้ฟังก์ชันอ่านภาพจาก probe_ocr.py (หรือ probe_ocr_v6.py) ที่อยู่โฟลเดอร์เดียวกัน

ทดสอบ 2 วิธี แล้วดูว่าหน้าจอเปลี่ยนไหม:
  วิธี 1: คลิกปุ่ม Refresh (หาตำแหน่งปุ่มจาก OCR)
  วิธี 2: สลับแท็บ Device -> Cloud P2P Device ผ่าน UI Automation (ไม่ใช้เมาส์)
ไม่แก้ค่าใดๆ ใน iVMS — Refresh และการสลับแท็บแค่โหลดรายการใหม่

วิธีใช้ (Command Prompt แบบ administrator, iVMS เปิดหน้า Cloud P2P Device):
  python probe_refresh.py
  ระหว่างรัน (~30 วินาที) อย่าขยับเมาส์ และช่วยดูหน้าจอ iVMS ว่ามีการโหลดใหม่ไหม
"""
import asyncio
import importlib.util
import os
import sys
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = "ivms_refresh_probe.txt"


def load_probe():
    # เลือกตัวใหม่ก่อน และต้องมี read_page (ไฟล์ probe_ocr รุ่นแรกๆ ยังไม่มี)
    names = ["probe_ocr_v6.py"] + sorted(
        (n for n in os.listdir(HERE) if n.startswith("probe_ocr") and n.endswith(".py")
         and n != "probe_ocr_v6.py"),
        key=lambda n: os.path.getmtime(os.path.join(HERE, n)), reverse=True)
    for name in names:
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            continue
        spec = importlib.util.spec_from_file_location("probe_ocr", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)         # ตั้ง DPI awareness + import ไลบรารีให้ด้วย
        if hasattr(mod, "read_page") and hasattr(mod, "find_ivms_window"):
            return mod, name
    sys.exit("ไม่เจอ probe_ocr_v6.py ในโฟลเดอร์เดียวกัน")


P, PROBE_NAME = load_probe()
from pywinauto import mouse            # noqa: E402  (import หลังตั้ง DPI awareness)
from PIL import ImageChops, ImageGrab, ImageOps  # noqa: E402


def grab(rect):
    return ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom),
                          all_screens=True).convert("RGB")


def words_of(shot):
    prep = ImageOps.invert(ImageOps.grayscale(shot)).resize(
        (shot.width * P.SCALE, shot.height * P.SCALE))
    return asyncio.run(P.ocr_words(prep))


def snapshot(rect):
    """ภาพ + สรุปตาราง (แถวแรก 5 แถว และจำนวน Offline ที่เห็น)"""
    shot = grab(rect)
    rows, _ = P.read_page(shot, None)
    offline = [c for c, r in rows if r[1] == "Offline"]
    top = [f"{c}:{r[1][:3]}" for c, r in rows[:5]]
    return shot, offline, top


def changed(a, b):
    """สัดส่วนพิกเซลที่ต่างกันในส่วนตาราง (ตัดเมนูซ้าย/แถบบน)"""
    w, h = a.size
    box = (int(w * 0.15), int(h * 0.15), w, h)
    diff = ImageChops.difference(a.crop(box), b.crop(box)).convert("L")
    hist = diff.histogram()
    moved = sum(hist[30:])
    return moved / max(1, sum(hist))


def main():
    lines = [f"probe time: {datetime.now():%Y-%m-%d %H:%M:%S}  (using {PROBE_NAME})"]
    win = P.find_ivms_window()
    if win is None:
        lines.append("RESULT: ไม่เจอหน้าต่าง iVMS-4200")
        return write(lines)
    try:
        if win.is_minimized():
            win.restore()
        win.set_focus()
    except Exception as e:
        lines.append(f"warn set_focus: {e!r}")
    time.sleep(1.5)
    rect = win.rectangle()

    before, off0, top0 = snapshot(rect)
    lines.append(f"before : offline={len(off0)} top={top0}")

    # ---- วิธี 1: คลิกปุ่ม Refresh ----
    words = words_of(before)
    btn = next((w for w in words if w["text"].lower().startswith("refresh")), None)
    if btn is None:
        lines.append("method1 click Refresh : ไม่เจอปุ่ม Refresh จาก OCR")
        after1 = before
    else:
        x = rect.left + int(btn["x"] + btn["w"] / 2)
        y = rect.top + int(btn["y"] + btn["h"] / 2)
        mouse.click(coords=(x, y))
        time.sleep(0.6)
        mid = grab(rect)                         # ช่วงกำลังโหลด (ถ้ามี spinner)
        time.sleep(5)
        after1, off1, top1 = snapshot(rect)
        lines.append(f"method1 click Refresh : screen change during={changed(before, mid):.1%} "
                     f"after={changed(before, after1):.1%}  offline={len(off1)} top={top1}")

    # ---- วิธี 2: สลับแท็บผ่าน UI Automation ----
    try:
        device_tab = win.child_window(title="Device", control_type="Button")
        cloud_tab = win.child_window(title="Cloud P2P Device", control_type="Button")
        device_tab.invoke()
        time.sleep(2)
        on_device = grab(rect)
        cloud_tab.invoke()
        time.sleep(5)
        after2, off2, top2 = snapshot(rect)
        lines.append(f"method2 switch tabs (UIA) : device-tab change={changed(after1, on_device):.1%} "
                     f"back change={changed(after1, after2):.1%}  offline={len(off2)} top={top2}")
    except Exception as e:
        lines.append(f"method2 switch tabs (UIA) : ERROR {e!r}")

    lines.append("")
    lines.append("อ่านผล: screen change มากกว่า ~1% = iVMS ตอบสนองต่อคำสั่ง; 0.0% = ไม่ตอบสนอง")
    lines.append("ถ้า top= เปลี่ยนจาก Off เป็น On หลังวิธีใด แปลว่าวิธีนั้นทำให้การเรียงลำดับรีเซ็ต")
    write(lines)


def write(lines):
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))
    print(f"\nบันทึกผลไว้ที่ {OUT}")


if __name__ == "__main__":
    main()
