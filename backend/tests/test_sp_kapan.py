"""SP Kapan module — each stone is its own mini-kapan with a full process register."""
import random

import pytest
from backend_test import API, TIMEOUT, login, receive


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _new_sp_kapan(sess, weight=436.57, pcs=8):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_SP_ROUGH",
        "pcs": pcs, "weight": weight, "mode": "sp", "notes": "TEST_SP"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _new_normal_kapan(sess, weight=100.0, pcs=5):
    kno = f"NM{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_ROUGH",
        "pcs": pcs, "weight": weight, "notes": "TEST_"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _add_stones(sess, kid, weights):
    return sess.post(f"{API}/kapans/{kid}/sp-stones",
                     json={"date": "2026-07-02", "rows": [{"weight": w} for w in weights]},
                     timeout=TIMEOUT)


def _bulk(sess, kid, process, rows):
    return sess.post(f"{API}/kapans/{kid}/process-packets",
                     json={"process": process, "date": "2026-07-03", "rows": rows}, timeout=TIMEOUT)


def _issue(sess, process, packet_ids, karigar_id=None, karigar_name="TEST_SP_K"):
    return sess.post(f"{API}/jangads", json={
        "process": process, "date": "2026-07-04", "packet_ids": packet_ids,
        "karigar_id": karigar_id, "karigar_name": karigar_name}, timeout=TIMEOUT)


def _sp_report(sess, kid):
    r = sess.get(f"{API}/kapans/{kid}/sp-report", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


class TestSPKapanCreate:
    def test_sp_kapan_only_in_sp_register(self, admin):
        sp = _new_sp_kapan(admin)
        nm = _new_normal_kapan(admin)
        try:
            sp_ids = {k["id"] for k in admin.get(f"{API}/kapans", params={"mode": "sp", "limit": 500},
                                                 timeout=TIMEOUT).json()["items"]}
            nm_ids = {k["id"] for k in admin.get(f"{API}/kapans", params={"mode": "normal", "limit": 500},
                                                 timeout=TIMEOUT).json()["items"]}
            assert sp["id"] in sp_ids and sp["id"] not in nm_ids
            assert nm["id"] in nm_ids and nm["id"] not in sp_ids
            assert sp["mode"] == "sp"
        finally:
            admin.delete(f"{API}/kapans/{sp['id']}", timeout=TIMEOUT)
            admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)


class TestSPStones:
    @pytest.fixture(scope="class")
    def kapan(self, admin):
        k = _new_sp_kapan(admin, weight=100.0)
        yield k
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_stones_become_child_kapans(self, admin, kapan):
        r = _add_stones(admin, kapan["id"], [46.78, 12.22])
        assert r.status_code == 200, r.text
        created = r.json()["created"]
        assert [s["stone_no"] for s in created] == [1, 2]
        assert created[0]["kapan_no"] == f"{kapan['kapan_no']}/1"
        assert all(s["mode"] == "sp_stone" and s["pcs"] == 1 for s in created)
        # stone kapans never show up in either register listing
        nm = admin.get(f"{API}/kapans", params={"mode": "normal", "limit": 500}, timeout=TIMEOUT).json()
        sp = admin.get(f"{API}/kapans", params={"mode": "sp", "limit": 500}, timeout=TIMEOUT).json()
        ids = {k["id"] for k in nm["items"]} | {k["id"] for k in sp["items"]}
        assert created[0]["id"] not in ids

        rep = _sp_report(admin, kapan["id"])
        assert rep["summary"]["stone_count"] == 2
        assert rep["summary"]["unstoned_weight"] == 41.0

    def test_stones_cannot_exceed_kapan(self, admin, kapan):
        r = _add_stones(admin, kapan["id"], [999.0])
        assert r.status_code == 400
        assert "remaining" in r.json()["detail"]

    def test_sp_stones_rejected_on_normal_kapan(self, admin):
        nm = _new_normal_kapan(admin)
        try:
            r = _add_stones(admin, nm["id"], [10.0])
            assert r.status_code == 400
            assert "not an SP kapan" in r.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)


class TestSPStoneRegister:
    @pytest.fixture(scope="class")
    def stone(self, admin):
        k = _new_sp_kapan(admin, weight=120.0)
        _add_stones(admin, k["id"], [46.78, 20.0])
        rep = _sp_report(admin, k["id"])
        yield {"kapan": k, "stone": rep["stones"][0]}
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_packets_numbered_stone_dot_n_with_s_code(self, admin, stone):
        r = _bulk(admin, stone["stone"]["id"], "marking", [{"pcs": 1, "weight": 30.0}, {"pcs": 1, "weight": 16.78}])
        assert r.status_code == 200, r.text
        created = r.json()["created"]
        assert [p["packet_no"] for p in created] == ["1.1", "1.2"]
        assert all(p["code"].startswith("S") and p["mode"] == "sp_stone" for p in created)
        # second process register continues the same stone numbering
        r2 = _bulk(admin, stone["stone"]["id"], "laser", [])
        assert r2.status_code == 400  # no rows

    def test_nats_and_filling_rejected_in_stone(self, admin, stone):
        for proc in ("nats", "filling"):
            r = _bulk(admin, stone["stone"]["id"], proc, [{"pcs": 1, "weight": 1.0}])
            assert r.status_code == 400, proc
            assert "not part of the SP kapan flow" in r.json()["detail"]

    def test_packets_cannot_exceed_stone_weight(self, admin, stone):
        r = _bulk(admin, stone["stone"]["id"], "marking", [{"pcs": 1, "weight": 500.0}])
        assert r.status_code == 400
        assert "available" in r.json()["detail"]


class TestSPIssueReceive:
    @pytest.fixture(scope="class")
    def setup(self, admin):
        k = _new_sp_kapan(admin, weight=200.0)
        _add_stones(admin, k["id"], [50.0])
        stone = _sp_report(admin, k["id"])["stones"][0]
        packets = _bulk(admin, stone["id"], "marking", [{"pcs": 1, "weight": 50.0}]).json()["created"]
        kar = admin.post(f"{API}/karigars", json={
            "name": f"TEST_SP_K{random.randint(1000, 9999)}",
            "processes": ["marking", "laser"], "active": True}, timeout=TIMEOUT).json()
        yield {"kapan": k, "stone": stone, "packet": packets[0], "karigar": kar}
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
        admin.delete(f"{API}/karigars/{kar['id']}", timeout=TIMEOUT)

    def test_sp_and_normal_cannot_mix(self, admin, setup):
        nm = _new_normal_kapan(admin)
        try:
            np_ = _bulk(admin, nm["id"], "marking", [{"pcs": 1, "weight": 10.0}]).json()["created"][0]
            r = _issue(admin, "marking", [setup["packet"]["id"], np_["id"]])
            assert r.status_code == 400
            assert "cannot be issued together" in r.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)

    def test_karigar_must_serve_process(self, admin, setup):
        other = admin.post(f"{API}/karigars", json={
            "name": f"TEST_GH{random.randint(1000, 9999)}", "processes": ["ghat"], "active": True},
            timeout=TIMEOUT).json()
        try:
            r = _issue(admin, "marking", [setup["packet"]["id"]], karigar_id=other["id"],
                       karigar_name=other["name"])
            assert r.status_code == 400
            assert "not a Marking karigar" in r.json()["detail"]
        finally:
            admin.delete(f"{API}/karigars/{other['id']}", timeout=TIMEOUT)

    def test_issue_receive_and_reissue_chain(self, admin, setup):
        pid = setup["packet"]["id"]
        kar = setup["karigar"]

        r = _issue(admin, "marking", [pid], karigar_id=kar["id"], karigar_name=kar["name"])
        assert r.status_code == 200, r.text
        e1 = r.json()["entries"][0]
        assert e1["mode"] == "sp_stone" and e1["packet_no"] == "1.1"

        rr = receive(admin, e1["id"], return_pcs=1, return_weight=48.0, return_boil=48.0, rc=1.0, nail_rc=0.5)
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body["loss"] == 2.0 and body["net_weight"] == 46.5

        # same packet goes on to laser — a returned packet is free to go to any process next
        r2 = _issue(admin, "laser", [pid], karigar_id=kar["id"], karigar_name=kar["name"])
        assert r2.status_code == 200, r2.text
        e2 = r2.json()["entries"][0]
        assert e2["process"] == "laser" and e2["weight"] == 46.5
        rr2 = receive(admin, e2["id"], return_pcs=1, return_weight=46.0, return_boil=46.0, rc=0.0, nail_rc=0.0)
        assert rr2.status_code == 200, rr2.text

        rep = _sp_report(admin, setup["kapan"]["id"])
        stone = rep["stones"][0]
        assert stone["total_rc"] == 1.0 and stone["total_nail_rc"] == 0.5
        assert stone["total_loss"] == 2.5
        assert stone["balanced"] is True
        assert rep["summary"]["total_loss"] == 2.5

    def test_sp_processes_only_on_jangad(self, admin, setup):
        k = _new_sp_kapan(admin, weight=60.0)
        try:
            _add_stones(admin, k["id"], [20.0])
            st = _sp_report(admin, k["id"])["stones"][0]
            p = _bulk(admin, st["id"], "polish", [{"pcs": 1, "weight": 20.0}]).json()["created"][0]
            for proc in ("nats", "filling"):
                r = _issue(admin, proc, [p["id"]])
                assert r.status_code == 400, proc
                assert "not part of the SP kapan flow" in r.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestSPStoneSplitFromStock:
    def test_returned_packet_can_be_split_for_next_process(self, admin):
        k = _new_sp_kapan(admin, weight=100.0)
        try:
            _add_stones(admin, k["id"], [46.78])
            st = _sp_report(admin, k["id"])["stones"][0]
            p = _bulk(admin, st["id"], "marking", [{"pcs": 1, "weight": 46.78}]).json()["created"][0]
            e = _issue(admin, "marking", [p["id"]]).json()["entries"][0]
            receive(admin, e["id"], return_pcs=1, return_weight=40.0, return_boil=40.0, rc=0.0, nail_rc=0.0)

            rep = _sp_report(admin, k["id"])["stones"][0]["report"]
            assert rep["unpacketed_weight"] == 0.0 and rep["stock_weight"] == 40.0

            # split that 40.00 into two shape-cutting packets — un-packeted is 0 but stock is not
            r = _bulk(admin, st["id"], "shape", [{"pcs": 1, "weight": 25.0}, {"pcs": 1, "weight": 15.0}])
            assert r.status_code == 200, r.text
            new = r.json()["created"]
            assert [x["packet_no"] for x in new] == ["1.2", "1.3"]
            assert all(x["last_process"] == "marking" for x in new)

            after = _sp_report(admin, k["id"])["stones"][0]
            assert after["report"]["stock_weight"] == 40.0        # nothing double counted
            assert after["report"]["unpacketed_weight"] == 0.0
            assert after["balanced"] is True

            # over budget still refused
            bad = _bulk(admin, st["id"], "ghat", [{"pcs": 1, "weight": 500.0}])
            assert bad.status_code == 400 and "available" in bad.json()["detail"]
        finally:
            admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)


class TestSPCascadeDelete:
    def test_deleting_sp_kapan_removes_stones_and_packets(self, admin):
        k = _new_sp_kapan(admin, weight=80.0)
        _add_stones(admin, k["id"], [30.0])
        stone = _sp_report(admin, k["id"])["stones"][0]
        packet = _bulk(admin, stone["id"], "marking", [{"pcs": 1, "weight": 30.0}]).json()["created"][0]

        assert admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT).status_code == 200
        assert admin.get(f"{API}/kapans/{stone['id']}", timeout=TIMEOUT).status_code == 404
        gone = admin.get(f"{API}/packets/lookup", params={"code": packet["code"]}, timeout=TIMEOUT)
        assert gone.status_code == 404
