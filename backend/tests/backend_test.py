"""Polki Manufacturing Tracker - backend API regression tests."""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


def creds():
    p = Path("/app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8")
    email = re.search(r"(?im)^\s*[-*]\s*email\s*:\s*`?([^`\s]+)", content).group(1)
    password = re.search(r"(?im)^\s*[-*]\s*password\s*:\s*`?([^`\s]+)", content).group(1)
    return {"email": email, "password": password}


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    c = creds()
    r = s.post(f"{API}/auth/login", json=c, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token, "no token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------------------------------------------------------------- auth
class TestAuth:
    def test_root_health(self):
        r = requests.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_and_me(self, admin):
        r = admin.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == creds()["email"]
        assert d["role"] == "admin"
        assert "password_hash" not in d
        assert "_id" not in d
        assert all(d["permissions"].values())

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": f"nouser_{uuid.uuid4().hex[:6]}@polki.com", "password": "x"},
                          timeout=30)
        assert r.status_code == 401

    def test_no_token_401(self):
        r = requests.get(f"{API}/kapans", timeout=30)
        assert r.status_code == 401

    def test_invalid_token_401(self):
        r = requests.get(f"{API}/kapans", headers={"Authorization": "Bearer garbage"}, timeout=30)
        assert r.status_code == 401

    def test_bcrypt_hash_format(self, admin):
        # verify stored hash format via direct db check
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        env = dotenv_values("/app/backend/.env")

        async def go():
            cl = AsyncIOMotorClient(env["MONGO_URL"])
            u = await cl[env["DB_NAME"]].users.find_one({"email": creds()["email"]})
            cl.close()
            return u

        u = asyncio.get_event_loop().run_until_complete(go()) if False else asyncio.run(go())
        assert u and u["password_hash"].startswith("$2b$")

    def test_login_sets_httponly_cookies(self):
        r = requests.post(f"{API}/auth/login", json=creds(), timeout=30)
        assert r.status_code == 200
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token" in set_cookie and "HttpOnly" in set_cookie

    def test_seeded_staff_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "staff@polki.com", "password": "staff123"}, timeout=30)
        assert r.status_code == 200
        p = r.json()["permissions"]
        assert p["can_create"] is True and p["can_delete"] is False and p["can_manage_staff"] is False

    def test_refresh_endpoint_exists(self):
        r = requests.post(f"{API}/auth/refresh", json={}, timeout=30)
        assert r.status_code != 404, "POST /api/auth/refresh missing (documented in test_credentials.md)"


# ---------------------------------------------------------------- meta / dashboard
class TestMeta:
    def test_processes(self, admin):
        r = admin.get(f"{API}/meta/processes", timeout=30)
        assert r.status_code == 200
        keys = [p["key"] for p in r.json()]
        assert keys == ["sarine", "marking", "laser", "shape", "ghat", "polish",
                        "table_polish", "nats", "filling"]

    def test_dashboard(self, admin):
        r = admin.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("kapan_count", "total_weight", "in_process_weight", "total_loss",
                  "open_jangads", "karigar_count", "by_process"):
            assert k in d
        assert len(d["by_process"]) == 9
        assert set(d["by_process"]["laser"].keys()) == {"label", "open", "open_weight", "loss"}


# ---------------------------------------------------------------- karigars
class TestKarigars:
    created = []

    def test_create_and_filter(self, admin):
        name = f"TEST_K_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/karigars", json={"name": name, "phone": "9999900000",
                                                "processes": ["laser", "polish"]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["name"] == name and d["processes"] == ["laser", "polish"]
        assert "_id" not in d and "id" in d
        TestKarigars.created.append(d["id"])

        rl = admin.get(f"{API}/karigars?process=laser", timeout=30)
        assert rl.status_code == 200
        assert any(k["id"] == d["id"] for k in rl.json())
        rs = admin.get(f"{API}/karigars?process=shape", timeout=30)
        assert all(k["id"] != d["id"] for k in rs.json())

    def test_update_karigar(self, admin):
        assert TestKarigars.created, "needs created karigar"
        kid = TestKarigars.created[0]
        r = admin.put(f"{API}/karigars/{kid}",
                      json={"name": "TEST_K_upd", "phone": "1", "processes": ["shape"]}, timeout=30)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_K_upd"
        got = admin.get(f"{API}/karigars", timeout=30).json()
        assert any(k["id"] == kid and k["name"] == "TEST_K_upd" for k in got)

    def test_invalid_id(self, admin):
        r = admin.delete(f"{API}/karigars/notanid", timeout=30)
        assert r.status_code == 400

    def test_cleanup(self, admin):
        for kid in TestKarigars.created:
            r = admin.delete(f"{API}/karigars/{kid}", timeout=30)
            assert r.status_code in (200, 404)
        assert admin.delete(f"{API}/karigars/{'0' * 24}", timeout=30).status_code == 404


# ---------------------------------------------------------------- kapans + full process chain
class TestKapanChain:
    ids = {}

    def _issue(self, admin, process, pcs, weight, extra=None):
        body = {"kapan_id": self.ids["kapan"], "process": process, "date": "2026-07-01",
                "karigar_name": "TEST_KAR", "pcs": pcs, "weight": weight}
        body.update(extra or {})
        r = admin.post(f"{API}/entries", json=body, timeout=30)
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def _receive(self, admin, entry_id, body):
        r = admin.post(f"{API}/entries/{entry_id}/receive", json=body, timeout=30)
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_create_kapan(self, admin):
        kno = f"T{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/kapans", json={"date": "2026-07-01", "kapan_no": kno,
                                              "type": "Polki", "pcs": 10, "weight": 250.504},
                       timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["weight"] == 250.5
        assert d["size"] == 25.05
        assert "_id" not in d
        self.ids["kapan"] = d["id"]
        self.ids["kapan_no"] = kno

        g = admin.get(f"{API}/kapans/{d['id']}", timeout=30)
        assert g.status_code == 200
        gd = g.json()
        assert gd["kapan_no"] == kno and gd["weight"] == 250.5
        assert gd["report"]["kapan_weight"] == 250.5
        assert gd["report"]["status"] == "New"

    def test_duplicate_kapan_no(self, admin):
        r = admin.post(f"{API}/kapans", json={"date": "2026-07-01",
                                              "kapan_no": self.ids["kapan_no"],
                                              "pcs": 1, "weight": 1.0}, timeout=30)
        assert r.status_code == 400

    def test_kapan_404(self, admin):
        assert admin.get(f"{API}/kapans/{'0' * 24}", timeout=30).status_code == 404

    def test_issue_laser_and_in_process(self, admin):
        e = self._issue(admin, "laser", 10, 250.50, {"hw": "H", "expected_return_pcs": 20})
        assert re.match(r"^JG-\d{5}$", e["jangad_no"]), e["jangad_no"]
        assert e["returned"] is False
        assert e["size"] == 25.05
        assert e["loss"] == 0.0
        self.ids["laser"] = e["id"]
        self.ids["laser_jangad"] = e["jangad_no"]

        rep = admin.get(f"{API}/kapans/{self.ids['kapan']}", timeout=30).json()["report"]
        assert rep["in_process_weight"] == 250.50
        assert rep["in_process_pcs"] == 10
        assert rep["status"] == "In Process"
        assert rep["current_stage"] == "laser"

    def test_unknown_process_rejected(self, admin):
        r = admin.post(f"{API}/entries", json={"kapan_id": self.ids["kapan"], "process": "bogus",
                                              "date": "2026-07-01", "pcs": 1, "weight": 1}, timeout=30)
        assert r.status_code == 400

    def test_jangad_payload(self, admin):
        r = admin.get(f"{API}/entries/{self.ids['laser']}/jangad", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["jangad_no"] == self.ids["laser_jangad"]
        assert d["kapan_no"] == self.ids["kapan_no"]
        assert d["process_label"] == "Laser Sawing"
        assert d["weight"] == 250.50

    def test_receive_laser_calcs(self, admin):
        d = self._receive(admin, self.ids["laser"], {
            "return_date": "2026-07-02", "return_pcs": 18, "return_weight": 200.00,
            "return_boil": 5.00, "rc": 10.00, "ls_opening": "LS1"})
        # loss = 250.50 - (200 + 5 + 10) = 35.50
        assert d["returned"] is True
        assert d["loss"] == 35.50
        assert d["loss_pct"] == round(35.50 / 250.50 * 100, 2)
        assert d["return_pct"] == round(200.0 / 250.50 * 100, 2)
        assert d["weight_gain"] == 0.0
        assert d["ls_opening"] == "LS1"

        rep = admin.get(f"{API}/kapans/{self.ids['kapan']}", timeout=30).json()["report"]
        assert rep["rc"] == 10.00
        assert rep["boil"] == 5.00
        assert rep["laser_loss"] == 35.50
        assert rep["in_process_weight"] == 0.0

    def test_shape_chain(self, admin):
        e = self._issue(admin, "shape", 18, 200.00)
        d = self._receive(admin, e["id"], {"return_date": "2026-07-03", "return_pcs": 18,
                                           "return_weight": 180.00, "return_boil": 2.00,
                                           "nail_rc": 3.00})
        assert d["loss"] == 15.00
        rep = admin.get(f"{API}/kapans/{self.ids['kapan']}", timeout=30).json()["report"]
        assert rep["shape_ghat_loss"] == 15.00
        assert rep["nail_rc"] == 3.00

    def test_polish_table_nats_filling(self, admin):
        e = self._issue(admin, "polish", 18, 180.00, {"ds": "Double"})
        d = self._receive(admin, e["id"], {"return_date": "2026-07-04", "return_pcs": 18,
                                           "return_weight": 170.00})
        assert d["loss"] == 10.00

        e2 = self._issue(admin, "table_polish", 18, 170.00)
        d2 = self._receive(admin, e2["id"], {"return_date": "2026-07-05", "return_pcs": 18,
                                             "return_weight": 165.00})
        assert d2["loss"] == 5.00

        e3 = self._issue(admin, "nats", 18, 165.00)
        d3 = self._receive(admin, e3["id"], {"return_date": "2026-07-06", "return_pcs": 18,
                                             "return_weight": 163.00})
        assert d3["loss"] == 2.00

        e4 = self._issue(admin, "filling", 18, 163.00)
        d4 = self._receive(admin, e4["id"], {"return_date": "2026-07-07", "return_pcs": 18,
                                             "return_weight": 165.00})
        assert d4["weight_gain"] == 2.00
        assert d4["loss"] == 0.0

        rep = admin.get(f"{API}/kapans/{self.ids['kapan']}", timeout=30).json()["report"]
        assert rep["polish_loss"] == 15.00, rep
        assert rep["nats_loss"] == 2.00
        assert rep["filling_gain"] == 2.00
        assert rep["polish_weight"] == 170.00, rep
        assert rep["in_process_weight"] == 0.0
        assert rep["open_count"] == 0
        # accounted = rc10+nail3+boil7+laser35.5+shape15+polish15+nats2+polish_weight170-gain2
        assert rep["accounted_weight"] == 255.50
        assert rep["difference"] == round(250.50 - 255.50, 2)

    def test_entries_filters(self, admin):
        allr = admin.get(f"{API}/entries", timeout=30)
        assert allr.status_code == 200
        mine = [e for e in allr.json() if e["kapan_no"] == self.ids["kapan_no"]]
        assert len(mine) == 6
        assert all("kapan_no" in e and "_id" not in e for e in mine)

        openr = admin.get(f"{API}/entries?status=open", timeout=30).json()
        assert all(e["returned"] is False for e in openr)
        closed = admin.get(f"{API}/entries?status=closed&process=laser", timeout=30).json()
        assert all(e["returned"] and e["process"] == "laser" for e in closed)

    def test_kapan_list_includes_report(self, admin):
        r = admin.get(f"{API}/kapans", timeout=30)
        assert r.status_code == 200
        row = next(k for k in r.json() if k["kapan_no"] == self.ids["kapan_no"])
        assert row["report"]["polish_weight"] == 170.00

    def test_entry_404_and_bad_id(self, admin):
        assert admin.post(f"{API}/entries/{'0' * 24}/receive", json={}, timeout=30).status_code == 404
        assert admin.get(f"{API}/entries/xyz/jangad", timeout=30).status_code == 400

    def test_zz_delete_kapan_cascades(self, admin):
        kid = self.ids["kapan"]
        r = admin.delete(f"{API}/kapans/{kid}", timeout=30)
        assert r.status_code == 200
        assert admin.get(f"{API}/kapans/{kid}", timeout=30).status_code == 404
        left = [e for e in admin.get(f"{API}/entries", timeout=30).json()
                if e.get("kapan_no") == self.ids["kapan_no"]]
        assert left == [], f"entries orphaned after kapan delete: {len(left)}"


# ---------------------------------------------------------------- permissions
class TestPermissions:
    state = {}

    def test_create_staff(self, admin):
        email = f"qa_{uuid.uuid4().hex[:6]}@polki.com"
        r = admin.post(f"{API}/users", json={
            "name": "TEST_QA", "email": email, "password": "test1234", "role": "staff",
            "permissions": {"can_create": True, "can_edit": False, "can_delete": False,
                            "can_manage_karigar": False, "can_manage_staff": False}}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["email"] == email and "password_hash" not in d
        assert d["permissions"]["can_delete"] is False
        self.state["id"] = d["id"]
        self.state["email"] = email

    def test_duplicate_email(self, admin):
        r = admin.post(f"{API}/users", json={"name": "x", "email": self.state["email"],
                                             "password": "test1234"}, timeout=30)
        assert r.status_code == 400

    def test_staff_permissions_enforced(self, admin):
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"email": self.state["email"],
                                               "password": "test1234"}, timeout=30)
        assert lr.status_code == 200, lr.text[:300]
        s.headers.update({"Authorization": f"Bearer {lr.json()['token']}"})

        # can create kapan
        kno = f"S{uuid.uuid4().hex[:6]}"
        ck = s.post(f"{API}/kapans", json={"date": "2026-07-01", "kapan_no": kno,
                                           "pcs": 5, "weight": 50.0}, timeout=30)
        assert ck.status_code == 200, ck.text[:300]
        kid = ck.json()["id"]

        # can issue packet
        ce = s.post(f"{API}/entries", json={"kapan_id": kid, "process": "sarine",
                                            "date": "2026-07-01", "pcs": 5, "weight": 50.0}, timeout=30)
        assert ce.status_code == 200, ce.text[:300]
        eid = ce.json()["id"]

        # cannot delete
        assert s.delete(f"{API}/kapans/{kid}", timeout=30).status_code == 403
        assert s.delete(f"{API}/entries/{eid}", timeout=30).status_code == 403
        # cannot edit
        assert s.put(f"{API}/kapans/{kid}", json={"date": "2026-07-01", "kapan_no": kno,
                                                  "pcs": 5, "weight": 51.0}, timeout=30).status_code == 403
        # cannot manage staff / karigar
        assert s.get(f"{API}/users", timeout=30).status_code == 403
        assert s.post(f"{API}/karigars", json={"name": "nope"}, timeout=30).status_code == 403

        admin.delete(f"{API}/kapans/{kid}", timeout=30)

    def test_deactivate_blocks_login(self, admin):
        r = admin.put(f"{API}/users/{self.state['id']}", json={"active": False}, timeout=30)
        assert r.status_code == 200 and r.json()["active"] is False
        lr = requests.post(f"{API}/auth/login", json={"email": self.state["email"],
                                                      "password": "test1234"}, timeout=30)
        assert lr.status_code == 403, lr.status_code
        assert "disabled" in lr.json().get("detail", "").lower()

    def test_zz_delete_staff(self, admin):
        assert admin.delete(f"{API}/users/{self.state['id']}", timeout=30).status_code == 200
        assert admin.delete(f"{API}/users/{self.state['id']}", timeout=30).status_code == 404
