"""
desktop.py — บอกสถานะการ sync บนเครื่องที่รันสคริปต์ (10 ต.ค. 2026, ผู้ใช้ขอ)

- ระหว่าง sync: เปลี่ยนชื่อหน้าต่าง Command Prompt (เห็นที่ taskbar) เป็น "🔄 iVMS กำลัง sync…"
  ไม่ใช้ popup ตอนเริ่ม เพราะ popup จะทับ iVMS (โดยเฉพาะแถบเลื่อนมุมขวา) ทำให้รอบนั้นอ่านไม่ได้
- sync เสร็จ / ไม่สำเร็จ: แจ้งเตือน Windows (toast) มุมขวาล่าง — ขึ้นหลังอ่านเสร็จแล้ว จึงไม่กระทบการอ่าน

ทุกฟังก์ชันไม่โยน error: ถ้าแจ้งเตือนไม่ได้ (Windows ปิด notification, รันผ่าน Task Scheduler ไม่มีหน้าต่าง ฯลฯ)
แค่เขียน log แล้วทำงานต่อ
"""
from __future__ import annotations

import ctypes
from xml.sax.saxutils import escape

# Toast ของโปรแกรมที่ไม่ได้ติดตั้งแบบ app ต้องอ้าง AppUserModelID ที่มีอยู่แล้วในเครื่อง -> ใช้ของ PowerShell
_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
_BASE_TITLE = "iVMS monitor"


def set_title(text: str, log=print) -> None:
    try:
        ctypes.windll.kernel32.SetConsoleTitleW(f"{text} — {_BASE_TITLE}")
    except Exception as e:
        log(f"warn: เปลี่ยนชื่อหน้าต่างไม่ได้ ({e!r})")


def toast(title: str, body: str, log=print) -> None:
    try:
        from winsdk.windows.data.xml.dom import XmlDocument
        from winsdk.windows.ui.notifications import ToastNotification, ToastNotificationManager

        doc = XmlDocument()
        doc.load_xml(
            "<toast><visual><binding template='ToastGeneric'>"
            f"<text>{escape(title)}</text><text>{escape(body)}</text>"
            "</binding></visual><audio silent='true'/></toast>"
        )
        ToastNotificationManager.create_toast_notifier(_APP_ID).show(ToastNotification(doc))
    except Exception as e:
        log(f"warn: แสดงแจ้งเตือน Windows ไม่ได้ ({e!r})")


def syncing(log=print) -> None:
    set_title("🔄 iVMS กำลัง sync… อย่าใช้เมาส์", log)


def finished(*, at: str, status: str, total, offline: int, online: int, next_at: str, error: str | None, log=print) -> None:
    """status = monitor_runs.status ของรอบนี้ (ok / partial / suspect / failed)"""
    if status == "failed":
        set_title(f"⚠️ sync ไม่สำเร็จ {at} · รอบถัดไป {next_at}", log)
        toast("⚠️ Sync ไม่สำเร็จ", f"{at} — {error or 'ไม่ทราบสาเหตุ'}\nสถานะบนเว็บยังเป็นของรอบก่อน · ลองใหม่ {next_at}", log)
        return
    summary = f"{total} เครื่อง · Offline {offline} · Online {online}"
    if status == "ok":
        set_title(f"✅ sync complete {at} · {summary} · รอบถัดไป {next_at}", log)
        toast("✅ Sync complete", f"{at} · {summary}\nรอบถัดไป {next_at}", log)
    elif status == "partial":
        set_title(f"🟡 sync ไม่ครบ {at} · {summary} · รอบถัดไป {next_at}", log)
        toast("🟡 Sync ไม่ครบทุกเครื่อง", f"{at} · {summary}\nอัปเดตเฉพาะที่อ่านได้ · รอบถัดไป {next_at}", log)
    else:  # suspect
        set_title(f"⚠️ สงสัยปัญหาฝั่งกลาง {at} · รอบถัดไป {next_at}", log)
        toast("⚠️ Offline เกือบทั้งหมด", f"{at} · {summary}\nน่าจะเป็นเน็ต HQ / Hik-Connect — ยังไม่เปลี่ยนสถานะสาขา", log)
