"""Edge cases for splitting packets from stock (bug fix — un-packeted 0.00 must still
allow creating packets for next process by consuming from stock).

Focus areas requested by main agent:
  1) partial consumption across multiple source packets
  2) a single new row that spans rough + stock (mix)
  3) delete after a split (must be refused for carried packets, allowed for the parent)
  4) receive/issue still work on packets born from a stock-split
  5) mass balance holds in every case (normal + SP)
"""
import random
import pytest
from backend_test import API, TIMEOUT, login, receive, mk_packet, new_kapan, issue


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _new_sp_kapan(sess, weight=100.0, pcs=1):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_SP_SPLIT",
        "pcs": pcs, "weight": weight, "mode": "sp", "notes": "TEST_SPLIT"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _add_stones(sess, kid, weights):
    return sess.post(f"{API}/kapans/{kid}/sp-stones",
                     json={"date": "2026-07-02", "rows": [{"weight": w} for w in weights]},
                     timeout=TIMEOUT)


def _bulk(sess, kid, process, rows):
    return sess.post(f"{API}/kapans/{kid}/process-packets",
                     json={"process": process, "date": "2026-07-03", "rows": rows}, timeout=TIMEOUT)


def _issue_bulk(sess, process, packet_ids, karigar_name="TEST_SPLIT_K"):
    return sess.post(f"{API}/jangads", json={
        "process": process, "date": "2026-07-04",
        "packet_ids": packet_ids, "karigar_name": karigar_name}, timeout=TIMEOUT)


def _stone(sess, kid):
    """kid may be the SP kapan (first stone) or a stone kapan itself."""
    r = sess.get(f"{API}/kapans/{kid}/sp-report", timeout=TIMEOUT).json()
    if r.get("stones"):
        return r["stones"][0]
    # stone kapan itself — fall back to /kapans/{id}
    d = sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json()
    return {"id": kid, "report": d.get("report", {}), "balanced": d.get("report", {}).get("balanced")}


def _rep(sess, kid):
    r = sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT)
    return r.json().get("report", r.json())


def _reg_packets(sess, kid):
    return sess.get(f"{API}/kapans/{kid}", timeout=TIMEOUT).json().get("packets", [])


# ---------- SP: partial consumption across multiple source stock packets ----------
class TestSPPartialConsumptionAcrossSources:
    """Stone rough fully allocated to 3 marking packets returned to stock;
    creating one shape packet larger than any single source must eat into several."""

    def test_multi_source_consumption_stays_balanced(self, admin):
        k = _new_sp_kapan(admin, weight=100.0)
        try:
            _add_stones(admin, k["id"], [50.0])
            st = _stone(admin, k["id"])
            sid = st["id"]

            # split rough into 3 marking packets summing to 50
            pkts = _bulk(admin, sid, "marking",
                         [{"pcs": 1, "weight": 20.0},
                          {"pcs": 1, "weight": 20.0},
                          {"pcs": 1, "weight": 10.0}]).json()["created"]
            assert len(pkts) == 3

            # issue + receive each — no loss, stock = 50 across 3 packets after
            for p in pkts:
                e = _issue_bulk(admin, "marking", [p["id"]]).json()["entries"][0]
                w = float(p["weight"])
                rr = receive(admin, e["id"], return_pcs=1, return_weight=w,
                             return_boil=w, rc=0.0, nail_rc=0.0)
                assert rr.status_code == 200, rr.text

            rep = _stone(admin, k["id"])["report"]
            assert rep["unpacketed_weight"] == 0.0
            assert rep["stock_weight"] == 50.0

            # now create ONE shape packet of 35 — must consume 20 + 15 across two sources
            r = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 35.0}])
            assert r.status_code == 200, r.text
            new = r.json()["created"][0]
            # inherits last_process=marking so it lives in stock bucket
            assert new["last_process"] == "marking"
            assert new["split_from"]  # points to first source

            # kapan-level balance identity holds
            after = _stone(admin, k["id"])
            after_r = after["report"]
            assert after["balanced"] is True
            assert after_r["stock_weight"] == 50.0    # unchanged, nothing double-counted
            assert after_r["unpacketed_weight"] == 0.0
            assert after_r["packeted_weight"] == 50.0
            assert after_r["difference"] == 0.0

            # register hides the fully-consumed source packet (20 -> 0 after take)
            pkt_list = _reg_packets(admin, sid)
            weights = sorted(round(float(p["weight"]), 2) for p in pkt_list)
            # remaining live packets after consuming 20 + 15: 5 (from a 20), 10, 35(new)
            assert weights == [5.0, 10.0, 35.0]
            # no packet in the register should be 'consumed'
            assert all(p.get("status") != "consumed" for p in pkt_list)
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


# ---------- SP: row that spans rough + stock in one call ----------
class TestSPRowSpansRoughAndStock:
    def test_row_split_across_rough_and_stock(self, admin):
        k = _new_sp_kapan(admin, weight=50.0)
        try:
            _add_stones(admin, k["id"], [30.0])
            st = _stone(admin, k["id"])
            sid = st["id"]

            # Make a 10-cts stock packet from rough, issue+receive it to become "stock"
            p1 = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 10.0}]).json()["created"][0]
            e1 = _issue_bulk(admin, "marking", [p1["id"]]).json()["entries"][0]
            receive(admin, e1["id"], return_pcs=1, return_weight=10.0, return_boil=10.0, rc=0.0, nail_rc=0.0)

            rep = _stone(admin, sid)["report"]
            assert rep["unpacketed_weight"] == 20.0 and rep["stock_weight"] == 10.0

            # ONE new row of 25 cts — 20 from rough + 5 from that 10-stock packet
            r = _bulk(admin, sid, "sarine", [{"pcs": 1, "weight": 25.0}])
            assert r.status_code == 200, r.text
            new = r.json()["created"][0]
            assert new["last_process"] == "marking"    # inherited because it also drew from stock
            assert new["split_from"]
            # original_weight = rough part = 20, carried = 5
            assert round(new["original_weight"], 2) == 20.0
            assert round(new["carried_weight"], 2) == 5.0

            after = _stone(admin, sid)
            assert after.get("balanced") is True or abs(after["report"]["difference"]) <= 0.02
            r2 = after["report"]
            assert r2["unpacketed_weight"] == 0.0
            # stock = leftover of p1 (5) + new packet weight (25) since last_process=marking
            assert r2["stock_weight"] == 30.0
            # packeted = rough allocated = 10 (p1) + 20 (new.original_weight) = 30
            assert r2["packeted_weight"] == 30.0
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


# ---------- SP: delete rules ----------
class TestDeleteRulesAfterSplit:
    def test_delete_split_packet_refused_but_normal_ok(self, admin):
        k = _new_sp_kapan(admin, weight=60.0)
        try:
            _add_stones(admin, k["id"], [30.0])
            sid = _stone(admin, k["id"])["id"]

            # fully allocate rough to a marking packet, run it through, return with no loss
            p = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]
            e = _issue_bulk(admin, "marking", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=30.0, return_boil=30.0, rc=0.0, nail_rc=0.0)

            # now split-from-stock into a shape packet
            r = _bulk(admin, sid, "shape", [{"pcs": 1, "weight": 30.0}])
            assert r.status_code == 200, r.text
            split = r.json()["created"][0]

            # DELETE the split packet — must be refused (carried_weight > 0)
            rd = admin.delete(f"{API}/packets/{split['id']}", timeout=TIMEOUT)
            assert rd.status_code == 400
            assert "split out of stock" in rd.json()["detail"]

            # deleting the original marking packet is also blocked because it has entries
            rd2 = admin.delete(f"{API}/packets/{p['id']}", timeout=TIMEOUT)
            assert rd2.status_code == 400
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_delete_normal_unsplit_packet_still_works(self, admin):
        k = new_kapan(admin, weight=100.0, pcs=5)
        try:
            p = mk_packet(admin, k["id"], pcs=1, weight=25.0).json()
            # un-packeted should now be 75; delete brings it back
            r0 = _rep(admin, k["id"])
            assert r0["unpacketed_weight"] == 75.0
            rd = admin.delete(f"{API}/packets/{p['id']}", timeout=TIMEOUT)
            assert rd.status_code == 200, rd.text
            r1 = _rep(admin, k["id"])
            assert r1["unpacketed_weight"] == 100.0
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


# ---------- Normal kapan: same split-from-stock flow ----------
class TestNormalKapanSplitFromStock:
    def test_normal_kapan_stays_balanced_after_stock_split(self, admin):
        k = new_kapan(admin, weight=100.0, pcs=5)
        try:
            # fully allocate rough via bulk process-packets for marking
            pkts = _bulk(admin, k["id"], "marking",
                         [{"pcs": 1, "weight": 60.0}, {"pcs": 1, "weight": 40.0}]).json()["created"]

            r0 = _rep(admin, k["id"])
            assert r0["unpacketed_weight"] == 0.0

            # issue+receive both (no loss)
            for p in pkts:
                e = _issue_bulk(admin, "marking", [p["id"]]).json()["entries"][0]
                w = float(p["weight"])
                receive(admin, e["id"], return_pcs=1, return_weight=w, return_boil=w, rc=0.0, nail_rc=0.0)

            r1 = _rep(admin, k["id"])
            assert r1["stock_weight"] == 100.0
            assert r1["unpacketed_weight"] == 0.0

            # split into shape packets from stock
            r = _bulk(admin, k["id"], "shape",
                      [{"pcs": 1, "weight": 55.0}, {"pcs": 1, "weight": 45.0}])
            assert r.status_code == 200, r.text
            new = r.json()["created"]
            assert all(x["last_process"] == "marking" and x["split_from"] for x in new)

            r2 = _rep(admin, k["id"])
            assert r2["stock_weight"] == 100.0     # unchanged
            assert r2["unpacketed_weight"] == 0.0
            assert r2["balanced"] is True
            assert r2["difference"] == 0.0

            # the 60-cts source packet is fully consumed by the 55+partial of 45 = actually
            # first consumed_from = 40-cts packet? sorted by seq -> first stock is 60 then 40.
            # 55 takes 55 from 60 (leaves 5); 45 takes 5 from 60 (fully consumed, leaves 0) then 40 from 40.
            live = [p for p in _reg_packets(admin, k["id"]) if p.get("status") != "consumed"]
            weights = sorted(round(float(p["weight"]), 2) for p in live)
            # remaining: 55, 45 (the two new) — both 60 and 40 fully consumed
            assert weights == [45.0, 55.0]

            # confirm register hides consumed
            all_pkts = _reg_packets(admin, k["id"])
            assert all(p.get("status") != "consumed" for p in all_pkts)
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_overbudget_refused_with_helpful_message(self, admin):
        k = new_kapan(admin, weight=50.0, pcs=3)
        try:
            _bulk(admin, k["id"], "marking", [{"pcs": 1, "weight": 50.0}])
            r = _bulk(admin, k["id"], "shape", [{"pcs": 1, "weight": 500.0}])
            assert r.status_code == 400
            detail = r.json()["detail"]
            assert "500.00" in detail
            assert "available" in detail
            assert "un-packeted" in detail and "in stock" in detail
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


# ---------- Receive after split: entries flow works on carried packets ----------
class TestReceiveAfterSplit:
    def test_split_packet_can_be_issued_and_received(self, admin):
        k = _new_sp_kapan(admin, weight=80.0)
        try:
            _add_stones(admin, k["id"], [40.0])
            sid = _stone(admin, k["id"])["id"]

            p = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 40.0}]).json()["created"][0]
            e = _issue_bulk(admin, "marking", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=40.0, return_boil=40.0, rc=0.0, nail_rc=0.0)

            split = _bulk(admin, sid, "sarine", [{"pcs": 1, "weight": 40.0}]).json()["created"][0]
            # issue split packet to sarine and receive with 2 cts loss
            e2 = _issue_bulk(admin, "sarine", [split["id"]]).json()["entries"][0]
            rr = receive(admin, e2["id"], return_pcs=1, return_weight=38.0,
                         return_boil=38.0, rc=0.0, nail_rc=0.0)
            assert rr.status_code == 200, rr.text

            rep = _stone(admin, sid)["report"]
            assert rep["balanced"] is True or abs(rep["difference"]) <= 0.02
            # loss now 2, stock now 38
            assert round(rep["stock_weight"], 2) == 38.0
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestStagePoolRule:
    """Material already held by packets of the same stage is not available again."""

    def test_stage_can_only_draw_from_other_stages(self, admin):
        k = _new_sp_kapan(admin, weight=60.0)
        try:
            _add_stones(admin, k["id"], [30.0])
            sid = _stone(admin, k["id"])["id"]

            # all 30 goes into marking packets
            r = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 30.0}])
            assert r.status_code == 200, r.text
            # marking has nothing left to draw from (its own stock does not count)
            again = _bulk(admin, sid, "marking", [{"pcs": 1, "weight": 1.0}])
            assert again.status_code == 400, again.text
            assert "available for Marking" in again.json()["detail"]

            # laser may draw from the marking stock
            laser = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 12.0}])
            assert laser.status_code == 200, laser.text
            # and once laser holds 12 of its own, that 12 is no longer re-usable by laser,
            # only the 18 still sitting in marking is
            over = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 19.0}])
            assert over.status_code == 400, over.text
            assert "18.00" in over.json()["detail"]
            ok = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 18.0}])
            assert ok.status_code == 200, ok.text
            # now everything sits in laser — nothing left anywhere
            none_left = _bulk(admin, sid, "laser", [{"pcs": 1, "weight": 0.5}])
            assert none_left.status_code == 400
            assert _stone(admin, sid)["report"]["balanced"] is True
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
