"""
probe_scroll.py — ทดสอบว่าเลื่อนตาราง Cloud P2P Device ด้วยการ "คลิก/ลากแถบเลื่อน" ได้ไหม (10 ต.ค. 2026)

ทำไม: ตอนนี้สคริปต์อ่านได้แค่หน้าแรก (~26 แถว) เพราะ iVMS ไม่รับล้อเมาส์ / Page Down (ทดสอบ 7 ต.ค.)
ถ้าคลิกแถบเลื่อนได้ สคริปต์จะอ่านครบทุกแถว (67) แล้ว sync ทุกสาขาที่เห็นได้ ไม่ว่าจะบัญชีไหน

วิธีรัน (หยุด monitor.py ก่อน, iVMS เปิดหน้า Cloud P2P Device, ห้ามใช้เมาส์ระหว่างทดสอบ ~20 วิ):
    python probe_scroll.py

สคริปต์นี้คลิกเฉพาะบนแถบเลื่อนด้านขวาของตาราง ไม่กดปุ่มอื่น ไม่เลือกแถว ไม่ลบอะไร
ผลลัพธ์: พิมพ์รหัสสาขาที่อ่านได้ในแต่ละขั้น + บันทึกภาพ probe_scroll_*.png ไว้ดู
"""
from __future__ import annotations

import time

from pywinauto import mouse

from ivms_reader import (
    find_ivms_window, _bring_to_front, _minimize_own_console, _check_unobstructed,
    _grab, read_page, ReaderError,
)


def codes_of(shot):
    rows, total, words = read_page(shot)
    return [c for c, _, _ in rows], total, words


def find_scrollbar(shot, header_y):
    """หาแถบเลื่อนแนวตั้งที่ขอบขวา: คอลัมน์พิกเซลที่มีช่วง 'สว่างกว่าพื้น' ยาวที่สุด = ตัว thumb"""
    w, h = shot.size
    y0, y1 = int(header_y + 20), h - 8
    best = None
    for x in range(w - 3, max(w - 60, 0), -1):
        vals = [sum(shot.getpixel((x, y))[:3]) / 3 for y in range(y0, y1)]
        if not vals:
            continue
        bg = sorted(vals)[len(vals) // 4]          # ระดับพื้น (quartile ล่าง)
        run = start = 0
        best_run = (0, 0, 0)
        for i, v in enumerate(vals):
            if v > bg + 25:
                if run == 0:
                    start = i
                run += 1
                if run > best_run[0]:
                    best_run = (run, start, start + run)
            else:
                run = 0
        if best_run[0] >= 25 and (best is None or best_run[0] > best[1]):
            best = (x, best_run[0], y0 + best_run[1], y0 + best_run[2])
    return best  # (x, length, thumb_top, thumb_bottom) in window coords, or None


def main():
    win = find_ivms_window()
    if win is None:
        print("ไม่เจอหน้าต่าง iVMS-4200")
        return
    _minimize_own_console()
    _bring_to_front(win)
    time.sleep(1.5)
    rect = win.rectangle()
    try:
        _check_unobstructed(win, rect)
    except ReaderError as e:
        print("หยุด:", e)
        return

    shot0 = _grab(rect)
    shot0.save("probe_scroll_0.png")
    codes0, total, words = codes_of(shot0)
    print(f"[0] หน้าแรก: Total={total} อ่านได้ {len(codes0)} แถว: {codes0}")

    header = next((w for w in words if w["text"] == "Name"), None)
    header_y = header["y"] if header else 100
    sb = find_scrollbar(shot0, header_y)
    if not sb:
        print("หาแถบเลื่อนไม่เจอ (ส่งภาพ probe_scroll_0.png มาให้ดู)")
        return
    x, length, top, bottom = sb
    print(f"แถบเลื่อน: x={x} thumb {top}-{bottom} (ยาว {length}px) ความสูงหน้าต่าง {rect.bottom - rect.top}")
    sx = rect.left + x

    # A) คลิกที่ราง ใต้ thumb (เท่ากับ "เลื่อนลง 1 หน้า" ในโปรแกรมทั่วไป)
    click_y = min(bottom + 20, rect.bottom - rect.top - 12)
    mouse.click(coords=(sx, rect.top + click_y))
    time.sleep(2.0)
    shotA = _grab(rect)
    shotA.save("probe_scroll_A.png")
    codesA, _, _ = codes_of(shotA)
    newA = [c for c in codesA if c not in codes0]
    print(f"[A] คลิกรางใต้ thumb: อ่านได้ {len(codesA)} แถว, ใหม่ {len(newA)}: {newA}")

    # B) ลาก thumb ลงล่างสุด
    mid = (top + bottom) // 2
    mouse.press(coords=(sx, rect.top + mid))
    for step in range(1, 11):
        mouse.move(coords=(sx, rect.top + mid + int((rect.bottom - rect.top - mid) * step / 10)))
        time.sleep(0.05)
    mouse.release(coords=(sx, rect.bottom - 5))
    time.sleep(2.0)
    shotB = _grab(rect)
    shotB.save("probe_scroll_B.png")
    codesB, _, _ = codes_of(shotB)
    newB = [c for c in codesB if c not in codes0]
    print(f"[B] ลาก thumb ลงล่าง: อ่านได้ {len(codesB)} แถว, ใหม่ {len(newB)}: {newB}")

    seen = sorted(set(codes0) | set(codesA) | set(codesB))
    print(f"รวมรหัสที่เห็นทั้งหมด {len(seen)} จาก Total {total}")
    if newA or newB:
        print("ผล: เลื่อนตารางด้วยแถบเลื่อนได้ ✅ ทำต่อให้อ่านครบทุกแถวได้")
    else:
        print("ผล: เลื่อนไม่ได้ ❌ (ส่งภาพ probe_scroll_*.png มาให้ดู)")
    print(">> เลื่อนตารางใน iVMS กลับขึ้นบนสุดด้วยมือ ก่อนรัน monitor.py ต่อ")


if __name__ == "__main__":
    main()
