"""
hpp_auto_export.py — เปิดเว็บ Hik-Partner Pro แล้วกด Export "Site Details" (ทุก Site / ทุกเครื่อง) อัตโนมัติ

ใช้ Playwright คุมเบราว์เซอร์ Microsoft Edge ที่มีอยู่แล้วใน Windows (ไม่ต้องดาวน์โหลดเบราว์เซอร์เพิ่ม)
ล็อกอินครั้งแรกด้วยมือครั้งเดียว (--setup) แล้วเก็บ session ไว้ในโฟลเดอร์ hpp_profile\\
รอบต่อๆ ไปรันแบบไม่มีหน้าต่าง (headless) ใช้ session เดิม ไม่ต้องเปิดจอค้าง ไม่แตะเมาส์

วิธีใช้
  python hpp_auto_export.py --setup     เปิดหน้าต่างให้ล็อกอิน (ใส่รหัส/OTP เอง) — ทำครั้งแรก และเมื่อ session หมดอายุ
  python hpp_auto_export.py             Export 1 ครั้ง (ไม่มีหน้าต่าง) แล้วสรุปผลจากไฟล์
  python hpp_auto_export.py --show      Export 1 ครั้งแบบเห็นหน้าต่าง (ไว้ดูว่าติดตรงไหน)
  python hpp_auto_export.py --probe     เห็นหน้าต่าง + บันทึก request ที่หน้าเว็บเรียก ลง debug\\network.jsonl

ค่าใน .env (ไม่ใส่ก็ได้ ยกเว้นตามที่บอก)
  HPP_URL           https://isgp.hik-partner.com
  HPP_SITE_URL      ลิงก์หน้า Site & Device › Site (คัดลอกจากแถบที่อยู่) — ใส่แล้วไม่ต้องคลิกเมนู เร็วกว่าและพังยากกว่า
  HPP_USER / HPP_PASSWORD   ใส่ไว้ให้สคริปต์ล็อกอินใหม่เองเมื่อ session หมด (ถ้าเว็บถาม captcha/OTP จะทำไม่ได้ ต้อง --setup)
  HPP_BROWSER       msedge (ค่าเริ่มต้น) | chrome | chromium
  HPP_HEADLESS      1 (ค่าเริ่มต้น) | 0 = เปิดหน้าต่างทุกรอบ (ถ้าเว็บไม่ยอมทำงานแบบ headless)

เมื่อไม่สำเร็จ: ภาพหน้าจอ + HTML ของหน้าเว็บ ณ ตอนนั้นอยู่ในโฟลเดอร์ debug\\ (เก็บ 20 ชุดล่าสุด)
ไฟล์ที่ Export ได้อยู่ในโฟลเดอร์ exports\\ (เก็บ 50 ไฟล์ล่าสุด)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PROFILE_DIR = os.path.join(HERE, "hpp_profile")
EXPORT_DIR = os.path.join(HERE, "exports")
DEBUG_DIR = os.path.join(HERE, "debug")
KEEP_EXPORTS = 50
KEEP_DEBUG = 20

NAV_TIMEOUT_MS = 45_000
LOGIN_WAIT_SETUP_S = 600          # --setup: รอให้คนล็อกอินได้นานสุด 10 นาที
EXPORT_WAIT_S = 90                # กด Export แล้วรอไฟล์

# ข้อความบนหน้าเว็บ (UI ภาษาอังกฤษ — ตั้งภาษาบัญชี Hik-Partner Pro เป็น English)
LOGGED_IN_MARK = "Site & Device"
EXPORT_RE = re.compile(r"^\s*Export\s*$", re.I)
CONFIRM_RE = re.compile(r"^\s*(Export|Export All|OK|Confirm|Download|Yes)\s*$", re.I)
LOGIN_BTN_RE = re.compile(r"^\s*(Log ?in|Sign ?in)\s*$", re.I)
DIALOG_SEL = ("[role=dialog]:visible, .el-dialog:visible, .el-message-box:visible, .ant-modal:visible, "
              ".modal:visible, .el-dropdown-menu:visible, .ant-dropdown:visible")


class ExportError(Exception):
    pass


def _env(k: str, default: str = "") -> str:
    return os.environ.get(k, default).strip()


def _load_env() -> None:
    try:
        from monitor import load_env
        load_env(os.path.join(HERE, ".env"))
    except Exception:
        pass


def _prune(folder: str, keep: int) -> None:
    try:
        files = sorted((os.path.join(folder, f) for f in os.listdir(folder)), key=os.path.getmtime, reverse=True)
        for f in files[keep:]:
            os.remove(f)
    except OSError:
        pass


def _save_debug(page, tag: str, log=print) -> str:
    os.makedirs(DEBUG_DIR, exist_ok=True)
    base = os.path.join(DEBUG_DIR, f"{datetime.now():%Y%m%d-%H%M%S}-{tag}")
    try:
        page.screenshot(path=base + ".png", full_page=True)
        with open(base + ".html", "w", encoding="utf-8") as f:
            f.write(page.content())
        with open(base + ".txt", "w", encoding="utf-8") as f:
            f.write(page.url + "\n")
    except Exception as e:
        log(f"warn: บันทึก debug ไม่ได้ ({e!r})")
    _prune(DEBUG_DIR, KEEP_DEBUG * 3)
    return base


def _launch(pw, headless: bool):
    """เปิดเบราว์เซอร์พร้อมโปรไฟล์ที่เก็บ session ไว้"""
    os.makedirs(PROFILE_DIR, exist_ok=True)
    channel = _env("HPP_BROWSER", "msedge")
    opts = dict(user_data_dir=PROFILE_DIR, headless=headless, accept_downloads=True, locale="en-US",
                viewport={"width": 1600, "height": 1000})
    try:
        if channel in ("", "chromium"):
            return pw.chromium.launch_persistent_context(**opts)
        return pw.chromium.launch_persistent_context(channel=channel, **opts)
    except Exception as e:
        msg = str(e)
        if "ProcessSingleton" in msg or "user data directory is already in use" in msg.lower():
            raise ExportError("โฟลเดอร์ hpp_profile ถูกใช้อยู่ — มีหน้าต่าง --setup หรือสคริปต์อีกตัวเปิดค้าง ปิดก่อนแล้วลองใหม่")
        raise ExportError(f"เปิดเบราว์เซอร์ {channel or 'chromium'} ไม่ได้: {msg.splitlines()[0][:200]}")


def _visible(locator, timeout_ms: int = 0) -> bool:
    try:
        if timeout_ms:
            locator.first.wait_for(state="visible", timeout=timeout_ms)
            return True
        return locator.first.is_visible()
    except Exception:
        return False


def _is_logged_in(page, wait_ms: int = 0) -> bool:
    return _visible(page.get_by_text(LOGGED_IN_MARK, exact=True), wait_ms)


def _on_login_page(page) -> bool:
    return _visible(page.locator("input[type=password]"))


def _auto_login(page, log=print) -> bool:
    user, pwd = _env("HPP_USER"), _env("HPP_PASSWORD")
    if not (user and pwd):
        return False
    log("info: session หมด — ล็อกอินใหม่ด้วย HPP_USER ใน .env")
    try:
        pw_box = page.locator("input[type=password]").first
        user_box = page.locator("input[type=text]:visible, input[type=email]:visible, input:not([type]):visible").first
        user_box.fill(user)
        pw_box.fill(pwd)
        btn = page.get_by_role("button", name=LOGIN_BTN_RE)
        if _visible(btn):
            btn.first.click()
        else:
            pw_box.press("Enter")
    except Exception as e:
        log(f"warn: กรอกหน้าล็อกอินไม่ได้ ({e!r})")
        return False
    return _is_logged_in(page, 30_000)


def _ensure_logged_in(page, log=print) -> None:
    page.goto(_env("HPP_URL", "https://isgp.hik-partner.com"), wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    if _is_logged_in(page, 20_000):
        return
    if _on_login_page(page) and _auto_login(page, log):
        return
    base = _save_debug(page, "not-logged-in", log)
    raise ExportError("ยังไม่ได้ล็อกอิน Hik-Partner Pro หรือ session หมดอายุ — รัน `python hpp_auto_export.py --setup` "
                      f"แล้วล็อกอินใหม่ (ภาพหน้าจอ: {os.path.basename(base)}.png)")


def _goto_site_list(page, log=print) -> None:
    """ไปหน้า Site & Device › Site ที่มีปุ่ม Export"""
    export_btn = page.get_by_role("button", name=EXPORT_RE)
    site_url = _env("HPP_SITE_URL")
    if site_url:
        page.goto(site_url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        if _visible(export_btn, 20_000):
            return
        log("warn: เปิด HPP_SITE_URL แล้วไม่เจอปุ่ม Export — ลองคลิกเมนูแทน")
    page.get_by_text(LOGGED_IN_MARK, exact=True).first.click()
    if not _visible(export_btn, 15_000):
        # แท็บ Site (ไม่ใช่ Device) — ลองเป็น tab ก่อน แล้วค่อยข้อความ "Site" ตรงตัว
        for loc in (page.get_by_role("tab", name="Site", exact=True), page.get_by_text("Site", exact=True)):
            if _visible(loc):
                loc.first.click()
                break
    if not _visible(export_btn, 20_000):
        base = _save_debug(page, "no-export-button", log)
        raise ExportError("ไม่เจอปุ่ม Export ในหน้า Site & Device › Site — หน้าเว็บอาจเปลี่ยน หรือภาษาไม่ใช่ English "
                          f"(ภาพหน้าจอ: {os.path.basename(base)}.png)")
    if not site_url:
        log(f"info: หน้า Site อยู่ที่ {page.url} — ใส่เป็น HPP_SITE_URL ใน .env ได้ จะเร็วขึ้น")


def _click_export_and_wait(page, context, log=print) -> str:
    """กด Export แล้วรอไฟล์ ถ้ามีกล่องถาม/เมนูเลือก (Export All / OK / Confirm) จะกดให้"""
    got = []

    def on_download(d):
        got.append(d)

    def hook(p):
        p.on("download", on_download)

    for p in context.pages:
        hook(p)
    context.on("page", hook)

    page.get_by_role("button", name=EXPORT_RE).first.click()
    clicked = set()
    deadline = time.monotonic() + EXPORT_WAIT_S
    while time.monotonic() < deadline and not got:
        page.wait_for_timeout(1500)
        try:
            for box in page.locator(DIALOG_SEL).all():
                for b in box.get_by_role("button", name=CONFIRM_RE).all() + box.get_by_role("menuitem", name=CONFIRM_RE).all():
                    label = (b.inner_text() or "").strip()
                    if label and label not in clicked and b.is_visible():
                        log(f"info: กด '{label}' ในกล่องที่เด้งขึ้น")
                        b.click()
                        clicked.add(label)
        except Exception:
            pass  # กล่องปิดไปแล้วระหว่างวน
    if not got:
        base = _save_debug(page, "no-download", log)
        raise ExportError(f"กด Export แล้วไม่ได้ไฟล์ภายใน {EXPORT_WAIT_S} วินาที (ภาพหน้าจอ: {os.path.basename(base)}.png)")

    d = got[0]
    failure = d.failure()
    if failure:
        raise ExportError(f"ดาวน์โหลดไฟล์ Export ไม่สำเร็จ: {failure}")
    os.makedirs(EXPORT_DIR, exist_ok=True)
    name = d.suggested_filename or "export.xlsx"
    path = os.path.join(EXPORT_DIR, f"{datetime.now():%Y%m%d-%H%M%S}-{re.sub(r'[^A-Za-z0-9._-]', '_', name)}")
    d.save_as(path)
    with open(path, "rb") as f:
        if f.read(2) != b"PK":   # .xlsx = zip
            raise ExportError(f"ไฟล์ที่ได้ไม่ใช่ .xlsx ({name}) — เก็บไว้ที่ {path}")
    _prune(EXPORT_DIR, KEEP_EXPORTS)
    return path


def export_site_details(log=print, headless=None) -> str:
    """Export 1 ครั้ง คืน path ไฟล์ .xlsx · ไม่สำเร็จโยน ExportError (ข้อความภาษาไทยพร้อมวิธีแก้)"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise ExportError("ยังไม่ได้ติดตั้ง Playwright — รัน `pip install -r requirements.txt`")
    if headless is None:
        headless = _env("HPP_HEADLESS", "1") != "0"
    with sync_playwright() as pw:
        context = _launch(pw, headless)
        try:
            context.set_default_timeout(NAV_TIMEOUT_MS)
            page = context.pages[0] if context.pages else context.new_page()
            _ensure_logged_in(page, log)
            _goto_site_list(page, log)
            return _click_export_and_wait(page, context, log)
        except ExportError:
            raise
        except Exception as e:
            try:
                base = _save_debug(page, "error", log)
                hint = f" (ภาพหน้าจอ: {os.path.basename(base)}.png)"
            except Exception:
                hint = ""
            raise ExportError(f"{type(e).__name__}: {str(e).splitlines()[0][:200]}{hint}")
        finally:
            context.close()


def setup(log=print) -> None:
    """เปิดหน้าต่างให้ล็อกอินเอง แล้วเก็บ session"""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        context = _launch(pw, headless=False)
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(_env("HPP_URL", "https://isgp.hik-partner.com"), wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            if _is_logged_in(page, 10_000):
                log("ล็อกอินอยู่แล้ว — session ใช้ได้ ปิดได้เลย")
                return
            log(f"ล็อกอินในหน้าต่างที่เปิดขึ้น (ติ๊ก Remember me ถ้ามี) — รอได้ {LOGIN_WAIT_SETUP_S // 60} นาที")
            if not _is_logged_in(page, LOGIN_WAIT_SETUP_S * 1000):
                raise ExportError("หมดเวลารอล็อกอิน")
            page.wait_for_timeout(3000)   # ให้เว็บเขียน cookie/storage ให้เสร็จ
            log("✅ บันทึก session แล้ว — ต่อไปรัน `python hpp_auto_export.py` ได้โดยไม่ต้องล็อกอิน")
        finally:
            context.close()


def probe(log=print) -> None:
    """เห็นหน้าต่าง + จด request ที่หน้าเว็บเรียก (ไว้หา API ที่หน้า Site ใช้ ถ้าวันหนึ่งจะเลิกกด Export)"""
    from playwright.sync_api import sync_playwright
    os.makedirs(DEBUG_DIR, exist_ok=True)
    out = open(os.path.join(DEBUG_DIR, "network.jsonl"), "w", encoding="utf-8")

    def on_response(r):
        if r.request.resource_type in ("xhr", "fetch"):
            out.write(json.dumps({"method": r.request.method, "url": r.url.split("?")[0], "status": r.status}) + "\n")

    with sync_playwright() as pw:
        context = _launch(pw, headless=False)
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.on("response", on_response)
            _ensure_logged_in(page, log)
            _goto_site_list(page, log)
            path = _click_export_and_wait(page, context, log)
            log(f"ไฟล์: {path}")
        finally:
            out.close()
            context.close()
    log(f"บันทึก request ไว้ที่ {os.path.join(DEBUG_DIR, 'network.jsonl')}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Export Site Details จาก Hik-Partner Pro")
    ap.add_argument("--setup", action="store_true", help="เปิดหน้าต่างให้ล็อกอินแล้วเก็บ session")
    ap.add_argument("--show", action="store_true", help="Export แบบเห็นหน้าต่าง")
    ap.add_argument("--probe", action="store_true", help="เห็นหน้าต่าง + บันทึก request ลง debug/network.jsonl")
    args = ap.parse_args()
    _load_env()
    try:
        if args.setup:
            setup()
            return
        if args.probe:
            probe()
            return
        t0 = time.monotonic()
        path = export_site_details(headless=False if args.show else None)
        print(f"✅ Export สำเร็จใน {time.monotonic() - t0:.0f} วินาที: {path}")
        from hpp_reader import read_export_file
        r = read_export_file(path)
        print(f"   ok={r.ok} total={r.total} complete={r.complete} offline={len(r.offline)} "
              f"online={len(r.online or [])} error={r.error}")
        print("   Offline:", ", ".join(k.split("@")[0] for k, _ in r.offline))
    except ExportError as e:
        print(f"❌ {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
