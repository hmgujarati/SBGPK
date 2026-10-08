"""Palchu: recovered on receive (Net Fwd = Boil − RC − Nail RC − Palchu) and the ONLY
source of weight for Shape Cutting, Ghat, Polish and Table Polish packets.
"""
import random
import pytest
from backend_test import API, TIMEOUT, login, receive


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _sp_kapan(sess, weight=100.0):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_PALCHU",
        "pcs": 1, "weight": weight, "mode": "sp", "notes": "TEST_PALCHU"}, timeout=TIMEOUT)
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
        "packet_ids": ids, "karigar_name": "TEST_PALCHU_K"}, timeout=TIMEOUT)


def _rep(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()["report"]


class TestPalchuOnReceive:
    def test_palchu_comes_off_the_boil_and_pools(self, admin):
        k = _sp_kapan(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            p = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            e = _issue(admin, "laser", [p["id"]]).json()["entries"][0]
            r = receive(admin, e["id"], return_pcs=1, return_weight=28.0, return_boil=28.0,
                        rc=1.0, nail_rc=0.5, palchu=6.5)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["palchu"] == 6.5
            assert d["net_weight"] == 20.0        # 28 − 1 − 0.5 − 6.5
            assert d["loss"] == 2.0

            rep = _rep(admin, sid)
            assert rep["palchu"] == 6.5
            assert rep["palchu_available"] == 6.5
            assert rep["stock_weight"] == 20.0
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_allocations_cannot_exceed_boil(self, admin):
        k = _sp_kapan(admin, weight=40.0)
        try:
            sid = _stone(admin, k["id"], 20.0)
            p = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 20.0}]).json()["created"][0]
            e = _issue(admin, "laser", [p["id"]]).json()["entries"][0]
            r = receive(admin, e["id"], return_pcs=1, return_weight=19.0, return_boil=19.0,
                        rc=1.0, nail_rc=1.0, palchu=18.0)
            assert r.status_code == 400, r.text
            assert "Palchu" in r.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestPalchuFeedsFinishingStages:
    def test_shape_ghat_polish_draw_only_from_palchu(self, admin):
        k = _sp_kapan(admin, weight=80.0)
        try:
            sid = _stone(admin, k["id"], 40.0)
            p = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 40.0}]).json()["created"][0]
            e = _issue(admin, "laser", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=40.0, return_boil=40.0,
                    rc=0.0, nail_rc=0.0, palchu=25.0)

            rep = _rep(admin, sid)
            assert rep["palchu_available"] == 25.0 and rep["stock_weight"] == 15.0

            # more than the Palchu pool is refused even though 15 sits in pre-polish stock
            bad = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 30.0}])
            assert bad.status_code == 400, bad.text
            assert "Palchu available" in bad.json()["detail"]

            # within the pool it works, and the pool shrinks
            ok = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 10.0}])
            assert ok.status_code == 200, ok.text
            new = ok.json()["created"][0]
            assert new["palchu_weight"] == 10.0
            assert new["original_weight"] == 0.0 and new["carried_weight"] == 0.0

            rep2 = _rep(admin, sid)
            assert rep2["palchu_available"] == 15.0
            assert rep2["stock_weight"] == 15.0      # pre-polish stock untouched
            assert rep2["allocated_weight"] == 10.0
            assert rep2["balanced"] is True, rep2

            # ghat / polish / table polish share the same pool
            for proc, w in (("ghat", 5.0), ("polish", 5.0), ("table_polish", 5.0)):
                r = _bulk(admin, sid, proc, [{"pcs": 1, "weight": w}])
                assert r.status_code == 200, (proc, r.text)
            rep3 = _rep(admin, sid)
            assert rep3["palchu_available"] == 0.0
            assert rep3["balanced"] is True, rep3

            # pool empty — nothing more can be created
            empty = _bulk(admin, sid, "polish", [{"pcs": 1, "weight": 0.5}])
            assert empty.status_code == 400
            assert "0.00 cts Palchu available" in empty.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_deleting_a_palchu_packet_returns_it_to_the_pool(self, admin):
        k = _sp_kapan(admin, weight=40.0)
        try:
            sid = _stone(admin, k["id"], 20.0)
            p = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 20.0}]).json()["created"][0]
            e = _issue(admin, "laser", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=20.0, return_boil=20.0,
                    rc=0.0, nail_rc=0.0, palchu=12.0)

            pk = _bulk(admin, sid, "polish", [{"pcs": 1, "weight": 12.0}]).json()["created"][0]
            assert _rep(admin, sid)["palchu_available"] == 0.0

            rd = admin.delete(f"{API}/packets/{pk['id']}", timeout=TIMEOUT)
            assert rd.status_code == 200, rd.text
            rep = _rep(admin, sid)
            assert rep["palchu_available"] == 12.0
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
