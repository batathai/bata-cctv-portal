"""
state.py — ตรรกะตัดสินสถานะ + เลือกเมลที่ต้องส่ง (ไม่แตะ Windows / iVMS / เน็ต)

ทุกอย่างในไฟล์นี้เป็นฟังก์ชันล้วน: รับสถานะเดิม + ผลอ่าน iVMS + เวลา
แล้วคืน "แผน" ว่าต้องเขียนอะไรลง Supabase และส่งเมลอะไร
จึงทดสอบได้ทุกเครื่องด้วย `python -m pytest test_state.py`

กติกาทั้งหมดมาจาก docs/workflow/DESIGN-device-offline-monitoring.md หัวข้อ 1
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, Optional

# ประเทศไทยไม่มี daylight saving — ใช้ offset คงที่ ไม่ต้องพึ่ง tzdata บน Windows
BKK = timezone(timedelta(hours=7))
EMAIL_RETRY_MINUTES = 60          # ส่งเมลไม่สำเร็จ จะลองใหม่ในรอบถัดๆ ไปภายในเวลานี้
FAILED_RUNS_BEFORE_ADMIN_EMAIL = 3


# ---------------------------------------------------------------- เวลา
def parse_ts(v) -> Optional[datetime]:
    """ISO timestamp จาก Supabase -> datetime (aware) ; รองรับ Python 3.8+"""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).strip().replace(" ", "T")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    m = re.match(r"^(.*T\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}(?::?\d{2})?)?$", s)
    if not m:
        raise ValueError(f"bad timestamp: {v!r}")
    base, frac, off = m.groups()
    frac = (frac or ".0")[1:7].ljust(6, "0")
    off = off or "+00:00"
    if len(off) == 3:
        off += ":00"
    elif ":" not in off:
        off = off[:3] + ":" + off[3:]
    return datetime.fromisoformat(f"{base}.{frac}{off}")


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def parse_time(v) -> Optional[time]:
    """'10:00:00' / '10:00' -> time"""
    if v is None or v == "":
        return None
    if isinstance(v, time):
        return v
    h, m = str(v).split(":")[:2]
    return time(int(h), int(m))


def local(dt: datetime) -> datetime:
    return dt.astimezone(BKK)


def minute_of_day(t: time) -> int:
    return t.hour * 60 + t.minute


def within_hours(dt: datetime, open_t: time, close_t: time) -> bool:
    """open <= t < close (เวลาไทย) ; ถ้า close < open ถือว่าข้ามเที่ยงคืน ; open == close = ทั้งวัน"""
    o, c = minute_of_day(open_t), minute_of_day(close_t)
    if o == c:
        return True
    t = minute_of_day(local(dt).time())
    return o <= t < c if o < c else (t >= o or t < c)


def fmt_hm(dt: Optional[datetime]) -> str:
    return local(dt).strftime("%H:%M") if dt else "—"


def fmt_day_hm(dt: Optional[datetime], now: datetime) -> str:
    if not dt:
        return "—"
    d = local(dt)
    if d.date() == local(now).date():
        return d.strftime("%H:%M")
    if d.date() == local(now).date() - timedelta(days=1):
        return "เมื่อวาน " + d.strftime("%H:%M")
    return d.strftime("%d/%m %H:%M")


def fmt_duration(minutes: float) -> str:
    m = max(0, int(round(minutes)))
    if m < 60:
        return f"{m} นาที"
    d, rem = divmod(m, 1440)
    h, mm = divmod(rem, 60)
    if d:
        return f"{d} วัน {h} ชม." if h else f"{d} วัน"
    return f"{h} ชม. {mm} นาที" if mm else f"{h} ชม."


THAI_DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
THAI_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def fmt_thai_date(d: date) -> str:
    return f"{THAI_DOW[d.weekday()]} {d.day} {THAI_MON[d.month - 1]}"


# ---------------------------------------------------------------- ข้อมูล
@dataclass
class Settings:
    check_interval_minutes: int = 5
    confirm_cycles: int = 2
    default_open_time: time = time(10, 0)
    default_close_time: time = time(22, 0)
    late_open_grace_minutes: int = 30
    mass_alert_threshold: int = 10
    suspect_ratio: float = 0.80
    stale_after_minutes: int = 15
    alert_recipients: list = field(default_factory=list)
    admin_recipients: list = field(default_factory=list)
    morning_summary_time: time = time(10, 0)
    emails_enabled: bool = True

    @classmethod
    def from_row(cls, r: Optional[dict]) -> "Settings":
        s = cls()
        if not r:
            return s
        for k in ("check_interval_minutes", "confirm_cycles", "late_open_grace_minutes", "mass_alert_threshold", "stale_after_minutes"):
            if r.get(k) is not None:
                setattr(s, k, int(r[k]))
        for k in ("default_open_time", "default_close_time", "morning_summary_time"):
            if r.get(k):
                setattr(s, k, parse_time(r[k]))
        if r.get("suspect_ratio") is not None:
            s.suspect_ratio = float(r["suspect_ratio"])
        s.alert_recipients = list(r.get("alert_recipients") or [])
        s.admin_recipients = list(r.get("admin_recipients") or [])
        if r.get("emails_enabled") is not None:
            s.emails_enabled = bool(r["emails_enabled"])
        return s


@dataclass
class Store:
    id: str
    code: str
    name: str
    region: str = ""        # "Bangkok" | "Upcountry"
    zone: str = ""

    @property
    def region_short(self) -> str:
        return "BKK" if self.region == "Bangkok" else "UPC"

    @property
    def zone_code(self) -> str:
        return (self.zone or "").split("_")[0]

    @property
    def label(self) -> str:
        return f"{self.code} {self.name}"


@dataclass
class Monitor:
    store_id: str
    monitored: bool = False
    state: str = "Unknown"
    state_since: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    offline_streak: int = 0
    current_outage_id: Optional[str] = None
    ivms_device_name: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    muted_until: Optional[datetime] = None

    @classmethod
    def from_row(cls, r: dict) -> "Monitor":
        return cls(
            store_id=r["store_id"],
            monitored=bool(r.get("monitored")),
            state=r.get("state") or "Unknown",
            state_since=parse_ts(r.get("state_since")),
            last_seen_at=parse_ts(r.get("last_seen_at")),
            offline_streak=int(r.get("offline_streak") or 0),
            current_outage_id=r.get("current_outage_id"),
            ivms_device_name=r.get("ivms_device_name"),
            first_seen_at=parse_ts(r.get("first_seen_at")),
            open_time=parse_time(r.get("open_time")),
            close_time=parse_time(r.get("close_time")),
            muted_until=parse_ts(r.get("muted_until")),
        )

    def hours(self, s: Settings):
        if self.open_time and self.close_time:
            return self.open_time, self.close_time
        return s.default_open_time, s.default_close_time

    def muted(self, now: datetime) -> bool:
        return bool(self.muted_until and self.muted_until > now)


@dataclass
class Outage:
    id: str
    store_id: str
    started_at: datetime
    detected_at: datetime
    ended_at: Optional[datetime] = None
    during_business_hours: bool = True
    muted: bool = False
    central_suspect: bool = False
    alert_sent_at: Optional[datetime] = None
    recovery_alert_sent_at: Optional[datetime] = None
    late_open_alert_sent_at: Optional[datetime] = None
    summary_sent_at: Optional[datetime] = None

    @classmethod
    def from_row(cls, r: dict) -> "Outage":
        return cls(
            id=r["id"],
            store_id=r["store_id"],
            started_at=parse_ts(r["started_at"]),
            detected_at=parse_ts(r["detected_at"]),
            ended_at=parse_ts(r.get("ended_at")),
            during_business_hours=bool(r.get("during_business_hours")),
            muted=bool(r.get("muted")),
            central_suspect=bool(r.get("central_suspect")),
            alert_sent_at=parse_ts(r.get("alert_sent_at")),
            recovery_alert_sent_at=parse_ts(r.get("recovery_alert_sent_at")),
            late_open_alert_sent_at=parse_ts(r.get("late_open_alert_sent_at")),
            summary_sent_at=parse_ts(r.get("summary_sent_at")),
        )

    def minutes(self, now: datetime) -> float:
        return ((self.ended_at or now) - self.started_at).total_seconds() / 60


@dataclass
class ReadResult:
    """ผลอ่านหน้า Cloud P2P Device (หลังอ่าน 2 ครั้งแล้วตรงกัน)"""
    ok: bool
    total: Optional[int] = None
    offline: list = field(default_factory=list)   # [(code, name)]
    page_full: bool = False
    error: Optional[str] = None


@dataclass
class Email:
    kind: str                 # offline | offline_mass | online | late_open | summary | central | monitor_failed
    to: list
    subject: str
    text: str
    html: str
    marks: list = field(default_factory=list)    # [(outage_id, column)] เขียนเวลาส่งเมื่อส่งสำเร็จ


@dataclass
class Plan:
    run: dict
    monitor_updates: dict = field(default_factory=dict)    # store_id -> {col: value}
    new_outages: list = field(default_factory=list)        # [dict] พร้อม insert (มี id แล้ว)
    outage_updates: dict = field(default_factory=dict)     # outage_id -> {col: value}
    store_online_status: dict = field(default_factory=dict)  # store_id -> 'Online' | 'Offline'
    emails: list = field(default_factory=list)


# ---------------------------------------------------------------- หลัก
def plan_cycle(
    *,
    now: datetime,
    read: ReadResult,
    settings: Settings,
    stores: list,                 # [Store]
    monitors: dict,               # store_id -> Monitor
    open_outages: list,           # [Outage] ended_at is null
    recent_closed: list,          # [Outage] ปิดแล้วภายใน EMAIL_RETRY_MINUTES ที่ยังไม่ได้ส่งเมลกลับมา
    pending_summary: list,        # [Outage] นอกเวลาทำการ ยังไม่อยู่ในเมลสรุป (ย้อนหลัง ~2 วัน)
    prev_run_status: Optional[str],
    failed_streak_before: int,    # จำนวนรอบ failed ติดกันก่อนรอบนี้
    portal_url: str = "",
    new_id: Callable[[], str] = lambda: str(uuid.uuid4()),
) -> Plan:
    s = settings
    by_id = {st.id: st for st in stores}
    by_code = {st.code: st for st in stores}
    outages = {o.id: o for o in open_outages}
    mons = {sid: Monitor(**vars(m)) for sid, m in monitors.items()}   # สำเนา แก้ได้
    for st in stores:
        mons.setdefault(st.id, Monitor(store_id=st.id))

    plan = Plan(run={})
    upd = plan.monitor_updates

    def set_mon(sid: str, **cols):
        m = mons[sid]
        for k, v in cols.items():
            setattr(m, k, v)
        upd.setdefault(sid, {}).update({k: iso(v) if isinstance(v, datetime) else v for k, v in cols.items()})

    # ---- 1) จัดประเภทรอบตรวจ
    status, err = "ok", None
    if not read.ok or read.total is None:
        status, err = "failed", read.error or "อ่านยอดรวม (Total) ไม่ได้"
    elif read.total > 0 and len(read.offline) / read.total >= s.suspect_ratio:
        status = "suspect"
    elif read.page_full:
        status = "partial"

    matched, unmatched = [], []
    for code, name in (read.offline if status != "failed" else []):
        st = by_code.get(code)
        if st:
            matched.append((st, name))
        else:
            unmatched.append(f"{code} - {name}".strip(" -"))

    plan.run = {
        "status": status,
        "ivms_total": read.total,
        "offline_count": len(read.offline) if status != "failed" else None,
        "page_full": read.page_full if status != "failed" else None,
        "unmatched": unmatched,
        "error": err,
    }

    alert_to = list(s.alert_recipients)
    admin_to = list(s.admin_recipients) or alert_to
    send = s.emails_enabled

    # ---- 2) รอบที่ไว้ใจไม่ได้: ไม่เปลี่ยนสถานะใคร
    if status == "failed":
        plan.run["monitored_count"] = sum(1 for m in mons.values() if m.monitored)
        if send and admin_to and failed_streak_before + 1 == FAILED_RUNS_BEFORE_ADMIN_EMAIL:
            plan.emails.append(email_monitor_failed(admin_to, now, err, failed_streak_before + 1))
        _summary_and_late(plan, now, s, by_id, mons, outages, pending_summary, alert_to, send, portal_url)
        return plan

    # สาขาที่เห็นใน iVMS แต่ยังไม่ได้ติ๊ก -> ติ๊กให้เลย (R1/R9) + จำชื่อเครื่อง
    for st, name in matched:
        m = mons[st.id]
        cols = {}
        if not m.monitored:
            cols["monitored"] = True
        if not m.first_seen_at:
            cols["first_seen_at"] = now
        dev = f"{st.code} - {name}".strip(" -")
        if name and m.ivms_device_name != dev:
            cols["ivms_device_name"] = dev
        if cols:
            set_mon(st.id, **cols)

    plan.run["monitored_count"] = sum(1 for m in mons.values() if m.monitored)

    if status == "suspect":
        if send and admin_to and prev_run_status != "suspect":
            plan.emails.append(email_central(sorted(set(admin_to + alert_to)), now, read, portal_url))
        _summary_and_late(plan, now, s, by_id, mons, outages, pending_summary, alert_to, send, portal_url)
        return plan

    # ---- 3) ตัดสินรายสาขา (ok / partial)
    seen_offline = {st.id for st, _ in matched}
    newly_closed = []
    for sid, m in mons.items():
        if not m.monitored or sid not in by_id:
            continue
        if sid in seen_offline:
            streak = m.offline_streak + 1
            if m.state != "Offline" and streak >= s.confirm_cycles:
                started = m.last_seen_at or m.state_since or (now - timedelta(minutes=s.check_interval_minutes * streak))
                o_open, o_close = m.hours(s)
                o = Outage(
                    id=new_id(), store_id=sid, started_at=started, detected_at=now,
                    during_business_hours=within_hours(started, o_open, o_close), muted=m.muted(now),
                )
                outages[o.id] = o
                plan.new_outages.append(_outage_row(o))
                set_mon(sid, state="Offline", state_since=now, offline_streak=streak, current_outage_id=o.id)
                plan.store_online_status[sid] = "Offline"
            elif m.offline_streak != streak:
                set_mon(sid, offline_streak=streak)
        elif status == "ok":
            if m.state == "Offline":
                o = outages.pop(m.current_outage_id, None) if m.current_outage_id else None
                if o:
                    o.ended_at = now
                    plan.outage_updates.setdefault(o.id, {})["ended_at"] = iso(now)
                    newly_closed.append(o)
                set_mon(sid, state="Online", state_since=now, last_seen_at=now, offline_streak=0, current_outage_id=None)
                plan.store_online_status[sid] = "Online"
            else:
                cols = {"last_seen_at": now, "offline_streak": 0}
                if m.state != "Online":
                    cols.update(state="Online", state_since=now)
                    plan.store_online_status[sid] = "Online"
                set_mon(sid, **cols)
        # partial + ไม่เห็นในหน้าจอ = มองไม่เห็น -> คงค่าเดิมทั้งหมด

    # ---- 4) เมลหลุด (ในเวลาทำการ, ไม่ mute, ยังไม่เคยส่ง) — รวมฉบับเดียวถ้าเยอะ/หน้าเต็ม
    if send and alert_to:
        cutoff = now - timedelta(minutes=EMAIL_RETRY_MINUTES)
        due = [o for o in outages.values()
               if o.during_business_hours and not o.muted and not o.alert_sent_at and o.detected_at >= cutoff
               and o.store_id in by_id and not mons[o.store_id].muted(now)]
        due.sort(key=lambda o: by_id[o.store_id].code)
        if due and (len(due) >= s.mass_alert_threshold or read.page_full):
            for o in due:
                o.central_suspect = True
                plan.outage_updates.setdefault(o.id, {})["central_suspect"] = True
                _patch_new(plan, o.id, central_suspect=True)
            plan.emails.append(email_offline_mass(alert_to, now, due, by_id, mons, s, read.page_full, portal_url))
        else:
            for o in due:
                plan.emails.append(email_offline(alert_to, now, o, by_id[o.store_id], mons[o.store_id], s, portal_url))

        # ---- 5) เมลกลับมา (เฉพาะที่เคยแจ้งทันที)
        back = [o for o in newly_closed + recent_closed
                if o.alert_sent_at and not o.recovery_alert_sent_at and not o.muted and o.ended_at and o.ended_at >= cutoff]
        seen_ids, uniq = set(), []
        for o in back:
            if o.id not in seen_ids and o.store_id in by_id:
                seen_ids.add(o.id)
                uniq.append(o)
        if uniq:
            plan.emails.append(email_online(alert_to, now, uniq, by_id, portal_url))

    _summary_and_late(plan, now, s, by_id, mons, outages, pending_summary, alert_to, send, portal_url)
    return plan


def _outage_row(o: Outage) -> dict:
    return {
        "id": o.id, "store_id": o.store_id, "started_at": iso(o.started_at), "detected_at": iso(o.detected_at),
        "during_business_hours": o.during_business_hours, "muted": o.muted, "central_suspect": o.central_suspect,
    }


def _patch_new(plan: Plan, outage_id: str, **cols):
    for row in plan.new_outages:
        if row["id"] == outage_id:
            row.update(cols)


def _summary_and_late(plan, now, s, by_id, mons, outages, pending_summary, alert_to, send, portal_url):
    if not (send and alert_to):
        return
    now_l = local(now)

    # ---- เปิดร้านแล้ว N นาที ยังไม่ Online
    late = []
    for o in outages.values():
        m = mons.get(o.store_id)
        st = by_id.get(o.store_id)
        if not m or not st or not m.monitored or m.state != "Offline" or o.muted or m.muted(now) or o.late_open_alert_sent_at:
            continue
        open_t, close_t = m.hours(s)
        open_dt = datetime.combine(now_l.date(), open_t, BKK)
        if open_dt > now_l:
            open_dt -= timedelta(days=1)      # ร้านที่เปิดข้ามเที่ยงคืน
        due_at = open_dt + timedelta(minutes=s.late_open_grace_minutes)
        if now_l >= due_at and within_hours(now, open_t, close_t) and o.started_at < open_dt \
                and now_l - due_at < timedelta(hours=3):
            late.append((o, st, m, open_t))
    if late:
        late.sort(key=lambda x: x[1].code)
        plan.emails.append(email_late_open(alert_to, now, late, s, portal_url))

    # ---- เมลสรุปเช้า: หลุดนอกเวลาทำการ ตั้งแต่ปิดร้านเมื่อวานถึงเวลาส่งสรุปวันนี้
    summary_dt = datetime.combine(now_l.date(), s.morning_summary_time, BKK)
    if now_l < summary_dt:
        return
    window_start = summary_dt - timedelta(days=1)
    items = [o for o in pending_summary
             if not o.summary_sent_at and not o.during_business_hours and not o.muted
             and window_start <= local(o.started_at) < summary_dt and o.store_id in by_id]
    if items:
        # สถานะล่าสุดของการหลุดที่ยังเปิดอยู่ใช้ค่าจากรอบนี้ (อาจเพิ่งกลับมา)
        items = [outages.get(o.id, o) if not o.ended_at else o for o in items]
        for o in items:
            upd = plan.outage_updates.get(o.id, {})
            if "ended_at" in upd and not o.ended_at:
                o.ended_at = parse_ts(upd["ended_at"])
        items.sort(key=lambda o: (o.ended_at is not None, by_id[o.store_id].code))
        plan.emails.append(email_summary(alert_to, now, items, by_id, window_start, summary_dt, portal_url))


# ---------------------------------------------------------------- แม่แบบเมล
RED, AMBER, DARK, GREEN = "#D71920", "#E2A400", "#333333", "#1E9E5A"


def _html(color: str, title: str, intro: str, table_head: list, rows: list, footer: str, portal_url: str) -> str:
    def esc(x):
        return str(x).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    head = "".join(f'<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #eee;color:#6b6b6b;font-weight:600">{esc(h)}</th>' for h in table_head)
    body = "".join(
        "<tr>" + "".join(f'<td style="padding:6px 8px;border-bottom:1px solid #f2f2f4">{esc(c)}</td>' for c in r) + "</tr>" for r in rows
    )
    link = (f'<p><a href="{esc(portal_url)}/status" style="display:inline-block;background:{RED};color:#fff;'
            f'padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">เปิดใน Command Center</a></p>') if portal_url else ""
    return (
        f'<div style="font-family:Tahoma,Arial,sans-serif;color:#333;max-width:640px">'
        f'<div style="height:6px;background:{color}"></div>'
        f'<h2 style="margin:16px 0 8px;color:{color}">{esc(title)}</h2>'
        f'<p style="margin:0 0 12px">{esc(intro)}</p>'
        f'<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'
        f'<p style="color:#5c5c5c;font-size:13px;margin-top:12px">{esc(footer)}</p>{link}'
        f'<p style="color:#8a8a8a;font-size:11px">BATA CCTV Command Center · ส่งอัตโนมัติจากตัวตรวจ iVMS ที่ HQ</p></div>'
    )


def _text(title, intro, table_head, rows, footer, portal_url):
    lines = [title, "", intro, "", " | ".join(table_head)]
    lines += [" | ".join(str(c) for c in r) for r in rows]
    lines += ["", footer]
    if portal_url:
        lines.append(f"{portal_url}/status")
    return "\n".join(lines)


def _mk(kind, to, subject, color, title, intro, head, rows, footer, portal_url, marks):
    return Email(kind=kind, to=to, subject=subject,
                 text=_text(title, intro, head, rows, footer, portal_url),
                 html=_html(color, title, intro, head, rows, footer, portal_url), marks=marks)


def email_offline(to, now, o, st, m, s, portal_url):
    open_t, close_t = m.hours(s)
    mins = o.minutes(now)
    rows = [
        ["สาขา", st.label], ["ภาค / เขต", f"{st.region_short} · {st.zone_code}"],
        ["Last seen", fmt_day_hm(o.started_at, now)], ["ตรวจพบ", f"{fmt_hm(o.detected_at)} (หลุดมาแล้ว {fmt_duration(mins)})"],
        ["เวลาทำการ", f"{open_t:%H:%M}–{close_t:%H:%M}"],
    ]
    return _mk("offline", to, f"[CCTV Offline] {st.label} · {st.region_short} {st.zone_code} — หลุดตั้งแต่ {fmt_hm(o.started_at)}",
               RED, f"DVR สาขา {st.name} Offline", "DVR ไม่ตอบสนองใน iVMS-4200 ระหว่างเวลาทำการ", ["", ""], rows,
               "เช็กเบื้องต้น: โทรถามสาขาว่า DVR มีไฟ / เน็ตซิมใช้ได้ไหม ถ้ากลับมาจะมีเมลแจ้งอีกฉบับ", portal_url,
               [(o.id, "alert_sent_at")])


def email_offline_mass(to, now, due, by_id, mons, s, page_full, portal_url):
    rows = [[by_id[o.store_id].label, by_id[o.store_id].zone_code, fmt_day_hm(o.started_at, now)] for o in due]
    more = " (หน้าจอ iVMS เต็ม อาจมีมากกว่านี้)" if page_full else ""
    return _mk("offline_mass", to, f"[CCTV Offline ×{len(due)}] หลายสาขาหลุดพร้อมกัน — อาจเป็นปัญหาฝั่งกลาง",
               AMBER, f"{len(due)} สาขาหลุดในรอบตรวจเดียว ({fmt_hm(now)} น.){more}",
               "หลุดพร้อมกันจำนวนมากมักเป็นปัญหาฝั่งกลาง ไม่ใช่ที่สาขา — เช็กก่อน: เน็ต HQ, คอมที่เปิด iVMS, สถานะ Hik-Connect",
               ["สาขา", "เขต", "Last seen"], rows, "ถ้าเป็นปัญหาที่สาขาจริง จะเห็นค้างเป็น Offline ในหน้า Device Status", portal_url,
               [(o.id, "alert_sent_at") for o in due])


def email_online(to, now, back, by_id, portal_url):
    rows = [[by_id[o.store_id].label, fmt_day_hm(o.started_at, now), fmt_hm(o.ended_at), fmt_duration(o.minutes(now))] for o in back]
    if len(back) == 1:
        st = by_id[back[0].store_id]
        subject = f"[CCTV Online] {st.label} กลับมาแล้ว — หลุด {fmt_duration(back[0].minutes(now))}"
    else:
        subject = f"[CCTV Online] {len(back)} สาขากลับมาแล้ว"
    return _mk("online", to, subject, GREEN, "DVR กลับมา Online แล้ว", "สาขาที่เคยแจ้งว่าหลุด ตอนนี้กลับมาใน iVMS แล้ว",
               ["สาขา", "หลุด", "กลับ", "นาน"], rows, "", portal_url, [(o.id, "recovery_alert_sent_at") for o in back])


def email_late_open(to, now, late, s, portal_url):
    rows = [[st.label, f"{open_t:%H:%M}", fmt_day_hm(o.started_at, now)] for o, st, m, open_t in late]
    return _mk("late_open", to, f"[CCTV ยังไม่ Online] {len(late)} สาขาเปิดร้านแล้ว {s.late_open_grace_minutes} นาที",
               RED, f"เปิดร้านแล้ว {s.late_open_grace_minutes} นาที DVR ยังไม่กลับมา",
               "ร้านเปิดแล้วแต่ DVR ยังไม่กลับมา — กล้องไม่บันทึกระหว่างเปิดขาย", ["สาขา", "เปิดร้าน", "Last seen"], rows,
               "", portal_url, [(o.id, "late_open_alert_sent_at") for o, _, _, _ in late])


def email_summary(to, now, items, by_id, start, end, portal_url):
    still = [o for o in items if not o.ended_at]
    rows = [[by_id[o.store_id].label, fmt_day_hm(o.started_at, now),
             "ยังไม่กลับ" if not o.ended_at else fmt_day_hm(o.ended_at, now), fmt_duration(o.minutes(now))] for o in items]
    stores = len({o.store_id for o in items})
    return _mk("summary", to, f"[CCTV สรุปเช้า] {fmt_thai_date(local(end).date())} — DVR ดับนอกเวลาทำการ {stores} สาขา",
               DARK, f"DVR ดับนอกเวลาทำการ {stores} สาขา (ยังไม่กลับ {len({o.store_id for o in still})})",
               f"ช่วง {fmt_day_hm(start, now)} – {fmt_hm(end)} น. · นโยบาย DVR ต้องเปิด 24 ชม.",
               ["สาขา", "ดับ", "กลับ", "นาน"], rows, "", portal_url, [(o.id, "summary_sent_at") for o in items])


def email_central(to, now, read, portal_url):
    rows = [[f"{c} - {n}"] for c, n in read.offline[:30]]
    return _mk("central", to, f"[CCTV Monitor] Offline {len(read.offline)} จาก {read.total} เครื่อง — สงสัยปัญหาฝั่งกลาง",
               AMBER, "สงสัยปัญหาฝั่งกลาง (ไม่เปลี่ยนสถานะสาขา)",
               f"รอบ {fmt_hm(now)} น. iVMS แสดง Offline {len(read.offline)} จาก {read.total} เครื่อง — มักเป็นเน็ต HQ หรือ Hik-Connect มีปัญหา",
               ["ที่เห็นบนหน้าจอ"], rows, "ระบบจะกลับมาตัดสินสถานะเองเมื่อจำนวน Offline ลดลง", portal_url, [])


def email_monitor_failed(to, now, err, n):
    return _mk("monitor_failed", to, f"[CCTV Monitor] ระบบตรวจอ่าน iVMS ไม่ได้ {n} รอบติดกัน", AMBER,
               f"อ่าน iVMS ไม่ได้ {n} รอบติดกัน", f"รอบล่าสุด {fmt_hm(now)} น.: {err}", ["เช็ก"],
               [["iVMS-4200 เปิดค้างหน้า Cloud P2P Device และเรียง Offline ไว้บนสุด"], ["หน้าต่างไม่ถูกย่อ / จอไม่ล็อก"],
                ["สคริปต์รันแบบ administrator"]], "สถานะสาขาใน portal ยังเป็นของรอบที่อ่านได้ล่าสุด", "", [])
