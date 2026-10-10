"""
test_mail.py — หาว่าเมลแบบไหนผ่านระบบกรองเมลบริษัท
ส่ง 3 ฉบับที่ต่างกันทีละจุด แล้วดูว่าฉบับไหนเข้า Outlook:
  A  ข้อความล้วน, ผู้ส่งไม่มีชื่อแสดง           (ใกล้เคียงเมลจาก DVR ที่สุด)
  B  ข้อความล้วน, ผู้ส่งชื่อ "BATA CCTV Monitor"
  C  ข้อความ + HTML, ผู้ส่งไม่มีชื่อแสดง

วิธีใช้:  python test_mail.py danai.makmee@bata.com        (ชุด A-C)
         python test_mail.py danai.makmee@bata.com 2      (ชุด D-H: วงเล็บ / ภาษาไทย)
"""
import os
import smtplib
import ssl
import sys
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from monitor import load_env  # noqa: E402


def build(user, to, tag, display_name, html):
    msg = EmailMessage()
    msg["Subject"] = f"CCTV mail test {tag}"
    msg["From"] = formataddr((display_name, user)) if display_name else user
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=user.split("@")[-1])
    msg.set_content(f"CCTV mail test {tag}\n\nIf you can read this, variant {tag} passes the mail filter.")
    if html:
        msg.add_alternative(f"<p>CCTV mail test <b>{tag}</b></p><p>If you can read this, variant {tag} passes the mail filter.</p>",
                            subtype="html")
    return msg


def build2(user, to, tag, subject, body_th):
    """ชุดที่ 2: ทุกฉบับมีชื่อผู้ส่ง + HTML เหมือนเมลแจ้งเตือนจริง ต่างกันที่หัวข้อ/ภาษาไทย"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("BATA CCTV Monitor", user))
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=user.split("@")[-1])
    text = ("DVR สาขา The Mall 6 Offline ไม่ตอบสนองใน iVMS-4200" if body_th else "DVR The Mall 6 is offline in iVMS-4200")
    msg.set_content(f"{tag}\n\n{text}")
    msg.add_alternative(f"<p><b>{tag}</b></p><p>{text}</p>", subtype="html")
    return msg


def main():
    if len(sys.argv) < 2:
        sys.exit("ใส่อีเมลผู้รับ เช่น: python test_mail.py danai.makmee@bata.com [2]")
    to = sys.argv[1]
    load_env(os.path.join(HERE, ".env"))
    user = os.environ.get("GMAIL_USER", "")
    password = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
    if len(sys.argv) > 2 and sys.argv[2] == "2":
        tests = [
            ("D", "CCTV mail test D - name + html, English"),
            ("E", "[CCTV Offline] test E - brackets, English"),
            ("F", "CCTV mail test F - Thai body"),
            ("G", "CCTV ทดสอบ G - Thai subject"),
            ("H", "[CCTV Offline] 51407 The Mall 6 · BKK 512 — หลุดตั้งแต่ 16:55 (test H)"),
        ]
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(user, password)
            for tag, subject in tests:
                smtp.send_message(build2(user, to, tag, subject, body_th=tag in ("F", "H")))
                print(f"sent {tag}: {subject}")
                time.sleep(2)
        print("ส่งครบ 5 ฉบับ — ดูว่าฉบับ D / E / F / G / H ฉบับไหนเข้า Outlook")
        return
    variants = [("A", None, False), ("B", "BATA CCTV Monitor", False), ("C", None, True)]
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(user, password)
        for tag, name, html in variants:
            smtp.send_message(build(user, to, tag, name, html))
            print(f"sent {tag}")
            time.sleep(2)
    print("ส่งครบ 3 ฉบับ — รอ 1-2 นาทีแล้วดูว่าฉบับ A / B / C ฉบับไหนเข้า Outlook")


if __name__ == "__main__":
    main()
