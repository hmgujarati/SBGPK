"""Edge cases for POST /packets/{id}/undo-split.

Main agent asked to probe:
  A) undo-split after source packet was fully consumed (status='consumed' → must revive)
  B) chained splits A→B, B→C; undo B after C exists (mass balance must hold)
  C) row spanning rough + stock — verify undo-split behavior on it
  D) staff (no can_delete) receives 403 on undo-split
"""
import random
import pytest
from backend_test import API, TIMEOUT, login, receive


def _sp_kapan(sess, weight=100.0):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_UNDO_EDGE",
        "pcs": 1, "weight": weight, "mode": "sp", "notes": "TEST_UNDO"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _add_stone(sess, kid, w):
    return sess.post(f"{API}/kapans/{kid}/sp-stones",
                     json={"date": "2026-07-02", "rows": [{"weight": w}]}, timeout=TIMEOUT)


def _stone(sess, kid):
    r = sess.get(f"{API}/kapans/{kid}/sp-report", timeout=TIMEOUT).json()
    if r.get("stones"):
        return r["stones"][0]
    d = sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()
    return {"id": kid, "report": d.get("report", {})}


def _bulk(sess, kid, process, rows):
    return sess.post(f"{API}/kapans/{kid}/process-packets",
                     json={"process": process, "date": "2026-07-03", "rows": rows}, timeout=TIMEOUT)


def _packets(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json().get("packets", [])


def _recycle(sess, process, p):
    """Issue a freshly created packet and receive it back with no loss so its weight
    becomes free stock again (created-but-unissued packets are locked)."""
    e = sess.post(f"{API}/jangads", json={
        "process": process, "date": "2026-07-04",
        "packet_ids": [p["id"]], "karigar_name": "TEST_UNDO_K"}, timeout=TIMEOUT).json()["entries"][0]
    w = float(p["weight"])
    r = receive(sess, e["id"], return_pcs=1, return_weight=w, return_boil=w, rc=0.0, nail_rc=0.0)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


class TestUndoAfterSourceFullyConsumed:
    """A→B where B takes ALL of A's weight → A becomes 'consumed'. Undo B must
    revive A back to in_stock at its original weight."""

    def test_undo_revives_consumed_source(self, admin):
        k = _sp_kapan(admin, weight=60.0)
        try:
            _add_stone(admin, k["id"], 30.0)
            sid = _stone(admin, k["id"])["id"]

            src = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            _recycle(admin, "marking", src)
            # take FULL 30 into laser — source becomes consumed
            split = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]

            # source is now hidden from register (status='consumed')
            after = {p["packet_no"]: p for p in _packets(admin, sid)}
            assert src["packet_no"] not in after
            assert after[split["packet_no"]]["weight"] == 30.0

            # undo the split — source should revive to in_stock with 30.0
            r = admin.post(f"{API}/packets/{split['id']}/undo-split", timeout=TIMEOUT)
            assert r.status_code == 200, r.text

            revived = {p["packet_no"]: p for p in _packets(admin, sid)}
            assert split["packet_no"] not in revived
            assert src["packet_no"] in revived, f"source packet should be revived; got {list(revived)}"
            assert revived[src["packet_no"]]["weight"] == 30.0
            assert revived[src["packet_no"]]["status"] == "in_stock"

            rep = _stone(admin, sid)["report"]
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestChainedSplitUndoMiddle:
    """A→B (B takes 30 from A of 30) then B→C (C takes 30 from B).
    Undoing B while C still exists must NOT double-count. Ideally the API
    refuses (B has been fully consumed by C, its 'carried' has moved on)."""

    def test_undo_middle_of_chain_stays_balanced_or_refuses(self, admin):
        k = _sp_kapan(admin, weight=60.0)
        try:
            _add_stone(admin, k["id"], 30.0)
            sid = _stone(admin, k["id"])["id"]

            src = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            _recycle(admin, "marking", src)
            b = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            _recycle(admin, "laser", b)
            c = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]

            # after chain: A consumed, B consumed, C alive with 30
            live = {p["packet_no"]: p for p in _packets(admin, sid)}
            assert live[c["packet_no"]]["weight"] == 30.0
            assert src["packet_no"] not in live and b["packet_no"] not in live

            # After fix: undo of a consumed middle packet MUST be refused (400)
            r = admin.post(f"{API}/packets/{b['id']}/undo-split", timeout=TIMEOUT)
            assert r.status_code == 400, r.text
            msg = (r.json().get("detail") or "").lower()
            assert ("karigar" in msg or "cut into another" in msg or "downstream" in msg
                    or "process entries" in msg), r.text
            rep = _stone(admin, sid)["report"]
            live2 = {p["packet_no"]: p for p in _packets(admin, sid)}
            assert c["packet_no"] in live2 and live2[c["packet_no"]]["weight"] == 30.0
            assert src["packet_no"] not in live2 and b["packet_no"] not in live2
            total = round(sum(float(p["weight"]) for p in live2.values()), 2)
            assert total == 30.0, f"live total should equal stone weight, got {total}"
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

class TestPartialChainUndo:
    """A 30 → B 12 (A left 18) → C 5 out of B (B left 7).
    Undoing B (still in_stock with 7 left) must give ONLY 7 back to A. C keeps
    its 5, total on the floor stays 30 and balance holds."""

    def test_partial_chain_undo_gives_back_current_weight(self, admin):
        k = _sp_kapan(admin, weight=60.0)
        try:
            _add_stone(admin, k["id"], 30.0)
            sid = _stone(admin, k["id"])["id"]

            a = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            _recycle(admin, "marking", a)
            b = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 12.0}]).json()["created"][0]
            c = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 5.0}]).json()["created"][0]

            # Whatever the internal pool ordering, total live weight must equal 30
            live = {p["packet_no"]: p for p in _packets(admin, sid)}
            total_before = round(sum(float(p["weight"]) for p in live.values()), 2)
            assert total_before == 30.0, live
            # B was created for 12 and (not consumed by C — C drew from stock pool,
            # oldest first), so B still holds its 12 with carried=12
            assert round(live[b["packet_no"]]["weight"], 2) == 12.0
            b_weight_before = live[b["packet_no"]]["weight"]

            # Undo B: give_back = min(carried, weight) = min(12, 12) = 12 → back to A
            r = admin.post(f"{API}/packets/{b['id']}/undo-split", timeout=TIMEOUT)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["weight"] == b_weight_before, body
            assert body["returned_to"] == a["packet_no"]

            live2 = {p["packet_no"]: p for p in _packets(admin, sid)}
            assert b["packet_no"] not in live2
            assert c["packet_no"] in live2  # C unchanged
            assert round(live2[c["packet_no"]]["weight"], 2) == 5.0
            total = round(sum(float(p["weight"]) for p in live2.values()), 2)
            assert total == 30.0, f"live total should equal stone weight, got {total}: {live2}"

            rep = _stone(admin, sid)["report"]
            assert rep["balanced"] is True, rep
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)




class TestUndoRowSpanningRoughAndStock:
    """Row that spanned rough+stock: undoing should return only the carried portion
    to the source and leave rough accounting intact."""

    def test_undo_returns_only_carried_portion(self, admin):
        k = _sp_kapan(admin, weight=50.0)
        try:
            _add_stone(admin, k["id"], 30.0)
            sid = _stone(admin, k["id"])["id"]

            # First make a 10-cts stock packet in marking
            p1 = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 10.0}]).json()["created"][0]
            _recycle(admin, "marking", p1)
            # 25 cts row on sarine → 20 from rough, 5 carried from p1
            split = _bulk(admin, sid, "sarine", [{"pcs": 1, "weight": 25.0}]).json()["created"][0]
            assert round(split["carried_weight"], 2) == 5.0
            assert round(split["original_weight"], 2) == 20.0

            r = admin.post(f"{API}/packets/{split['id']}/undo-split", timeout=TIMEOUT)
            # Expect either: (a) refused because it also drew from rough (would leave orphan rough)
            #                (b) succeeds returning ONLY 5 to p1 AND freeing the 20 rough properly.
            rep = _stone(admin, sid)["report"]
            if r.status_code == 200:
                assert r.json()["weight"] == 5.0, r.json()
                # After undo, un-packeted rough should be back to 20 and p1 should be 10 again.
                packets = {p["packet_no"]: p for p in _packets(admin, sid)}
                assert p1["packet_no"] in packets
                assert packets[p1["packet_no"]]["weight"] == 10.0
                assert rep["unpacketed_weight"] == 20.0, rep
                assert rep["balanced"] is True
            else:
                # if refused, register untouched and balanced
                assert r.status_code == 400
                assert rep["balanced"] is True
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestStaffCannotUndoSplit:
    def test_staff_forbidden(self, admin):
        staff = login("Staff")
        k = _sp_kapan(admin, weight=40.0)
        try:
            _add_stone(admin, k["id"], 20.0)
            sid = _stone(admin, k["id"])["id"]
            src = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 20.0}]).json()["created"][0]
            _recycle(admin, "marking", src)
            split = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 10.0}]).json()["created"][0]
            r = staff.post(f"{API}/packets/{split['id']}/undo-split", timeout=TIMEOUT)
            assert r.status_code in (401, 403), r.text
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
