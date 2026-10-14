"""Replay-based Repair Balance, modelled on the live Stone 3 (SP 516.06) that showed
UNACCOUNTED -53.44: packets were cut from several source packets at once, so weight could be
counted twice. Repair now replays the whole stone from its own history.
"""
import random
import pytest
from backend_test import API, TIMEOUT, login, receive


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _sp(sess, weight=120.0):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-09-22", "kapan_no": kno, "type": "TEST_REPLAY",
        "pcs": 1, "weight": weight, "mode": "sp", "notes": "TEST_REPLAY"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _stone(sess, kid, w):
    sess.post(f"{API}/kapans/{kid}/sp-stones",
              json={"date": "2026-09-22", "rows": [{"weight": w}]}, timeout=TIMEOUT)
    return sess.get(f"{API}/kapans/{kid}/sp-report", timeout=TIMEOUT).json()["stones"][0]["id"]


def _bulk(sess, kid, process, rows):
    return sess.post(f"{API}/kapans/{kid}/process-packets",
                     json={"process": process, "date": "2026-09-22", "rows": rows}, timeout=TIMEOUT)


def _run(sess, kid, process, rows, **ret):
    """create -> issue -> receive, returns the created packets."""
    created = _bulk(sess, kid, process, rows).json()["created"]
    es = sess.post(f"{API}/jangads", json={
        "process": process, "date": "2026-09-22",
        "packet_ids": [c["id"] for c in created], "karigar_name": "SYNOVA"}, timeout=TIMEOUT).json()["entries"]
    for c, e in zip(created, es):
        boil = ret["boil"][c["packet_no"]]
        r = receive(sess, e["id"], return_pcs=1, return_weight=boil, return_boil=boil,
                    rc=0.0, nail_rc=0.0, palchu=ret.get("palchu", {}).get(c["packet_no"], 0.0))
        assert r.status_code == 200, r.text
    return created


def _k(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()


class TestReplayRepair:
    def test_live_stone3_shape_balances_after_repair(self, admin):
        k = _sp(admin, weight=101.06)
        try:
            sid = _stone(admin, k["id"], 50.53)
            # 3.1 laser 50.53 -> 50.40
            p1 = _run(admin, sid, "laser", [{"pcs": 1, "weight": 50.53}], boil={"1.1": 50.40})
            # split into 43.53 + 6.87, both laser, back as 42.99 + 6.78
            _run(admin, sid, "laser", [{"pcs": 1, "weight": 43.53}, {"pcs": 1, "weight": 6.87}],
                 boil={"1.2": 42.99, "1.3": 6.78})
            # sarine 40.70 + 4.69, no loss
            _run(admin, sid, "sarine", [{"pcs": 1, "weight": 40.70}, {"pcs": 1, "weight": 4.69}],
                 boil={"1.4": 40.70, "1.5": 4.69})
            # laser 40.70 returning 37.59 of which 34.43 is Palchu, + 4.69 -> 4.33
            _run(admin, sid, "laser", [{"pcs": 1, "weight": 40.70}, {"pcs": 1, "weight": 4.69}],
                 boil={"1.6": 37.59, "1.7": 4.33}, palchu={"1.6": 34.43})
            assert p1

            rep = _k(admin, sid)["report"]
            assert rep["balanced"] is True, rep

            # whatever state it is in, a repair must leave it balanced and never invent weight
            r = admin.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            after = r.json()["report"]
            assert after["balanced"] is True, after
            assert after["palchu_available"] == 34.43
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_repair_is_idempotent_and_reports_shortfalls(self, admin):
        k = _sp(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            _run(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}], boil={"1.1": 30.0})
            child = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]

            # corrupt it the way the old build did: the parent keeps its full weight too
            from dotenv import dotenv_values
            from bson import ObjectId
            import pymongo
            cfg = dotenv_values("/app/backend/.env")
            mdb = pymongo.MongoClient(cfg["MONGO_URL"])[cfg["DB_NAME"]]
            mdb.packets.update_one({"_id": ObjectId(child["id"])}, {"$set": {"split_from": None}})
            mdb.packets.update_many({"kapan_id": ObjectId(sid), "packet_no": "1.1"},
                                    {"$set": {"weight": 30.0, "status": "in_stock"}})
            assert abs(_k(admin, sid)["report"]["stock_drift"]) > 0.02

            first = admin.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT).json()
            assert first["report"]["balanced"] is True, first["report"]
            assert abs(first["report"]["stock_drift"]) <= 0.02, first["report"]
            second = admin.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT).json()
            assert second["fixed"] == []
            assert second["report"]["balanced"] is True
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
