"""
hpp_auto_export.py — เปิดเว็บ Hik-Partner Pro แล้วกด Export "Site Details" (ทุก Site / ทุกเครื่อง) อัตโนมัติ

ใช้ Playwright คุมเบราว์เซอร์ Microsoft Edge ที่มีอยู่แล้วใน Windows (ไม่ต้องดาวน์โหลดเบราว์เซอร์เพิ่ม)
ล็อกอินครั้งแรกด้วยมือครั้งเดียว (--setup) แล้วเก็บ session ไว้ในโฟลเดอร์ hpp_profile\\
รอบต่อๆ ไปเปิด Edge ไว้นอกจอ (มองไม่เห็น ไม่บังงาน) ใช้ session เดิม ไม่ต้องเปิดจอค้าง ไม่แตะเมาส์
(2.0.2: Hik-Partner Pro ไม่รับเบราว์เซอร์แบบ headless — ทดสอบ 20 ต.ค. — จึงใช้หน้าต่างจริงที่วางไว้นอกจอแทน)

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
  HPP_WINDOW        offscreen (ค่าเริ่มต้น: หน้าต่างจริงแต่อยู่นอกจอ) | show = เห็นหน้าต่าง | headless = ไม่มีหน้าต่างเลย

เมื่อไม่สำเร็จ: ภาพหน้าจอ + HTML ของหน้าเว็บ ณ ตอนนั้นอยู่ในโฟลเดอร์ debug\\ (เก็บ 20 ชุดล่าสุด)
ไฟล์ที่ Export ได้อยู่ในโฟลเดอร์ exports\\ (เก็บ 50 ไฟล์ล่าสุด)
"""
from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import sys
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PROFILE_DIR = os.path.join(HERE, "hpp_profile")
# 2.0.1: ข้อมูลที่เก็บตอน --setup (หน้าแรกหลังล็อกอิน, User-Agent ของ Edge ตัวจริง, sessionStorage)
# อยู่ในโฟลเดอร์โปรไฟล์ (gitignore) — มี token ล็อกอิน ห้ามส่งต่อ
SESSION_FILE = os.path.join(PROFILE_DIR, "bata_session.json")
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
# หน้าแนะนำ /lp/index.html ที่เว็บพาไปทุกครั้งที่เปิดเบราว์เซอร์ใหม่ (ภาพ 20 ต.ค.) — กดแล้วเข้าระบบด้วย OneHikID ที่จำไว้
SSO_RE = re.compile(r"Log ?In by OneHik ?ID", re.I)
LOGIN_BTN_RE = re.compile(r"^\s*(Log ?in|Sign ?in)\s*$", re.I)
DIALOG_SEL = ("[role=dialog]:visible, .el-dialog:visible, .el-notification:visible, .el-message-box:visible, .ant-modal:visible, "
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


def _load_session() -> dict:
    try:
        with open(SESSION_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_session(page, log=print) -> None:
    try:
        data = page.evaluate("""() => ({url: location.href, origin: location.origin, ua: navigator.userAgent,
                                        session: Object.assign({}, sessionStorage)})""")
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        log(f"info: หน้าหลังล็อกอิน {data['url']} · sessionStorage {len(data['session'])} ค่า")
    except Exception as e:
        log(f"warn: เก็บข้อมูล session เพิ่มไม่ได้ ({e!r})")


def _restore_session(context, sess: dict) -> None:
    """เว็บบางแบบเก็บ token ใน sessionStorage ซึ่งหายทุกครั้งที่ปิดเบราว์เซอร์ -> ใส่คืนก่อนหน้าเว็บโหลด"""
    if not sess.get("session") or not sess.get("origin"):
        return
    payload = json.dumps({"origin": sess["origin"], "items": sess["session"]})
    context.add_init_script(f"""(() => {{ const d = {payload};
        try {{ if (location.origin === d.origin && sessionStorage.length === 0)
            for (const [k, v] of Object.entries(d.items)) sessionStorage.setItem(k, v); }} catch (e) {{}} }})();""")


def _window_mode(show: bool = False) -> str:
    if show:
        return "show"
    mode = _env("HPP_WINDOW").lower()
    if not mode:  # ชื่อเดิมใน 2.0.0–2.0.1
        mode = {"1": "headless", "0": "show"}.get(_env("HPP_HEADLESS"), "offscreen")
    return mode if mode in ("offscreen", "show", "headless") else "offscreen"


def _launch(pw, mode: str):
    """เปิดเบราว์เซอร์พร้อมโปรไฟล์ที่เก็บ session ไว้ · mode = offscreen | show | headless"""
    os.makedirs(PROFILE_DIR, exist_ok=True)
    channel = _env("HPP_BROWSER", "msedge")
    headless = mode == "headless"
    opts = dict(user_data_dir=PROFILE_DIR, headless=headless, accept_downloads=True, locale="en-US",
                viewport={"width": 1600, "height": 1000})
    # ไม่ให้เว็บเด้งถามสิทธิ์ (เช่น "wants to Show notifications") ทับหน้าจอ
    opts["args"] = ["--deny-permission-prompts",
                    # คอม HQ join domain ล็อกจอเอง: ไม่ให้ Edge มองว่าหน้าต่างถูกบัง/ซ่อนแล้วชะลอหน้าเว็บจนหมดเวลา
                    "--disable-features=CalculateNativeWinOcclusion",
                    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
                    "--disable-background-timer-throttling"]
    if mode == "offscreen":
        opts["args"].append("--window-position=-32000,-32000")
    sess = _load_session()
    if headless and sess.get("ua"):
        # Edge แบบไม่มีหน้าต่างบอกเว็บว่าเป็น "HeadlessEdg" -> บางเว็บไม่รับ session ใช้ UA ของ Edge ตัวจริงจาก --setup
        opts["user_agent"] = sess["ua"].replace("HeadlessChrome", "Chrome").replace("HeadlessEdg", "Edg")
    try:
        if channel in ("", "chromium"):
            ctx = pw.chromium.launch_persistent_context(**opts)
        else:
            ctx = pw.chromium.launch_persistent_context(channel=channel, **opts)
        _restore_session(ctx, sess)
        return ctx
    except Exception as e:
        msg = str(e)
        if "ProcessSingleton" in msg or "user data directory is already in use" in msg.lower():
            raise ExportError("โฟลเดอร์ hpp_profile ถูกใช้อยู่ — monitor.py (เปิด Edge ค้างไว้) หรือหน้าต่าง --setup ยังเปิดอยู่ "
                              "ปิดตัวนั้นก่อน (Ctrl+C / End Task) แล้วลองใหม่")
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
    if _is_logged_in(page, 30_000):
        page.wait_for_timeout(2000)
        _save_session(page, log)
        return True
    return False


def _try_enter(page, log=print, wait_s: int = 60, auto_password: bool = True) -> bool:
    """รอจนเข้าระบบได้: กด 'Log In by OneHikID Account' ถ้าเจอหน้าแนะนำ · เจอช่องรหัสผ่าน -> ลองล็อกอินด้วย .env"""
    deadline = time.monotonic() + wait_s
    sso_clicks, tried_pw = 0, False
    while time.monotonic() < deadline:
        if _is_logged_in(page):
            return True
        sso = page.get_by_text(SSO_RE).locator("visible=true")
        if sso_clicks < 2 and _visible(sso):
            log("info: กด 'Log In by OneHikID Account' (เข้าระบบด้วยบัญชีที่จำไว้)")
            sso.first.click()
            sso_clicks += 1
            page.wait_for_timeout(5000)
            continue
        if auto_password and not tried_pw and _on_login_page(page):
            tried_pw = True
            if _auto_login(page, log):
                return True
        page.wait_for_timeout(1000)
    return _is_logged_in(page)


def _ensure_logged_in(page, log=print) -> None:
    # เข้าหน้าที่เห็นหลังล็อกอินตอน --setup · ถ้าเว็บพาไปหน้าแนะนำ จะกดปุ่ม OneHikID ให้
    start = _load_session().get("url") or _env("HPP_URL", "https://isgp.hik-partner.com")
    page.goto(start, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    if _try_enter(page, log):
        return
    base = _save_debug(page, "not-logged-in", log)
    raise ExportError("ยังไม่ได้ล็อกอิน Hik-Partner Pro หรือ session หมดอายุ — รัน `python hpp_auto_export.py --setup` "
                      f"แล้วล็อกอินใหม่ (ภาพหน้าจอ: {os.path.basename(base)}.png)")


def _export_control(page):
    """ปุ่ม Export — บนเว็บจริงเป็นข้อความ + ไอคอนในแถบเครื่องมือ ไม่ใช่ <button> (ภาพ 20 ต.ค.)"""
    return page.get_by_role("button", name=EXPORT_RE).or_(page.get_by_text(EXPORT_RE)).locator("visible=true")


def _goto_site_list(page, log=print) -> None:
    """ไปหน้า Site & Device › Site ที่มีปุ่ม Export"""
    export_btn = _export_control(page)
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


CLICK_HERE_RE = re.compile(r"^\s*click here\s*$", re.I)
_JS_CLICK_HERE = """() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (/click here/i.test(n.textContent)) {
      const el = n.parentElement;
      if (el && el.getClientRects().length) { el.click(); return el.tagName + ': ' + el.textContent.trim().slice(0, 80); }
    }
  }
  return null;
}"""


def _click_download_link(page, log=print) -> bool:
    """กดลิงก์ 'click here' ในกล่องแจ้งว่า Export เสร็จ · คืน True ถ้ากดได้"""
    exact = page.get_by_text(CLICK_HERE_RE).locator("visible=true")
    try:
        if exact.count():
            log("info: กด 'click here' เพื่อดาวน์โหลดไฟล์ Export")
            try:
                exact.first.click(timeout=5000)
            except Exception:
                exact.first.evaluate("el => el.click()")   # กล่องล้นขอบจอขวา (เห็นในภาพ 20 ต.ค.) คลิกด้วยเมาส์ไม่ถึง
            return True
        hit = page.evaluate(_JS_CLICK_HERE)
        if hit:
            log(f"info: กด 'click here' เพื่อดาวน์โหลดไฟล์ Export ({hit})")
            return True
    except Exception as e:
        log(f"warn: กด 'click here' ไม่ได้ ({e!r})")
    return False


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
    try:
        return _export_and_save(page, got, log)
    finally:  # 2.0.5: เบราว์เซอร์เปิดค้างข้ามรอบ — ถอด listener ไม่ให้ซ้อนกันทุกรอบ
        for p in context.pages:
            try:
                p.remove_listener("download", on_download)
            except Exception:
                pass
        try:
            context.remove_listener("page", hook)
        except Exception:
            pass


def _export_and_save(page, got, log=print) -> str:
    _export_control(page).first.click()
    clicked = set()
    link_clicks, next_link_try = 0, 0.0
    deadline = time.monotonic() + EXPORT_WAIT_S
    while time.monotonic() < deadline and not got:
        page.wait_for_timeout(1500)
        # เว็บจริง (20 ต.ค.): กด Export แล้วขึ้นกล่อง "Export Sites — ... Please click here to download ..."
        # มุมขวาบน ต้องกด "click here" อีกครั้งถึงจะได้ไฟล์ (ลองซ้ำทุก 10 วิ ไม่เกิน 3 ครั้ง)
        if link_clicks < 3 and time.monotonic() >= next_link_try and _click_download_link(page, log):
            link_clicks += 1
            next_link_try = time.monotonic() + 10
            continue
        try:
            for box in page.locator(DIALOG_SEL).all():
                cands = (box.get_by_role("button", name=CONFIRM_RE).all() + box.get_by_role("menuitem", name=CONFIRM_RE).all()
                         + box.get_by_text(CONFIRM_RE).all())
                for b in cands:
                    if not b.is_visible():
                        continue
                    label = (b.inner_text() or "").strip()
                    bb = b.bounding_box() or {}
                    key = (label, round(bb.get("x", 0)), round(bb.get("y", 0)))
                    if label and key not in clicked:
                        log(f"info: กด '{label}' ในกล่องที่เด้งขึ้น")
                        b.click()
                        clicked.add(key)
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


class BrowserSession:
    """2.0.5: เบราว์เซอร์ที่เปิดค้างข้ามรอบตรวจ (ใช้ใน monitor.py)

    ที่มา 21 ต.ค.: ปิด-เปิดเบราว์เซอร์ทุกรอบ แล้ว session OneHikID อยู่ได้แค่ ~2 ชม. (ล็อกอิน 14:30 หลุด 16:17)
    เปิดค้างไว้แท็บเดียว รีโหลดหน้าแล้วกด Export ทุกรอบ -> ไม่ต้องเข้าระบบใหม่ทุกรอบ
    ถ้าแท็บหลุด จะปิดแล้วเปิดใหม่ 1 ครั้งในรอบเดียวกัน (ลองปุ่ม OneHikID / รหัสใน .env) ก่อนแจ้งว่าไม่สำเร็จ"""

    def __init__(self):
        self.pw = self.context = self.page = None

    def alive(self) -> bool:
        try:
            return bool(self.page and not self.page.is_closed() and self.context.pages)
        except Exception:
            return False

    def close(self) -> None:
        for fn in (lambda: self.context.close(), lambda: self.pw.stop()):
            try:
                fn()
            except Exception:
                pass
        self.pw = self.context = self.page = None

    def _open(self, log, show: bool) -> None:
        from playwright.sync_api import sync_playwright
        self.close()
        self.pw = sync_playwright().start()
        self.context = _launch(self.pw, _window_mode(show))
        self.context.set_default_timeout(NAV_TIMEOUT_MS)
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        _ensure_logged_in(self.page, log)

    def _refresh(self, log) -> bool:
        """รีโหลดหน้าในแท็บเดิม (ล้างกล่อง Export Sites เก่า; แท็บเดิมยังเก็บ session) คืน True ถ้ายังอยู่ในระบบ"""
        try:
            self.page.goto(_env("HPP_SITE_URL") or _env("HPP_URL", "https://isgp.hik-partner.com"),
                           wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            self.page.reload(wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            return _try_enter(self.page, log, wait_s=45)
        except Exception as e:
            log(f"warn: รีโหลดหน้าเดิมไม่ได้ ({type(e).__name__})")
            return False

    def export(self, log=print, show: bool = False) -> str:
        if not (self.alive() and self._refresh(log)):
            if self.page is not None:
                log("info: เบราว์เซอร์ที่เปิดค้างหลุดจากระบบ — เปิดใหม่")
            self._open(log, show)
        _goto_site_list(self.page, log)
        return _click_export_and_wait(self.page, self.context, log)


_SESSION = BrowserSession()
atexit.register(_SESSION.close)


def export_site_details(log=print, show: bool = False, keep_open: bool = False) -> str:
    """Export 1 ครั้ง คืน path ไฟล์ .xlsx · ไม่สำเร็จโยน ExportError (ข้อความภาษาไทยพร้อมวิธีแก้)
    keep_open=True: ใช้เบราว์เซอร์ที่เปิดค้างไว้ข้ามรอบ (monitor.py) ไม่ปิดหลัง Export"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise ExportError("ยังไม่ได้ติดตั้ง Playwright — รัน `pip install -r requirements.txt`")
    if keep_open:
        try:
            return _SESSION.export(log, show)
        except Exception as e:
            page = _SESSION.page
            _SESSION.close()   # รอบหน้าเริ่มใหม่หมด
            if isinstance(e, ExportError):
                raise
            hint = ""
            try:
                if page is not None:
                    hint = f" (ภาพหน้าจอ: {os.path.basename(_save_debug(page, 'error', log))}.png)"
            except Exception:
                pass
            raise ExportError(f"{type(e).__name__}: {str(e).splitlines()[0][:200]}{hint}")
    with sync_playwright() as pw:
        context = _launch(pw, _window_mode(show))
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
        context = _launch(pw, "show")
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(_env("HPP_URL", "https://isgp.hik-partner.com"), wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            if _try_enter(page, log, wait_s=30, auto_password=False):
                _save_session(page, log)
                log("✅ เข้าระบบได้เอง (กดปุ่ม OneHikID ให้แล้ว) — บันทึกข้อมูล session แล้ว ปิดได้เลย")
                return
            log(f"ล็อกอินในหน้าต่างที่เปิดขึ้น (ติ๊ก Remember me ถ้ามี) — รอได้ {LOGIN_WAIT_SETUP_S // 60} นาที")
            if not _is_logged_in(page, LOGIN_WAIT_SETUP_S * 1000):
                raise ExportError("หมดเวลารอล็อกอิน")
            page.wait_for_timeout(3000)   # ให้เว็บเขียน cookie/storage ให้เสร็จ
            _save_session(page, log)
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
        context = _launch(pw, "show")
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
        path = export_site_details(show=args.show)
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
