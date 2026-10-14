"""Editing an entry of a packet that has since been cut into child packets must NOT hand the
cut-out weight back to the parent (that showed up live as UNACCOUNTED -26.08 ct).
"""
import random
import pytest
from backend_test import API, TIMEOUT, login, receive


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _sp(sess, weight=60.0):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_EDIT_SPLIT2",
        "pcs": 1, "weight": weight, "mode": "sp", "notes": "TEST_EDIT_SPLIT2"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _stone(sess, kid, w):
    sess.post(f"{API}/kapans/{kid}/sp-stones",
              json={"date": "2026-07-02", "rows": [{"weight": w}]}, timeout=TIMEOUT)
    return sess.get(f"{API}/kapans/{kid}/sp-report", timeout=TIMEOUT).json()["stones"][0]["id"]


def _bulk(sess, kid, process, rows):
    return sess.post(f"{API}/kapans/{kid}/process-packets",
                     json={"process": process, "date": "2026-07-03", "rows": rows}, timeout=TIMEOUT)


def _issue(sess, process, ids):
    return sess.post(f"{API}/jangads", json={
        "process": process, "date": "2026-07-04",
        "packet_ids": ids, "karigar_name": "TEST_EDIT_K2"}, timeout=TIMEOUT)


def _k(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()


class TestEditParentAfterSplit:
    def _setup(self, admin, sid):
        p = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
        e = _issue(admin, "marking", [p["id"]]).json()["entries"][0]
        receive(admin, e["id"], return_pcs=1, return_weight=30.0, return_boil=30.0, rc=0.0, nail_rc=0.0)
        # cut 25 of the 30 away into two laser packets, leaving 5 in the parent
        kids = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 20.0}, {"pcs": 1, "weight": 5.0}])
        assert kids.status_code == 200, kids.text
        return e

    def test_editing_a_consumed_parent_keeps_balance(self, admin):
        k = _sp(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            e = self._setup(admin, sid)
            assert _k(admin, sid)["report"]["balanced"] is True

            # cutting the return below what has already been cut away is refused
            bad = admin.put(f"{API}/entries/{e['id']}", json={"return_weight": 20.0, "return_boil": 20.0},
                            timeout=TIMEOUT)
            assert bad.status_code == 400, bad.text
            assert "already been cut" in bad.json()["detail"]

            # a smaller correction is fine and must NOT resurrect the cut-away weight
            r = admin.put(f"{API}/entries/{e['id']}", json={"return_weight": 29.5, "return_boil": 29.5},
                          timeout=TIMEOUT)
            assert r.status_code == 200, r.text

            data = _k(admin, sid)
            parent = [p for p in data["packets"] if p["packet_no"].endswith(".1")]
            assert parent and parent[0]["weight"] == 4.5, parent
            assert data["report"]["balanced"] is True, data["report"]
            assert data["report"]["stock_weight"] == 4.5
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_repair_endpoint_fixes_an_already_broken_kapan(self, admin):
        k = _sp(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            e = self._setup(admin, sid)
            # simulate the old bug: hand the parent's full net weight back to it
            pk = [p for p in _k(admin, sid)["packets"]]
            admin.put(f"{API}/entries/{e['id']}", json={"return_weight": 30.0, "return_boil": 30.0},
                      timeout=TIMEOUT)
            r = admin.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            assert r.json()["report"]["balanced"] is True, r.json()["report"]
            assert len(pk) >= 2
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_repair_caps_a_child_that_carries_more_than_its_parent_had(self, admin):
        """Live shape: a chain of splits each carrying 45.10 out of a parent that only
        returned 45.00 — repair must cap the chain and clear the negative balance."""
        k = _sp(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            p = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            e = _issue(admin, "marking", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=30.0, return_boil=30.0, rc=0.0, nail_rc=0.0)
            child = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]

            # simulate the legacy corruption: the parent's return is later cut to 29.5 while the
            # child keeps carrying the full 30 (today's build refuses this edit)
            import pymongo
            from dotenv import dotenv_values
            from bson import ObjectId
            cfg = dotenv_values("/app/backend/.env")
            cl = pymongo.MongoClient(cfg["MONGO_URL"])
            db = cl[cfg["DB_NAME"]]
            db.entries.update_one({"_id": ObjectId(e["id"])},
                                  {"$set": {"return_weight": 29.5, "return_boil": 29.5,
                                            "net_weight": 29.5, "loss": 0.5}})
            broken = _k(admin, sid)["report"]
            assert broken["balanced"] is False, broken

            r = admin.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            rep = r.json()["report"]
            assert rep["balanced"] is True, rep
            after = [x for x in _k(admin, sid)["packets"] if x["id"] == child["id"]]
            assert after and after[0]["weight"] == 29.5, after
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_repair_requires_admin(self, admin):
        k = _sp(admin, weight=20.0)
        try:
            sid = _stone(admin, k["id"], 10.0)
            staff = login("Staff")
            r = staff.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT)
            assert r.status_code == 403, r.text
            assert "admin" in r.json()["detail"].lower()
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
