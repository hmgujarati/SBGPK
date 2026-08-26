"""Polki Manufacturing Tracker - backend API regression tests (packet-first model, iteration 2)."""
import os
import re
import random
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
TIMEOUT = 45


def creds(section="Admin"):
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing /app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8")
    block = content.split(f"## {section}")[1]
    email = re.search(r"(?im)^\s*[-*]\s*email\s*:\s*`?([^`\s]+)", block).group(1)
    password = re.search(r"(?im)^\s*[-*]\s*password\s*:\s*`?([^`\s]+)", block).group(1)
    return {"email": email, "password": password}


def login(section="Admin"):
    s = requests.Session()
    c = creds(section)
    r = s.post(f"{API}/auth/login", json=c, timeout=TIMEOUT)
    if r.status_code != 200:
        pytest.fail(f"{section} login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token, "no token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


@pytest.fixture(scope="module")
def staff():
    return login("Staff")


def new_kapan(sess, weight=300.0, pcs=20):
    kno = f"TEST{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_ROUGH",
        "pcs": pcs, "weight": weight, "notes": "TEST_"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def mk_packet(sess, kapan_id, pcs, weight, date="2026-07-01"):
    return sess.post(f"{API}/kapans/{kapan_id}/packets",
                     json={"date": date, "pcs": pcs, "weight": weight}, timeout=TIMEOUT)


def issue(sess, packet_id, process, karigar_name="TEST_K", **kw):
    body = {"packet_id": packet_id, "process": process, "date": "2026-07-02",
            "karigar_name": karigar_name}
    body.update(kw)
    return sess.post(f"{API}/entries", json=body, timeout=TIMEOUT)


def receive(sess, entry_id, **kw):
    body = {"return_date": "2026-07-03"}
    body.update(kw)
    return sess.post(f"{API}/entries/{entry_id}/receive", json=body, timeout=TIMEOUT)


def report(sess, kapan_id):
    r = sess.get(f"{API}/kapans/{kapan_id}", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- auth
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_and_me(self, admin):
        r = admin.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == creds("Admin")["email"]
        assert d["role"] == "admin"
        assert "_id" not in d and "password_hash" not in d

    def test_login_sets_httponly_cookies(self):
        r = requests.post(f"{API}/auth/login", json=creds("Admin"), timeout=TIMEOUT)
        assert r.status_code == 200
        raw = r.headers.get("set-cookie", "").lower()
        assert "access_token" in raw, f"no access_token cookie: {raw}"
        assert "httponly" in raw, f"cookie not httponly: {raw}"

    def test_login_invalid_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": f"nobody_{uuid.uuid4().hex[:6]}@x.com", "password": "bad"},
                          timeout=TIMEOUT)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{API}/kapans", timeout=TIMEOUT)
        assert r.status_code in (401, 403)

    def test_bcrypt_hash_format(self):
        import subprocess
        out = subprocess.run(
            ["python", "-c",
             "import os,asyncio;from motor.motor_asyncio import AsyncIOMotorClient;"
             "c=AsyncIOMotorClient(os.environ['MONGO_URL']);"
             "print(asyncio.get_event_loop().run_until_complete("
             "c[os.environ['DB_NAME']].users.find_one({'email':os.environ['ADMIN_EMAIL'].lower()}))['password_hash'])"],
            capture_output=True, text=True, cwd="/app/backend",
            env={**os.environ, **dotenv_values("/app/backend/.env")})
        assert "$2b$" in out.stdout, f"hash not bcrypt $2b$: {out.stdout[-200:]} {out.stderr[-300:]}"


# ---------------------------------------------------------------- packets
class TestPackets:
    @pytest.fixture(scope="class")
    def kapan(self, admin):
        k = new_kapan(admin, 300.0, 20)
        yield k
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_packet_auto_numbering_and_size(self, admin, kapan):
        r1 = mk_packet(admin, kapan["id"], 5, 50.0)
        assert r1.status_code == 200, r1.text
        p1 = r1.json()
        assert p1["packet_no"] == f"{kapan['kapan_no']}-01"
        assert p1["size"] == 10.0
        assert p1["status"] == "in_stock"
        assert p1["original_weight"] == 50.0
        r2 = mk_packet(admin, kapan["id"], 4, 40.0)
        assert r2.status_code == 200, r2.text
        assert r2.json()["packet_no"] == f"{kapan['kapan_no']}-02"

        # persistence check
        d = report(admin, kapan["id"])
        nos = [p["packet_no"] for p in d["packets"]]
        assert nos == [f"{kapan['kapan_no']}-01", f"{kapan['kapan_no']}-02"]
        assert d["report"]["unpacketed_weight"] == 210.0

    def test_over_packeting_rejected(self, admin, kapan):
        r = mk_packet(admin, kapan["id"], 10, 500.0)
        assert r.status_code == 400, r.text
        assert "remaining" in r.json()["detail"].lower()

    def test_zero_weight_rejected(self, admin, kapan):
        r = mk_packet(admin, kapan["id"], 1, 0)
        assert r.status_code == 400

    def test_packets_in_stock_filter(self, admin, kapan):
        r = admin.get(f"{API}/packets", params={"status": "in_stock"}, timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert all(p["status"] == "in_stock" for p in data)
        assert all("_id" not in p for p in data)
        assert any(p["kapan_no"] == kapan["kapan_no"] for p in data)

    def test_delete_packet_with_entries_rejected(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 2, 20.0).json()
        e = issue(admin, p["id"], "sarine")
        assert e.status_code == 200, e.text
        d = admin.delete(f"{API}/packets/{p['id']}", timeout=TIMEOUT)
        assert d.status_code == 400
        assert "entries" in d.json()["detail"].lower()
        # cleanup: delete entry then packet
        admin.delete(f"{API}/entries/{e.json()['id']}", timeout=TIMEOUT)
        d2 = admin.delete(f"{API}/packets/{p['id']}", timeout=TIMEOUT)
        assert d2.status_code == 200


# ---------------------------------------------------------------- issue / receive rules
class TestIssueReceive:
    @pytest.fixture(scope="class")
    def kapan(self, admin):
        k = new_kapan(admin, 200.0, 10)
        yield k
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_issue_copies_packet_pcs_weight_and_strips_fields(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 4, 40.0).json()
        r = issue(admin, p["id"], "sarine", hw="5x5", ds="D", expected_return_pcs=9)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["pcs"] == 4 and e["weight"] == 40.0 and e["size"] == 10.0
        assert e["hw"] == "" and e["ds"] == "" and e["expected_return_pcs"] == 0
        assert e["jangad_no"].startswith("JG-")
        assert e["returned"] is False
        # packet now issued
        d = report(admin, kapan["id"])
        pk = [x for x in d["packets"] if x["id"] == p["id"]][0]
        assert pk["status"] == "issued"
        assert d["report"]["in_process_weight"] == 40.0
        assert d["report"]["difference"] == 0.0

        # double issue rejected
        r2 = issue(admin, p["id"], "marking")
        assert r2.status_code == 400
        assert "already issued" in r2.json()["detail"].lower()

        # receive
        rec = receive(admin, e["id"], return_pcs=4, return_weight=38.5, rc=1.0, return_boil=0.5)
        assert rec.status_code == 200, rec.text
        rd = rec.json()
        assert rd["loss"] == 0.0
        d2 = report(admin, kapan["id"])
        pk = [x for x in d2["packets"] if x["id"] == p["id"]][0]
        assert pk["weight"] == 38.5 and pk["pcs"] == 4 and pk["last_process"] == "sarine"
        assert pk["status"] == "in_stock"
        assert d2["report"]["difference"] == 0.0
        assert d2["report"]["rc"] == 1.0 and d2["report"]["boil"] == 0.5

    def test_sarine_marking_loss_breaks_reconciliation(self, admin):
        """BUG PROBE: loss on sarine/marking is computed on the entry but has no bucket in
        build_report(), so the kapan reconciliation goes out of balance."""
        k = new_kapan(admin, 50.0, 2)
        try:
            p = mk_packet(admin, k["id"], 2, 50.0).json()
            e = issue(admin, p["id"], "sarine").json()
            rec = receive(admin, e["id"], return_pcs=2, return_weight=49.0)
            assert rec.status_code == 200, rec.text
            assert rec.json()["loss"] == 1.0
            rep = report(admin, k["id"])["report"]
            assert rep["difference"] == 0.0, (
                f"sarine loss 1.00 unaccounted -> difference {rep['difference']}")
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_laser_keeps_hw_and_polish_keeps_ds(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 2, 20.0).json()
        e = issue(admin, p["id"], "laser", hw="3x4", ds="D", expected_return_pcs=3).json()
        assert e["hw"] == "3x4" and e["expected_return_pcs"] == 3 and e["ds"] == ""
        receive(admin, e["id"], return_pcs=3, return_weight=18.0)
        e2 = issue(admin, p["id"], "polish", hw="9x9", ds="Double").json()
        assert e2["ds"] == "Double" and e2["hw"] == ""
        receive(admin, e2["id"], return_pcs=3, return_weight=16.0)

    def test_receive_over_issued_weight_rejected(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 2, 20.0).json()
        e = issue(admin, p["id"], "laser").json()
        r = receive(admin, e["id"], return_pcs=2, return_weight=19.0, return_boil=1.0, rc=1.0)
        assert r.status_code == 400, r.text
        assert "cannot exceed" in r.json()["detail"].lower()
        # zero return weight rejected
        r0 = receive(admin, e["id"], return_pcs=2, return_weight=0)
        assert r0.status_code == 400
        ok = receive(admin, e["id"], return_pcs=2, return_weight=18.0, rc=1.0)
        assert ok.status_code == 200, ok.text
        # double receive rejected
        again = receive(admin, e["id"], return_pcs=2, return_weight=17.0)
        assert again.status_code == 400
        assert "already been received" in again.json()["detail"].lower()

    def test_filling_requires_weight_gain(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 2, 20.0).json()
        e = issue(admin, p["id"], "filling").json()
        bad = receive(admin, e["id"], return_pcs=2, return_weight=19.0)
        assert bad.status_code == 400, bad.text
        assert "cannot be less" in bad.json()["detail"].lower()
        good = receive(admin, e["id"], return_pcs=2, return_weight=22.5)
        assert good.status_code == 200, good.text
        g = good.json()
        assert g["weight_gain"] == 2.5 and g["loss"] == 0.0
        rep = report(admin, kapan["id"])["report"]
        assert rep["filling_gain"] == 2.5
        assert rep["difference"] == 0.0

    def test_issue_unknown_process_and_bad_packet(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 1, 5.0).json()
        r = issue(admin, p["id"], "nonsense")
        assert r.status_code == 400
        r2 = issue(admin, "507f1f77bcf86cd799439011", "sarine")
        assert r2.status_code == 404
        r3 = issue(admin, "not-an-id", "sarine")
        assert r3.status_code == 400


# ---------------------------------------------------------------- full chain reconciliation
class TestFullChain:
    @pytest.fixture(scope="class")
    def kapan(self, admin):
        k = new_kapan(admin, 100.0, 5)
        yield k
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_chain_stays_balanced(self, admin, kapan):
        p = mk_packet(admin, kapan["id"], 5, 100.0).json()
        assert report(admin, kapan["id"])["report"]["unpacketed_weight"] == 0.0
        chain = [("sarine", 100.0), ("laser", 90.0), ("shape", 85.0),
                 ("polish", 80.0), ("table_polish", 78.0), ("nats", 76.0)]
        for proc, rw in chain:
            e = issue(admin, p["id"], proc, hw="4x4" if proc == "laser" else "",
                      ds="Double" if proc == "polish" else "")
            assert e.status_code == 200, f"{proc}: {e.text}"
            rep = report(admin, kapan["id"])["report"]
            assert rep["difference"] == 0.0, f"unbalanced while {proc} out: {rep}"
            rec = receive(admin, e.json()["id"], return_pcs=5, return_weight=rw,
                          rc=0.5 if proc != "sarine" else 0)
            assert rec.status_code == 200, f"{proc} receive: {rec.text}"
            rep = report(admin, kapan["id"])["report"]
            assert rep["difference"] == 0.0, f"unbalanced after {proc}: {rep}"

        rep = report(admin, kapan["id"])["report"]
        assert rep["polish_weight"] == 76.0, f"polish_weight wrong: {rep}"
        assert rep["stock_weight"] == 0.0

        # filling last
        e = issue(admin, p["id"], "filling").json()
        rec = receive(admin, e["id"], return_pcs=5, return_weight=80.0)
        assert rec.status_code == 200, rec.text
        rep = report(admin, kapan["id"])["report"]
        assert rep["filling_gain"] == 4.0
        assert rep["difference"] == 0.0, f"unbalanced after filling: {rep}"
        assert rep["entries_count"] == 7

    def test_jangad_payload(self, admin, kapan):
        entries = report(admin, kapan["id"])["entries"]
        eid = entries[0]["id"]
        r = admin.get(f"{API}/entries/{eid}/jangad", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        j = r.json()
        for f in ("jangad_no", "kapan_no", "packet_no", "process_label", "pcs", "weight", "size"):
            assert f in j and j[f] not in (None, ""), f"jangad missing {f}: {j}"

    def test_delete_out_of_order_and_restore(self, admin, kapan):
        entries = report(admin, kapan["id"])["entries"]
        assert len(entries) >= 2
        old = admin.delete(f"{API}/entries/{entries[0]['id']}", timeout=TIMEOUT)
        assert old.status_code == 400, old.text
        assert "newer entries" in old.json()["detail"].lower()

        last = entries[-1]
        d = admin.delete(f"{API}/entries/{last['id']}", timeout=TIMEOUT)
        assert d.status_code == 200, d.text
        pk = [x for x in report(admin, kapan["id"])["packets"] if x["id"] == last["packet_id"]][0]
        assert pk["weight"] == last["weight"], f"packet not restored: {pk}"
        assert pk["pcs"] == last["pcs"]
        assert pk["last_process"] == last.get("prev_process")
        assert report(admin, kapan["id"])["report"]["difference"] == 0.0


# ---------------------------------------------------------------- karigars / dashboard / RBAC
class TestMisc:
    def test_dashboard_shape(self, admin):
        r = admin.get(f"{API}/dashboard", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("kapan_count", "total_weight", "in_process_weight", "total_loss",
                  "open_jangads", "packet_count", "stock_packets", "karigar_count", "by_process"):
            assert k in d, f"dashboard missing {k}"
        assert len(d["by_process"]) == 9

    def test_processes_meta(self, admin):
        r = admin.get(f"{API}/meta/processes", timeout=TIMEOUT)
        assert r.status_code == 200
        labels = {x["key"]: x["label"] for x in r.json()}
        assert labels["laser"] == "Laser Sawing" and labels["table_polish"] == "Table Polish"

    def test_karigar_process_filter(self, admin):
        name = f"TEST_Kari_{uuid.uuid4().hex[:5]}"
        r = admin.post(f"{API}/karigars", json={"name": name, "phone": "9999",
                                                "processes": ["laser"], "active": True}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        kid = r.json()["id"]
        laser = admin.get(f"{API}/karigars", params={"process": "laser"}, timeout=TIMEOUT).json()
        assert any(k["id"] == kid for k in laser)
        polish = admin.get(f"{API}/karigars", params={"process": "polish"}, timeout=TIMEOUT).json()
        assert not any(k["id"] == kid for k in polish)
        assert admin.delete(f"{API}/karigars/{kid}", timeout=TIMEOUT).status_code == 200

    def test_staff_rbac(self, admin, staff):
        me = staff.get(f"{API}/auth/me", timeout=TIMEOUT).json()
        perms = me["permissions"]
        assert perms["can_create"] and perms["can_edit"]
        assert not perms["can_delete"] and not perms["can_manage_staff"]
        assert staff.get(f"{API}/users", timeout=TIMEOUT).status_code == 403

        k = new_kapan(staff, 10.0, 1)
        p = mk_packet(staff, k["id"], 1, 10.0)
        assert p.status_code == 200, p.text
        assert staff.delete(f"{API}/packets/{p.json()['id']}", timeout=TIMEOUT).status_code == 403
        assert staff.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT).status_code == 403
        assert admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT).status_code == 200

    def test_duplicate_kapan_no_rejected(self, admin):
        k = new_kapan(admin, 5.0, 1)
        r = admin.post(f"{API}/kapans", json={"date": "2026-07-01", "kapan_no": k["kapan_no"],
                                              "pcs": 1, "weight": 5.0}, timeout=TIMEOUT)
        assert r.status_code == 400
        assert "already exists" in r.json()["detail"].lower()
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
