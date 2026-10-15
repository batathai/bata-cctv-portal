"""
serials.py — จับคู่เครื่องใน iVMS กับสาขาด้วย Serial (ไม่แตะ Windows/เน็ต ทดสอบได้ทุกเครื่อง)

ที่มา (15 ต.ค.): บัญชี iVMS บนเครื่อง HQ ไม่ได้ตั้งชื่อเครื่องเป็นรหัสสาขา ชื่อเป็นค่าเริ่มต้น
"DS-7204HGHI-K1(G83641193)" จึงหารหัส 5 หลักไม่เจอ -> ใช้ Serial No. แทน
เทียบกับ cctv_assets.nvr_serial และ cctv_assets.hik_uid ของสาขาที่เปิดอยู่

ตัวอ่านส่ง key ของเครื่องที่ไม่มีรหัสสาขามาแบบ "SN:<serial จากคอลัมน์>[,<serial ในวงเล็บของชื่อ>]"
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

SERIAL_PREFIX = "SN:"

# ตัวที่ OCR สับสนบ่อย -> แปลงทั้งฝั่ง OCR และฝั่ง DB เป็นตัวเดียวกันก่อนเทียบ
_CONFUSABLE = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "|": "1",
                             "Z": "2", "S": "5", "G": "6", "B": "8"})
MIN_SERIAL_LEN = 6


def clean(s: Optional[str]) -> str:
    """ตัวพิมพ์ใหญ่ ตัดทุกอย่างที่ไม่ใช่ A-Z 0-9"""
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def canon(s: Optional[str]) -> str:
    return clean(s).translate(_CONFUSABLE)


def make_key(col_serial: str, paren_serial: str = "") -> Optional[str]:
    """สร้าง key ของเครื่องจาก serial ที่อ่านได้ 2 ที่ (คอลัมน์ Serial No. และวงเล็บในชื่อ)"""
    good = [c for c in (clean(col_serial), clean(paren_serial)) if len(c) >= MIN_SERIAL_LEN and re.search(r"\d", c)]
    if not good:
        return None
    if len(good) == 2 and canon(good[0]) == canon(good[1]):
        # สองที่ต่างกันแค่ตัวที่หน้าตาคล้าย (FM1646O55 / FM1646055) = เครื่องเดียวกัน -> เหลือตัวเดียว
        # เลือกตัวที่ดูเป็น serial จริง (ตัวอักษรนำ + ตัวเลขล้วน) ให้ key นิ่งเหมือนกันทุกครั้งที่อ่าน
        neat = [c for c in good if re.fullmatch(r"[A-Z]{1,3}\d{6,10}", c)]
        good = [neat[-1] if neat else good[0]]
    return SERIAL_PREFIX + ",".join(dict.fromkeys(good))


def is_serial_key(key: str) -> bool:
    return key.startswith(SERIAL_PREFIX)


def key_serials(key: str) -> list:
    return [s for s in key[len(SERIAL_PREFIX):].split(",") if s] if is_serial_key(key) else []


def display(key: str) -> str:
    """ใช้แสดงในหน้า Rollout / log"""
    return key_serials(key)[0] if is_serial_key(key) else key



class SerialIndex:
    """serial ใน DB -> store_id

    ลำดับการจับคู่ (ต้องได้สาขาเดียวเท่านั้น ถ้าได้หลายสาขา = ไม่จับคู่):
      1) ตรงกันทุกตัว (หลังแปลงตัวที่ OCR สับสน)
      2) serial ใน DB เป็นแบบยาว (เช่น DS-7204HGHI-K10120211015CCRRG83641193WCVU) ที่มี serial สั้นอยู่ข้างใน
    ไม่ยอมรับ "ต่างกัน 1 ตัว": serial ของเครื่องล็อตเดียวกันเรียงติดกัน (G83641193, G83641198 ...)
    ถ้าเครื่องหนึ่งยังไม่มี serial ใน DB จะไปติดสาขาของเครื่องข้างๆ ผิดสาขาเงียบๆ
    กันอ่านผิดด้วยการอ่าน 2 ที่ (คอลัมน์ Serial No. + วงเล็บในชื่อ) แทน
    """

    def __init__(self, pairs: Iterable[tuple]):
        self._items = []  # [(canon_serial, store_id)]
        seen = set()
        for sid, serial in pairs:
            c = canon(serial)
            if len(c) >= MIN_SERIAL_LEN and (c, sid) not in seen:
                seen.add((c, sid))
                self._items.append((c, sid))

    def __len__(self):
        return len(self._items)

    def _one(self, sids) -> Optional[str]:
        sids = set(sids)
        return next(iter(sids)) if len(sids) == 1 else None

    def lookup(self, serial: str) -> tuple:
        """คืน (store_id หรือ None, เหตุผล) — เหตุผล: exact | contains | ambiguous | none"""
        q = canon(serial)
        if len(q) < MIN_SERIAL_LEN:
            return None, "none"
        for how, test in (("exact", lambda c: c == q),
                          ("contains", lambda c: len(c) > len(q) and q in c)):
            hits = [sid for c, sid in self._items if test(c)]
            if hits:
                sid = self._one(hits)
                return (sid, how) if sid else (None, "ambiguous")
        return None, "none"

    def resolve_key(self, key: str) -> tuple:
        """key แบบ SN:a[,b] -> (store_id หรือ None, เหตุผล)
        ลอง serial ทุกตัวใน key: ต้องชี้ไปสาขาเดียวกัน ถ้าชี้คนละสาขา = ambiguous"""
        found, reasons = {}, []
        for s in key_serials(key):
            sid, how = self.lookup(s)
            reasons.append(how)
            if sid:
                found.setdefault(sid, how)
        if len(found) == 1:
            sid, how = next(iter(found.items()))
            return sid, how
        if len(found) > 1 or "ambiguous" in reasons:
            return None, "ambiguous"
        return None, "none"
