"""
notify.py — ส่งเมลผ่าน Gmail SMTP 587 + STARTTLS (ทดสอบผ่านแล้วที่ HQ)
ใช้ App Password 16 หลักของบัญชีผู้ส่ง (เก็บใน .env)
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from state import Email


class Mailer:
    def __init__(self, user: str, app_password: str, host: str = "smtp.gmail.com", port: int = 587,
                 sender_name: str = "BATA CCTV Monitor"):
        self.user, self.password = user, (app_password or "").replace(" ", "")
        self.host, self.port, self.sender_name = host, port, sender_name

    @property
    def configured(self) -> bool:
        return bool(self.user and self.password)

    def send(self, e: Email) -> None:
        if not self.configured:
            raise RuntimeError("ยังไม่ได้ตั้ง GMAIL_USER / GMAIL_APP_PASSWORD ใน .env")
        if not e.to:
            raise RuntimeError("ไม่มีผู้รับ")
        msg = EmailMessage()
        msg["Subject"] = e.subject
        msg["From"] = formataddr((self.sender_name, self.user))
        msg["To"] = ", ".join(e.to)
        # เมลที่ไม่มี Date / Message-ID ถูกระบบกรองเมลองค์กร (เช่น Microsoft 365) กักเงียบๆ ได้
        # DVR และหน้าเว็บ Gmail ใส่สองหัวนี้เสมอ — smtplib ของ Python ไม่ใส่ให้เอง
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=self.user.split("@")[-1] or None)
        msg.set_content(e.text)
        msg.add_alternative(e.html, subtype="html")
        ctx = ssl.create_default_context()
        with smtplib.SMTP(self.host, self.port, timeout=30) as smtp:
            smtp.starttls(context=ctx)
            smtp.login(self.user, self.password)
            smtp.send_message(msg)
