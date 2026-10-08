"""
ทดสอบกติกาใน state.py — รันได้ทุกเครื่อง ไม่ต้องมี iVMS / Supabase / เน็ต
    pip install pytest
    python -m pytest test_state.py -q
"""
from datetime import datetime, time, timedelta
from itertools import count

import pytest

from state import (BKK, Monitor, Outage, ReadResult, Settings, Store, fmt_duration, parse_ts, plan_cycle,
                   within_hours)

STORES = [
    Store(id="s1", code="51403", name="Future Park", region="Bangkok", zone="512"),
    Store(id="s2", code="53023", name="TOPS Plaza Phol", region="Upcountry", zone="530"),
    Store(id="s3", code="54013", name="Big C Chachoengsao", region="Upcountry", zone="540"),
]


def at(h, m=0, day=8):
    return datetime(2026, 10, day, h, m, tzinfo=BKK)


def settings(**kw):
    s = Settings(alert_recipients=["cctv@example.com"], admin_recipients=["admin@example.com"])
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def mon(sid, **kw):
    base = dict(store_id=sid, monitored=True, state="Online", state_since=at(8), last_seen_at=at(13))
    base.update(kw)
    return Monitor(**base)


def ok(total=3, offline=(), page_full=False):
    names = {s.code: s.name for s in STORES}
    return ReadResult(ok=True, total=total, offline=[(c, names.get(c, "Unknown")) for c in offline], page_full=page_full)


def run(now, read, monitors, *, s=None, stores=STORES, open_outages=(), recent_closed=(), pending=(), prev="ok", failed_before=0):
    ids = count(1)
    return plan_cycle(now=now, read=read, settings=s or settings(), stores=list(stores), monitors=monitors,
                      open_outages=list(open_outages), recent_closed=list(recent_closed), pending_summary=list(pending),
                      prev_run_status=prev, failed_streak_before=failed_before, new_id=lambda: f"o{next(ids)}")


def kinds(plan):
    return [e.kind for e in plan.emails]


# ---------------------------------------------------------------- helpers
def test_within_hours_and_wrap():
    assert within_hours(at(10), time(10), time(22))
    assert not within_hours(at(22), time(10), time(22))
    assert not within_hours(at(9, 59), time(10), time(22))
    assert within_hours(at(23), time(20), time(2))      # ข้ามเที่ยงคืน
    assert within_hours(at(1), time(20), time(2))
    assert not within_hours(at(3), time(20), time(2))


def test_parse_ts_variants():
    assert parse_ts("2026-10-08T06:00:00+00:00") == at(13)
    assert parse_ts("2026-10-08T06:00:00.12345Z") == at(13) + timedelta(microseconds=123450)
    assert parse_ts("2026-10-08 06:00:00+00") == at(13)


def test_fmt_duration():
    assert fmt_duration(22) == "22 นาที"
    assert fmt_duration(80) == "1 ชม. 20 นาที"
    assert fmt_duration(2520) == "1 วัน 18 ชม."


# ---------------------------------------------------------------- ตัดสินสถานะ
def test_first_ok_run_marks_unknown_online():
    p = run(at(13, 5), ok(), {"s1": mon("s1", state="Unknown", last_seen_at=None)})
    assert p.run["status"] == "ok"
    assert p.monitor_updates["s1"]["state"] == "Online"
    assert parse_ts(p.monitor_updates["s1"]["last_seen_at"]) == at(13, 5)
    assert p.store_online_status == {"s1": "Online"}


def test_offline_needs_two_cycles_then_instant_email_in_hours():
    m = {"s1": mon("s1", last_seen_at=at(12, 48))}
    p1 = run(at(12, 53), ok(offline=["51403"]), m)
    assert p1.new_outages == [] and p1.monitor_updates["s1"]["offline_streak"] == 1
    assert "state" not in p1.monitor_updates["s1"]
    assert kinds(p1) == []

    m2 = {"s1": mon("s1", last_seen_at=at(12, 48), offline_streak=1)}
    p2 = run(at(12, 58), ok(offline=["51403"]), m2)
    assert len(p2.new_outages) == 1
    o = p2.new_outages[0]
    assert parse_ts(o["started_at"]) == at(12, 48)       # เริ่มหลุด = last seen
    assert o["during_business_hours"] is True
    assert p2.monitor_updates["s1"]["state"] == "Offline"
    assert p2.monitor_updates["s1"]["current_outage_id"] == o["id"]
    assert p2.store_online_status == {"s1": "Offline"}
    assert kinds(p2) == ["offline"]
    assert p2.emails[0].marks == [(o["id"], "alert_sent_at")]
    assert "51403 Future Park" in p2.emails[0].subject


def test_after_hours_outage_has_no_instant_email():
    m = {"s2": mon("s2", last_seen_at=at(22, 10), offline_streak=1)}
    p = run(at(22, 20), ok(offline=["53023"]), m)
    assert p.new_outages[0]["during_business_hours"] is False
    assert kinds(p) == []


def test_per_store_hours_are_used():
    m = {"s3": mon("s3", last_seen_at=at(21, 30), offline_streak=1, open_time=time(9), close_time=time(21))}
    p = run(at(21, 40), ok(offline=["54013"]), m)
    assert p.new_outages[0]["during_business_hours"] is False


def test_recovery_sends_online_email_only_if_alerted():
    alerted = Outage(id="oa", store_id="s1", started_at=at(12, 48), detected_at=at(12, 58), alert_sent_at=at(12, 58))
    m = {"s1": mon("s1", state="Offline", last_seen_at=at(12, 48), offline_streak=2, current_outage_id="oa")}
    p = run(at(14, 8), ok(), m, open_outages=[alerted])
    assert p.outage_updates["oa"]["ended_at"]
    assert p.monitor_updates["s1"]["state"] == "Online"
    assert kinds(p) == ["online"]
    assert p.emails[0].marks == [("oa", "recovery_alert_sent_at")]
    assert "1 ชม. 20 นาที" in p.emails[0].subject

    quiet = Outage(id="ob", store_id="s2", started_at=at(22, 10, day=7), detected_at=at(22, 20, day=7), during_business_hours=False)
    m2 = {"s2": mon("s2", state="Offline", last_seen_at=at(22, 10, day=7), current_outage_id="ob")}
    p2 = run(at(9, 40), ok(), m2, open_outages=[quiet])
    assert p2.outage_updates["ob"]["ended_at"]
    assert kinds(p2) == []


def test_mass_offline_sends_one_summary_and_flags_central():
    stores = [Store(id=f"m{i}", code=f"5{i:04d}", name=f"Store {i}", region="Bangkok", zone="511") for i in range(12)]
    monitors = {s.id: mon(s.id, last_seen_at=at(14, 10), offline_streak=1) for s in stores}
    read = ReadResult(ok=True, total=57, offline=[(s.code, s.name) for s in stores])
    p = run(at(14, 20), read, monitors, stores=stores)
    assert len(p.new_outages) == 12
    assert kinds(p) == ["offline_mass"]
    assert all(r["central_suspect"] for r in p.new_outages)
    assert len(p.emails[0].marks) == 12


def test_suspect_run_changes_nothing_and_warns_once():
    monitors = {s.id: mon(s.id, offline_streak=1) for s in STORES}
    read = ok(total=3, offline=["51403", "53023", "54013"])      # 100% offline
    p = run(at(14), read, monitors)
    assert p.run["status"] == "suspect"
    assert p.new_outages == [] and p.store_online_status == {}
    # จำชื่อเครื่องได้ แต่ห้ามแตะสถานะ / last seen / streak
    assert all(not ({"state", "last_seen_at", "offline_streak"} & set(u)) for u in p.monitor_updates.values())
    assert kinds(p) == ["central"]
    p2 = run(at(14, 5), read, monitors, prev="suspect")
    assert kinds(p2) == []


def test_failed_reads_email_admin_on_third():
    m = {"s1": mon("s1")}
    bad = ReadResult(ok=False, error="ไม่เจอหน้าต่าง iVMS-4200")
    assert kinds(run(at(14), bad, m, failed_before=1)) == []
    p = run(at(14), bad, m, failed_before=2)
    assert p.run["status"] == "failed" and p.monitor_updates == {}
    assert kinds(p) == ["monitor_failed"]
    assert p.emails[0].to == ["admin@example.com"]
    assert kinds(run(at(14), bad, m, failed_before=3)) == []


def test_partial_keeps_unseen_stores_untouched():
    m = {"s1": mon("s1", last_seen_at=at(13)), "s2": mon("s2", offline_streak=1, last_seen_at=at(13))}
    p = run(at(13, 5), ok(total=40, offline=["53023"], page_full=True), m)
    assert p.run["status"] == "partial"
    assert "s1" not in p.monitor_updates                  # มองไม่เห็น -> ไม่อัปเดต last seen
    assert p.monitor_updates["s2"]["state"] == "Offline"
    assert kinds(p) == ["offline_mass"]                   # หน้าเต็ม -> รวมฉบับเดียว


def test_muted_store_records_outage_but_no_email():
    m = {"s1": mon("s1", offline_streak=1, muted_until=at(10, day=15))}
    p = run(at(13, 5), ok(offline=["51403"]), m)
    assert p.new_outages[0]["muted"] is True
    assert kinds(p) == []


def test_auto_tick_and_unmatched():
    m = {"s1": mon("s1", monitored=False, state="Unknown", last_seen_at=None)}
    read = ReadResult(ok=True, total=3, offline=[("51403", "Future Park"), ("51545", "Robinson Samut Prakan")])
    p = run(at(13), read, m)
    assert p.monitor_updates["s1"]["monitored"] is True
    assert p.monitor_updates["s1"]["first_seen_at"]
    assert p.monitor_updates["s1"]["ivms_device_name"] == "51403 - Future Park"
    assert p.run["unmatched"] == ["51545 - Robinson Samut Prakan"]


def test_emails_disabled_still_records():
    m = {"s1": mon("s1", offline_streak=1)}
    p = run(at(13, 5), ok(offline=["51403"]), m, s=settings(emails_enabled=False))
    assert len(p.new_outages) == 1 and kinds(p) == []


def test_unsent_alert_is_retried_within_an_hour():
    o = Outage(id="ox", store_id="s1", started_at=at(12, 40), detected_at=at(12, 50))
    m = {"s1": mon("s1", state="Offline", offline_streak=2, current_outage_id="ox")}
    assert kinds(run(at(13, 10), ok(offline=["51403"]), m, open_outages=[o])) == ["offline"]
    assert kinds(run(at(14, 10), ok(offline=["51403"]), m, open_outages=[o])) == []


# ---------------------------------------------------------------- เปิดร้าน + สรุปเช้า
def test_late_open_alert_after_grace():
    o = Outage(id="ol", store_id="s2", started_at=at(22, 10, day=7), detected_at=at(22, 20, day=7), during_business_hours=False)
    m = {"s2": mon("s2", state="Offline", last_seen_at=at(22, 10, day=7), offline_streak=2, current_outage_id="ol")}
    assert "late_open" not in kinds(run(at(10, 20), ok(offline=["53023"]), m, open_outages=[o]))
    p = run(at(10, 30), ok(offline=["53023"]), m, open_outages=[o])
    late = [e for e in p.emails if e.kind == "late_open"]
    assert len(late) == 1 and late[0].marks == [("ol", "late_open_alert_sent_at")]


def test_morning_summary_includes_after_hours_outages():
    closed = Outage(id="c1", store_id="s1", started_at=at(22, 5, day=7), detected_at=at(22, 15, day=7),
                    ended_at=at(9, 40), during_business_hours=False)
    still = Outage(id="c2", store_id="s2", started_at=at(22, 10, day=7), detected_at=at(22, 20, day=7), during_business_hours=False)
    m = {"s1": mon("s1"), "s2": mon("s2", state="Offline", offline_streak=2, current_outage_id="c2")}
    early = run(at(9, 55), ok(offline=["53023"]), m, open_outages=[still], pending=[closed, still])
    assert "summary" not in kinds(early)
    p = run(at(10, 0), ok(offline=["53023"]), m, open_outages=[still], pending=[closed, still])
    summ = [e for e in p.emails if e.kind == "summary"]
    assert len(summ) == 1
    assert sorted(summ[0].marks) == [("c1", "summary_sent_at"), ("c2", "summary_sent_at")]
    assert "2 สาขา" in summ[0].subject
    assert "ยังไม่กลับ" in summ[0].text


def test_no_recipients_means_no_emails():
    m = {"s1": mon("s1", offline_streak=1)}
    p = run(at(13, 5), ok(offline=["51403"]), m, s=Settings())
    assert len(p.new_outages) == 1 and kinds(p) == []


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
