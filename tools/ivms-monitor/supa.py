"""
supa.py — อ่าน/เขียน Supabase ผ่าน REST (PostgREST) ด้วย service_role key

service_role ข้าม RLS ได้ทั้งหมด: key นี้อยู่ในไฟล์ .env บนคอม HQ เท่านั้น
ห้าม commit ห้ามใส่ใน portal (แบบเดียวกับ Xstore sync ที่ใช้อยู่)
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

import requests

from state import EMAIL_RETRY_MINUTES, Monitor, Outage, Plan, Settings, Store, iso


class SupabaseError(Exception):
    pass


class Supa:
    def __init__(self, url: str, service_key: str, timeout: int = 20):
        if not url or not service_key:
            raise SupabaseError("ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env")
        # รับได้ทั้ง https://xxx.supabase.co และแบบที่ก๊อปมาพร้อม /rest/v1 (ไม่งั้นจะได้ 404 PGRST125)
        url = re.sub(r"(/rest/v1)?/*$", "", url.strip().strip('"').strip("'"))
        if not re.match(r"^https://[^/]+$", url):
            raise SupabaseError(f"SUPABASE_URL ควรเป็นแบบ https://xxxx.supabase.co (ตอนนี้คือ {url!r})")
        self.base = url + "/rest/v1"
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        })

    # ---------- low level ----------
    def _req(self, method, table, params=None, json=None, prefer=None):
        headers = {"Prefer": prefer} if prefer else {}
        r = self.s.request(method, f"{self.base}/{table}", params=params, json=json, headers=headers, timeout=self.timeout)
        if r.status_code >= 300:
            raise SupabaseError(f"{method} {table} -> {r.status_code}: {r.text[:300]}")
        return r.json() if r.text and method == "GET" else None

    def select(self, table, **params):
        out, start, page = [], 0, 1000
        while True:
            headers = {"Range-Unit": "items", "Range": f"{start}-{start + page - 1}"}
            r = self.s.get(f"{self.base}/{table}", params=params, headers=headers, timeout=self.timeout)
            if r.status_code >= 300:
                raise SupabaseError(f"GET {table} -> {r.status_code}: {r.text[:300]}")
            rows = r.json()
            out.extend(rows)
            if len(rows) < page:
                return out
            start += page

    def patch(self, table, filters: dict, body: dict):
        self._req("PATCH", table, params=filters, json=body, prefer="return=minimal")

    def insert(self, table, rows):
        if rows:
            self._req("POST", table, json=rows, prefer="return=minimal")

    # ---------- load ----------
    def load_settings(self) -> Settings:
        rows = self.select("monitor_settings", id="eq.1")
        return Settings.from_row(rows[0] if rows else None)

    def load_stores(self) -> list:
        rows = self.select("stores", select="id,store_code,store_name,region,zone,is_active")
        return [Store(id=r["id"], code=str(r["store_code"]).strip(), name=r.get("store_name") or "",
                      region=r.get("region") or "", zone=r.get("zone") or "")
                for r in rows if r.get("is_active", True) is not False]

    def load_monitors(self) -> dict:
        return {r["store_id"]: Monitor.from_row(r) for r in self.select("store_monitor")}

    def load_open_outages(self) -> list:
        return [Outage.from_row(r) for r in self.select("device_outages", ended_at="is.null")]

    def load_recent_closed(self, now: datetime) -> list:
        since = iso(now - timedelta(minutes=EMAIL_RETRY_MINUTES))
        rows = self.select("device_outages", ended_at=f"gte.{since}", alert_sent_at="not.is.null",
                           recovery_alert_sent_at="is.null")
        return [Outage.from_row(r) for r in rows]

    def load_pending_summary(self, now: datetime) -> list:
        since = iso(now - timedelta(days=2))
        rows = self.select("device_outages", during_business_hours="is.false", summary_sent_at="is.null",
                           muted="is.false", started_at=f"gte.{since}")
        return [Outage.from_row(r) for r in rows]

    def load_recent_runs(self, n: int = 10) -> list:
        r = self.s.get(f"{self.base}/monitor_runs", params={"select": "status,ran_at", "order": "ran_at.desc", "limit": str(n)},
                       timeout=self.timeout)
        if r.status_code >= 300:
            raise SupabaseError(f"GET monitor_runs -> {r.status_code}: {r.text[:300]}")
        return r.json()

    # ---------- write ----------
    def apply(self, plan: Plan):
        """ลำดับสำคัญ: สร้าง outage ก่อน แล้วค่อยชี้ current_outage_id ไปหา"""
        self.insert("device_outages", plan.new_outages)
        for oid, cols in plan.outage_updates.items():
            if cols:
                self.patch("device_outages", {"id": f"eq.{oid}"}, cols)
        for sid, cols in plan.monitor_updates.items():
            if cols:
                self.patch("store_monitor", {"store_id": f"eq.{sid}"}, cols)
        # ให้ online_status เดิมของ stores ตรงกับสถานะจริง (เฉพาะสาขาที่ monitored)
        for status in ("Online", "Offline"):
            ids = [sid for sid, st in plan.store_online_status.items() if st == status]
            for i in range(0, len(ids), 50):
                self.patch("stores", {"id": f"in.({','.join(ids[i:i + 50])})"}, {"online_status": status})

    def mark_sent(self, marks, at: datetime):
        for oid, col in marks:
            self.patch("device_outages", {"id": f"eq.{oid}"}, {col: iso(at)})

    def insert_run(self, run: dict):
        self.insert("monitor_runs", [run])

    def prune_runs(self, now: datetime, keep_days: int = 30):
        self._req("DELETE", "monitor_runs", params={"ran_at": f"lt.{iso(now - timedelta(days=keep_days))}"}, prefer="return=minimal")
