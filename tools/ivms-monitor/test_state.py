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
    assert kinds(p2) == ["cycle"]
    assert p2.emails[0].marks == [(o["id"], "alert_sent_at")]
    assert "Offline ใหม่ 1" in p2.emails[0].subject
    assert "51403 Future Park" in p2.emails[0].text


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
    assert kinds(p) == ["cycle"]
    assert p.emails[0].marks == [("oa", "recovery_alert_sent_at")]
    assert "กลับมา 1" in p.emails[0].subject
    assert "1 ชม. 20 นาที" in p.emails[0].text

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
    assert kinds(p) == ["cycle"]
    assert all(r["central_suspect"] for r in p.new_outages)
    assert len(p.emails[0].marks) == 12
    assert "ปัญหาฝั่งกลาง" in p.emails[0].text


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
    assert kinds(p) == ["cycle"]                          # หน้าเต็ม -> ฉบับเดียว + เตือนฝั่งกลาง
    assert "หน้าจอ iVMS เต็ม" in p.emails[0].text


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
    assert kinds(run(at(13, 10), ok(offline=["51403"]), m, open_outages=[o])) == ["cycle"]
    assert kinds(run(at(14, 10), ok(offline=["51403"]), m, open_outages=[o])) == []


# ---------------------------------------------------------------- เปิดร้าน + สรุปเช้า
def test_late_open_alert_after_grace():
    o = Outage(id="ol", store_id="s2", started_at=at(22, 10, day=7), detected_at=at(22, 20, day=7), during_business_hours=False)
    m = {"s2": mon("s2", state="Offline", last_seen_at=at(22, 10, day=7), offline_streak=2, current_outage_id="ol")}
    assert kinds(run(at(10, 20), ok(offline=["53023"]), m, open_outages=[o])) == []
    p = run(at(10, 30), ok(offline=["53023"]), m, open_outages=[o])
    assert kinds(p) == ["cycle"]
    assert p.emails[0].marks == [("ol", "late_open_alert_sent_at")]
    assert "ยังไม่ Online หลังเปิดร้าน 1" in p.emails[0].subject


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


def test_one_email_per_cycle_lists_everything():
    """หลุดใหม่ 2 + กลับมา 1 + ยัง Offline อยู่ 1 -> เมลเดียว มีครบทุกหัวข้อ"""
    # หลุดตั้งแต่ 10:40 วันนี้ (หลังเปิดร้าน) และแจ้งไปแล้ว -> อยู่ในหัวข้อ "ยัง Offline อยู่" เท่านั้น
    old = Outage(id="old", store_id="s3", started_at=at(10, 40), detected_at=at(10, 50), alert_sent_at=at(10, 50))
    back = Outage(id="bk", store_id="s2", started_at=at(12), detected_at=at(12, 10), alert_sent_at=at(12, 10))
    m = {
        "s1": mon("s1", offline_streak=1, last_seen_at=at(13)),
        "s2": mon("s2", state="Offline", current_outage_id="bk"),
        "s3": mon("s3", state="Offline", current_outage_id="old"),
    }
    stores = STORES + [Store(id="s4", code="51944", name="MBK", region="Bangkok", zone="511")]
    m["s4"] = mon("s4", offline_streak=1, last_seen_at=at(13))
    p = run(at(13, 5), ok(total=4, offline=["51403", "51944", "54013"]), m, stores=stores, open_outages=[old, back])
    assert kinds(p) == ["cycle"]
    e = p.emails[0]
    assert sorted(c for _, c in e.marks) == ["alert_sent_at", "alert_sent_at", "recovery_alert_sent_at"]
    assert "Offline ใหม่ 2" in e.subject and "กลับมา 1" in e.subject and "Offline ตอนนี้ 3 สาขา" in e.subject
    assert "ยัง Offline อยู่ก่อนหน้านี้ (1)" in e.text and "54013 Big C Chachoengsao" in e.text


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))


# ---------------------------------------------------------------- 1.1.0: อ่านครบทุกหน้า, 2 บัญชี iVMS
def full(total, offline=(), online=(), complete=True):
    names = {s.code: s.name for s in STORES}
    return ReadResult(ok=True, total=total, offline=[(c, names.get(c, "?")) for c in offline],
                      online=[(c, names.get(c, "?")) for c in online], complete=complete)


def test_full_read_leaves_stores_of_other_account_untouched():
    # s1 อยู่บัญชีที่เปิดอยู่ (Online), s2 อยู่อีกบัญชี (ไม่เห็น) -> s2 ห้ามถูกเปลี่ยนเป็น Online
    mons = {"s1": mon("s1", state="Online"), "s2": mon("s2", state="Offline", offline_streak=3, last_seen_at=at(9))}
    p = run(at(14), full(1, online=["51403"]), mons)
    assert "s2" not in p.monitor_updates
    assert p.monitor_updates["s1"]["last_checked_at"]
    assert p.run["status"] == "ok"


def test_full_read_auto_ticks_online_stores_too():
    # เห็น s3 Online ครั้งแรก -> ติ๊ก monitored (เคย sync) และเป็น Online ทันที
    mons = {"s3": mon("s3", monitored=False, state="Unknown", last_seen_at=None)}
    p = run(at(14), full(1, online=["54013"]), mons)
    u = p.monitor_updates["s3"]
    assert u["monitored"] is True and u["state"] == "Online" and u["first_seen_at"]
    assert p.store_online_status == {"s3": "Online"}


def test_full_read_offline_still_needs_two_cycles():
    mons = {"s1": mon("s1")}
    p1 = run(at(14), full(10, offline=["51403"]), mons)
    assert p1.new_outages == [] and p1.monitor_updates["s1"]["offline_streak"] == 1
    mons["s1"].offline_streak = 1
    p2 = run(at(14, 30), full(10, offline=["51403"]), mons)
    assert len(p2.new_outages) == 1 and p2.store_online_status == {"s1": "Offline"}


def test_full_read_seen_online_closes_outage():
    o = Outage(id="o9", store_id="s1", started_at=at(12), detected_at=at(12, 10), during_business_hours=True)
    mons = {"s1": mon("s1", state="Offline", current_outage_id="o9", offline_streak=2)}
    p = run(at(14), full(1, online=["51403"]), mons, open_outages=[o])
    assert p.outage_updates["o9"]["ended_at"]
    assert p.monitor_updates["s1"]["state"] == "Online"


def test_incomplete_full_read_is_partial_but_updates_what_it_saw():
    mons = {"s1": mon("s1", state="Unknown"), "s2": mon("s2", state="Online")}
    p = run(at(14), full(3, online=["51403"], complete=False), mons)
    assert p.run["status"] == "partial"
    assert p.monitor_updates["s1"]["state"] == "Online"
    assert "s2" not in p.monitor_updates
