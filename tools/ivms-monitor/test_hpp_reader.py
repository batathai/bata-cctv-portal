"""
ทดสอบตัวอ่านไฟล์ Export ของ Hik-Partner Pro (hpp_reader) — รันได้ทุกเครื่อง ไม่ต้องมีเน็ต/Supabase
    python -m pytest test_hpp_reader.py -q
ข้อมูลในไฟล์นี้เป็นของสมมติ (Serial ปลอม) — repo นี้เป็น public ห้ามใส่ไฟล์ Export จริง
"""
from datetime import datetime, timedelta

import pytest

import state
from hpp_reader import ExportFormatError, parse_rows, read_export_file, to_read_result
from state import BKK, Monitor, Settings, Store, plan_cycle

HDR = ("Site Name", "Site Address", "Site Owner", "Site Manager", "Site Status", "Number of Devices",
       "Device Name", "Device Type", "Device Model", "Device Serial No.", "Device Network Status", "Firmware Version")
EXPORTED = datetime(2026, 10, 19, 10, 57, 46, tzinfo=BKK)


def dev(name, serial, status, site=None):
    return (site, None, None, None, None, None, name, "DVR/NVR", "DS-7204HGHI-K1", serial, status, "V4.30.203")


def sheet(devices, total=None, exported="2026/10/19 10:57:46"):
    return [
        ("Site Details",) + (None,) * 11,
        ("Basic Information",) + (None,) * 11,
        ("Exported At", exported) + (None,) * 10,
        ("Exported By", "Tester") + (None,) * 10,
        ("Total Number of Sites", "2") + (None,) * 10,
        ("Total Number of Devices", str(len(devices) if total is None else total)) + (None,) * 10,
        HDR,
        *devices,
    ]


ROWS = sheet([
    dev("54023 - CentralPlaza Chonburi", "FM0000001", "Online", site="Site_bata513cctv@gmail.com"),
    dev("54004 - Big C Pattaya", "G00000002", "Offline"),
    dev("53023 TOPS Plaza Phol", "G00000003", "Offline", site="Site_bata530cctv@gmail.com"),  # ไม่มีขีด (เจอในไฟล์จริง)
    dev("DS-7204HGHI-K1(G00000004)", "G00000004", "Online"),                                   # ชื่อค่าเริ่มต้น
])


# ---------------------------------------------------------------- อ่านไฟล์
def test_parse_codes_serials_and_status():
    p = parse_rows(ROWS)
    assert p["total"] == 4 and p["exported_at"] == EXPORTED and not p["skipped"]
    keys = {d["key"]: d["status"] for d in p["devices"]}
    assert keys == {"54023@SN:FM0000001": "Online", "54004@SN:G00000002": "Offline",
                    "53023@SN:G00000003": "Offline", "SN:G00000004": "Online"}
    assert next(d for d in p["devices"] if d["code"] == "53023")["name"] == "TOPS Plaza Phol"


def test_read_result_matches_reader_contract():
    r = to_read_result(parse_rows(ROWS), now=EXPORTED + timedelta(minutes=1))
    assert r.ok and r.complete and r.total == 4 and not r.page_full
    assert [k for k, _ in r.offline] == ["53023@SN:G00000003", "54004@SN:G00000002"]
    assert len(r.online) == 2


def test_two_devices_same_store_any_offline_wins():
    rows = sheet([dev("51403 - Future Park A", "G00000010", "Online"), dev("51403 - Future Park A", "G00000010", "Offline")])
    r = to_read_result(parse_rows(rows))
    assert [k for k, _ in r.offline] == ["51403@SN:G00000010"] and r.online == []


def test_stale_file_is_failed_read():
    r = to_read_result(parse_rows(ROWS), now=EXPORTED + timedelta(minutes=30))
    assert not r.ok and "เก่าเกินไป" in r.error


def test_unknown_status_skipped_and_marks_incomplete():
    logs = []
    rows = sheet([dev("54004 - Big C Pattaya", "G00000002", "Offline"), dev("55001 - HuaHin", "G00000005", "Abnormal")])
    r = to_read_result(parse_rows(rows), log=logs.append)
    assert r.ok and not r.complete and len(r.offline) == 1
    assert any("Abnormal" in x for x in logs)


def test_total_mismatch_marks_incomplete():
    r = to_read_result(parse_rows(sheet(ROWS[7:], total=122)), log=lambda _: None)
    assert r.ok and not r.complete and r.total == 122


def test_missing_header_raises():
    with pytest.raises(ExportFormatError):
        parse_rows([("Site Details",), ("Device Name", "Status")])


def test_empty_export_is_failed_read():
    r = to_read_result(parse_rows(sheet([])))
    assert not r.ok


def test_real_xlsx_roundtrip(tmp_path):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "site"
    for row in ROWS:
        ws.append(list(row))
    f = tmp_path / "export.xlsx"
    wb.save(f)
    r = read_export_file(str(f), now=EXPORTED + timedelta(minutes=2))
    assert r.ok and r.total == 4 and len(r.offline) == 2


def test_broken_file_is_failed_read(tmp_path):
    f = tmp_path / "x.xlsx"
    f.write_bytes(b"not a zip")
    r = read_export_file(str(f))
    assert not r.ok and "อ่านไฟล์ Export ไม่ได้" in r.error


# ---------------------------------------------------------------- ผ่าน state.plan_cycle (ไม่ต้องแก้ state)
def test_plan_cycle_with_hpp_read():
    stores = [
        Store(id="a", code="54004", name="Big C Pattaya", region="Bangkok", zone="513"),
        Store(id="b", code="53023", name="TOPS Plaza Phol", region="Upcountry", zone="530"),
        Store(id="c", code="54023", name="CentralPlaza Chonburi", region="Bangkok", zone="513"),
        Store(id="d", code="51938", name="Lotus Lat Phrao", region="Bangkok", zone="512", serials=("G00000004",)),
        Store(id="e", code="51438", name="Central Pinklao", region="Bangkok", zone="511"),  # ไม่มีใน HPP
    ]
    t0 = datetime(2026, 10, 19, 13, 0, tzinfo=BKK)
    mons = {s.id: Monitor(store_id=s.id, monitored=True, state="Online", state_since=t0, last_seen_at=t0) for s in stores}
    read = to_read_result(parse_rows(ROWS))
    p = plan_cycle(now=t0 + timedelta(minutes=5), read=read, settings=Settings(alert_recipients=["x@example.com"]),
                   stores=stores, monitors=mons, open_outages=[], recent_closed=[], pending_summary=[],
                   prev_run_status="ok", failed_streak_before=0, new_id=lambda: "o1")
    assert p.run["status"] == "ok" and p.run["unmatched"] == []
    assert p.monitor_updates["a"]["offline_streak"] == 1        # Offline รอบแรก ยังไม่ยืนยัน (confirm 2 รอบ)
    assert p.monitor_updates["d"]["last_seen_at"]               # ชื่อค่าเริ่มต้น จับคู่ด้วย Serial ได้
    assert "e" not in p.monitor_updates                         # ไม่อยู่ใน HPP -> คงค่าเดิม ไม่ถูกปิด/เปิดเอง


def test_code_in_name_disagrees_with_serial_trusts_serial():
    stores = [Store(id="x", code="54004", name="Big C Pattaya"), Store(id="y", code="54044", name="Robinson", serials=("G00000002",))]
    mons = {s.id: Monitor(store_id=s.id, monitored=True, state="Online") for s in stores}
    fill = [dev(f"5900{i} - Other", f"G1000000{i}", "Online") for i in range(4)]   # กันเข้าเกณฑ์ suspect (Offline >= 80%)
    read = to_read_result(parse_rows(sheet([dev("54004 - Big C Pattaya", "G00000002", "Offline")] + fill)))
    p = plan_cycle(now=datetime(2026, 10, 19, 13, 5, tzinfo=BKK), read=read, settings=Settings(), stores=stores,
                   monitors=mons, open_outages=[], recent_closed=[], pending_summary=[], prev_run_status="ok",
                   failed_streak_before=0)
    assert p.monitor_updates["y"]["offline_streak"] == 1 and "x" not in p.monitor_updates
    assert any("Serial" in n for n in p.run["unmatched"])


def test_failed_email_wording_follows_source():
    try:
        state.set_source("hpp")
        e = state.email_monitor_failed(["a@example.com"], datetime(2026, 10, 19, 13, 0, tzinfo=BKK), "session หมด", 3)
        assert "Hik-Partner Pro" in e.subject and "--setup" in e.text and "iVMS" not in e.text + e.html
    finally:
        state.set_source("ivms")
