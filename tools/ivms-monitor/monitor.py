"""
monitor.py — ตัวเฝ้า DVR สาขาจาก iVMS-4200 (Device Offline Monitoring)

ทุก N นาที (ตั้งในหน้า Device Status › ตั้งค่า):
  1) กด Refresh ใน iVMS แล้วอ่านรายการ Offline + Total (ivms_reader)
  2) โหลดสถานะเดิมจาก Supabase
  3) ตัดสินสถานะ + เลือกเมล (state.plan_cycle)
  4) เขียนขึ้น Supabase, ส่งเมล, บันทึกว่าส่งแล้ว
  5) บันทึก monitor_runs (portal ใช้เป็นสัญญาณว่าตัวตรวจยังทำงาน)

วิธีรัน (Command Prompt แบบ administrator) — ดู README.md
  python monitor.py              ทำงานต่อเนื่อง
  python monitor.py --once       รอบเดียวแล้วจบ
  python monitor.py --dry-run    อ่าน iVMS + แสดงแผน แต่ไม่เขียน Supabase และไม่ส่งเมล
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from state import ReadResult, plan_cycle  # noqa: E402

SCRIPT_VERSION = "1.0.3"
log = logging.getLogger("ivms-monitor")


def load_env(path: str) -> None:
    """อ่าน .env แบบง่าย (KEY=VALUE ต่อบรรทัด) โดยไม่ต้องลง python-dotenv"""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def setup_logging() -> None:
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh = RotatingFileHandler(os.path.join(HERE, "monitor.log"), maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(sh)


def failed_streak(runs: list) -> int:
    n = 0
    for r in runs:
        if r.get("status") != "failed":
            break
        n += 1
    return n


def run_cycle(supa, mailer, reader, dry_run: bool, portal_url: str) -> int:
    """คืนค่า check_interval_minutes ล่าสุด (ใช้ตั้งเวลารอบถัดไป)"""
    t0 = time.monotonic()
    read: ReadResult = reader()
    now = datetime.now(timezone.utc)
    log.info("read: ok=%s total=%s offline=%s page_full=%s err=%s", read.ok, read.total,
             len(read.offline), read.page_full, read.error)

    settings = supa.load_settings()
    runs = supa.load_recent_runs()
    plan = plan_cycle(
        now=now, read=read, settings=settings,
        stores=supa.load_stores(), monitors=supa.load_monitors(),
        open_outages=supa.load_open_outages(), recent_closed=supa.load_recent_closed(now),
        pending_summary=supa.load_pending_summary(now),
        prev_run_status=runs[0]["status"] if runs else None,
        failed_streak_before=failed_streak(runs), portal_url=portal_url,
    )
    log.info("plan: status=%s new_outages=%d monitor_updates=%d emails=%s unmatched=%s",
             plan.run["status"], len(plan.new_outages), len(plan.monitor_updates),
             [e.kind for e in plan.emails], plan.run["unmatched"])

    if dry_run:
        for e in plan.emails:
            log.info("[dry-run] email %s -> %s : %s", e.kind, e.to, e.subject)
        return settings.check_interval_minutes

    supa.apply(plan)

    if plan.emails and not mailer.configured:
        log.warning("มีเมล %d ฉบับ แต่ยังไม่ได้ตั้ง GMAIL_USER / GMAIL_APP_PASSWORD", len(plan.emails))
    elif plan.emails:
        for e in plan.emails:
            try:
                mailer.send(e)
                supa.mark_sent(e.marks, datetime.now(timezone.utc))
                log.info("sent %s: %s", e.kind, e.subject)
            except Exception as ex:  # ส่งไม่ได้ -> ไม่ mark จะลองใหม่รอบหน้า (ภายใน 60 นาที)
                log.error("send %s failed: %s", e.kind, ex)
    if not settings.alert_recipients and any(o.get("during_business_hours") for o in plan.new_outages):
        log.warning("ยังไม่ได้ตั้งผู้รับเมลในหน้า Device Status › ตั้งค่า")

    run = dict(plan.run, ran_at=now.isoformat(), duration_ms=int((time.monotonic() - t0) * 1000), script_version=SCRIPT_VERSION)
    supa.insert_run(run)
    return settings.check_interval_minutes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_env(os.path.join(HERE, ".env"))
    setup_logging()

    from supa import Supa
    from notify import Mailer
    from ivms_reader import read_ivms

    supa = Supa(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    mailer = Mailer(os.environ.get("GMAIL_USER", ""), os.environ.get("GMAIL_APP_PASSWORD", ""))
    portal_url = os.environ.get("PORTAL_URL", "").rstrip("/")
    reader = lambda: read_ivms(log=log.warning)  # noqa: E731

    log.info("ivms-monitor %s start (dry_run=%s)", SCRIPT_VERSION, args.dry_run)
    last_prune = None
    while True:
        started = time.monotonic()
        interval = 5
        try:
            interval = run_cycle(supa, mailer, reader, args.dry_run, portal_url)
            today = datetime.now(timezone.utc).date()
            if not args.dry_run and last_prune != today:
                supa.prune_runs(datetime.now(timezone.utc))
                last_prune = today
        except Exception as ex:
            # ต่อ Supabase ไม่ได้ ฯลฯ: ข้ามรอบนี้ ไม่เก็บผลอ่านไว้ส่งย้อน (เวลาจะเพี้ยนและเมลจะผิด)
            # portal จะเห็นว่าตัวตรวจเงียบและขึ้นแบนเนอร์ "ระบบตรวจหยุดทำงาน" เอง
            log.exception("cycle failed: %s", ex)
        if args.once:
            break
        time.sleep(max(30, interval * 60 - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
