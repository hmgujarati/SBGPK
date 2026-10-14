"""Admin must be able to edit the issue weight of a packet that was NOT cut from rough —
split-from-stock packets and Palchu packets have original_weight 0, so the old ceiling
(original_weight only) blocked every edit with "created weight 0.00 cts".
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
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_EDIT_SPLIT",
        "pcs": 1, "weight": weight, "mode": "sp", "notes": "TEST_EDIT_SPLIT"}, timeout=TIMEOUT)
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
        "packet_ids": ids, "karigar_name": "TEST_EDIT_K"}, timeout=TIMEOUT)


def _rep(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()["report"]


class TestEditIssueWeightOnDerivedPackets:
    def test_split_from_stock_packet_can_be_edited(self, admin):
        k = _sp(admin, weight=60.0)
        try:
            sid = _stone(admin, k["id"], 30.0)
            src = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            e0 = _issue(admin, "marking", [src["id"]]).json()["entries"][0]
            receive(admin, e0["id"], return_pcs=1, return_weight=30.0, return_boil=30.0,
                    rc=0.0, nail_rc=0.0)

            split = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 10.0}]).json()["created"][0]
            assert split["original_weight"] == 0.0 and split["carried_weight"] == 10.0
            e = _issue(admin, "laser", [split["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=9.5, return_boil=9.5,
                    rc=0.0, nail_rc=0.0)

            # editing the issue weight used to fail with "created weight 0.00 cts"
            r = admin.put(f"{API}/entries/{e['id']}", json={"weight": 9.8}, timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            assert r.json()["loss"] == 0.3

            # over the created weight is still refused (the 0.2 correction went back to the parent)
            bad = admin.put(f"{API}/entries/{e['id']}", json={"weight": 12.0}, timeout=TIMEOUT)
            assert bad.status_code == 400
            assert "9.80" in bad.json()["detail"]

            assert _rep(admin, sid)["balanced"] is True
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_palchu_packet_can_be_edited(self, admin):
        k = _sp(admin, weight=40.0)
        try:
            sid = _stone(admin, k["id"], 20.0)
            p = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 20.0}]).json()["created"][0]
            e0 = _issue(admin, "laser", [p["id"]]).json()["entries"][0]
            receive(admin, e0["id"], return_pcs=1, return_weight=20.0, return_boil=20.0,
                    rc=0.0, nail_rc=0.0, palchu=8.0)

            pol = _bulk(admin, sid, "polish", [{"pcs": 1, "weight": 8.0}]).json()["created"][0]
            assert pol["palchu_weight"] == 8.0 and pol["original_weight"] == 0.0
            e = _issue(admin, "polish", [pol["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=7.5, return_boil=7.5,
                    rc=0.0, nail_rc=0.0)

            r = admin.put(f"{API}/entries/{e['id']}", json={"weight": 7.8}, timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            rep = _rep(admin, sid)
            assert rep["palchu_available"] == 0.2      # the 0.2 correction goes back to the pool
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
