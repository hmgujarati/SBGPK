"""SP Kapan module — single-packet kapan flow tests."""
import os
import random
import pytest
import requests
from dotenv import dotenv_values

# reuse helpers from the main regression module
from backend_test import login, receive, report, TIMEOUT, API  # noqa: F401


@pytest.fixture(scope="module")
def admin():
    return login("Admin")


def _new_sp_kapan(sess, weight=436.57, pcs=8):
    kno = f"SP{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_SP_ROUGH",
        "pcs": pcs, "weight": weight, "mode": "sp", "notes": "TEST_SP"},
        timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _new_normal_kapan(sess, weight=100.0, pcs=5):
    kno = f"NM{random.randint(100000, 999999)}"
    r = sess.post(f"{API}/kapans", json={
        "date": "2026-07-01", "kapan_no": kno, "type": "TEST_ROUGH",
        "pcs": pcs, "weight": weight, "notes": "TEST_"},
        timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _add_stones(sess, kid, weights):
    return sess.post(f"{API}/kapans/{kid}/sp-stones",
                     json={"date": "2026-07-02",
                           "rows": [{"weight": w} for w in weights]},
                     timeout=TIMEOUT)


class TestSPKapanCreate:
    def test_sp_kapan_only_in_sp_register(self, admin):
        sp = _new_sp_kapan(admin)
        nm = _new_normal_kapan(admin)
        try:
            sp_list = admin.get(f"{API}/kapans", params={"mode": "sp", "limit": 500},
                                timeout=TIMEOUT).json()
            nm_list = admin.get(f"{API}/kapans", params={"mode": "normal", "limit": 500},
                                timeout=TIMEOUT).json()
            sp_ids = {k["id"] for k in sp_list["items"]}
            nm_ids = {k["id"] for k in nm_list["items"]}
            assert sp["id"] in sp_ids
            assert sp["id"] not in nm_ids
            assert nm["id"] in nm_ids
            assert nm["id"] not in sp_ids
            # mode field on doc
            assert sp["mode"] == "sp"
            assert nm.get("mode") in (None, "normal")
        finally:
            admin.delete(f"{API}/kapans/{sp['id']}", timeout=TIMEOUT)
            admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)


class TestSPStones:
    @pytest.fixture(scope="class")
    def kapan(self, admin):
        k = _new_sp_kapan(admin, weight=100.0)
        yield k
        admin.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)

    def test_add_stones_s_prefix_and_pcs_1(self, admin, kapan):
        r = _add_stones(admin, kapan["id"], [46.78, 30.00])
        assert r.status_code == 200, r.text
        created = r.json()["created"]
        assert len(created) == 2
        for s in created:
            assert s["pcs"] == 1
            assert s["mode"] == "sp"
            assert s["code"].startswith("S"), s["code"]
            assert s["original_weight"] > 0
        # remaining un-packeted drops
        rep = admin.get(f"{API}/kapans/{kapan['id']}/sp-report",
                        timeout=TIMEOUT).json()
        assert abs(rep["summary"]["unpacketed_weight"] - (100 - 46.78 - 30.0)) < 0.02

    def test_exceed_kapan_weight_rejected(self, admin, kapan):
        r = _add_stones(admin, kapan["id"], [500.0])
        assert r.status_code == 400
        assert "exceeds" in r.json()["detail"].lower()

    def test_sp_endpoint_rejects_on_normal_kapan(self, admin):
        nm = _new_normal_kapan(admin)
        try:
            r = _add_stones(admin, nm["id"], [10.0])
            assert r.status_code == 400
            assert "not an sp" in r.json()["detail"].lower()
        finally:
            admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)


def _issue_jangad(sess, process, packet_ids, karigar_name="TEST_SP_K",
                  sub_packets=None, date="2026-07-03"):
    return sess.post(f"{API}/jangads", json={
        "process": process, "date": date, "packet_ids": packet_ids,
        "karigar_name": karigar_name,
        "sub_packets": sub_packets or []},
        timeout=TIMEOUT)


class TestSPIssueRules:
    @pytest.fixture(scope="class")
    def setup(self, admin):
        sp = _new_sp_kapan(admin, weight=200.0)
        nm = _new_normal_kapan(admin, weight=100.0)
        stones = _add_stones(admin, sp["id"], [50.0, 40.0]).json()["created"]
        # normal packet for mixing test
        pk = admin.post(f"{API}/kapans/{nm['id']}/packets",
                       json={"date": "2026-07-01", "pcs": 2, "weight": 20.0},
                       timeout=TIMEOUT).json()
        yield {"sp": sp, "nm": nm, "stones": stones, "pk": pk}
        admin.delete(f"{API}/kapans/{sp['id']}", timeout=TIMEOUT)
        admin.delete(f"{API}/kapans/{nm['id']}", timeout=TIMEOUT)

    def test_mixed_sp_normal_rejected(self, admin, setup):
        r = _issue_jangad(admin, "marking",
                          [setup["stones"][0]["id"], setup["pk"]["id"]])
        assert r.status_code == 400
        assert "sp" in r.json()["detail"].lower()

    def test_sp_nats_rejected(self, admin, setup):
        r = _issue_jangad(admin, "nats", [setup["stones"][0]["id"]])
        assert r.status_code == 400
        detail = r.json()["detail"].lower()
        assert "sp" in detail or "not part" in detail

    def test_sp_filling_rejected(self, admin, setup):
        r = _issue_jangad(admin, "filling", [setup["stones"][0]["id"]])
        assert r.status_code == 400

    def test_bad_sub_packet_split_rejected(self, admin, setup):
        stone = setup["stones"][0]
        # stone is 50.00, split totals 40 only
        r = _issue_jangad(admin, "marking", [stone["id"]],
                          sub_packets=[{"packet_id": stone["id"],
                                        "weight": 40.0, "pcs": 1}])
        assert r.status_code == 400
        assert "sub" in r.json()["detail"].lower()

    def test_good_sub_packet_split_and_receive_flow(self, admin, setup):
        stone = setup["stones"][1]  # 40.00 cts
        # sub-packets 20 + 20 = 40
        j = _issue_jangad(admin, "marking", [stone["id"]],
                         sub_packets=[{"packet_id": stone["id"], "weight": 25.0, "pcs": 1},
                                      {"packet_id": stone["id"], "weight": 15.0, "pcs": 1}])
        assert j.status_code == 200, j.text
        entry = j.json()["entries"][0]
        assert entry["mode"] == "sp"
        assert len(entry["sub_packets"]) == 2
        assert entry["sub_packets"][0]["no"].endswith(".1")

        # receive: issue 40, boil 38.8, rc 0.5 -> loss=1.20, net=38.3
        rec = receive(admin, entry["id"], return_pcs=5, return_weight=38.8,
                      return_boil=38.8, rc=0.5)
        assert rec.status_code == 200, rec.text
        d = rec.json()
        assert abs(d["loss"] - 1.20) < 0.02
        assert abs(d["net_weight"] - 38.3) < 0.02
        # SP: pcs stays 1 even though return_pcs was 5
        rep = admin.get(f"{API}/kapans/{setup['sp']['id']}/sp-report",
                        timeout=TIMEOUT).json()
        stone_now = next(s for s in rep["stones"] if s["id"] == stone["id"])
        assert stone_now["pcs"] == 1
        assert abs(stone_now["weight"] - 38.3) < 0.02
        assert stone_now["step_count"] == 1

    def test_sp_stone_can_be_reissued_and_chain_accumulates(self, admin, setup):
        stone = setup["stones"][1]  # already at 38.3 after marking
        # issue for laser now
        j = _issue_jangad(admin, "laser", [stone["id"]])
        assert j.status_code == 200, j.text
        eid = j.json()["entries"][0]["id"]
        rec = receive(admin, eid, return_pcs=1, return_weight=37.0,
                      return_boil=37.0, rc=0.3)
        assert rec.status_code == 200, rec.text
        rep = admin.get(f"{API}/kapans/{setup['sp']['id']}/sp-report",
                        timeout=TIMEOUT).json()
        stone_now = next(s for s in rep["stones"] if s["id"] == stone["id"])
        assert stone_now["step_count"] == 2
        # cumulative loss = 1.20 (marking) + (38.3 - 37.0) = 1.20 + 1.30 = 2.50
        assert abs(stone_now["total_loss"] - 2.50) < 0.03
        # current weight after laser: 37 - 0.3 = 36.7
        assert abs(stone_now["weight"] - 36.7) < 0.02

    def test_karigar_not_registered_rejected(self, admin, setup):
        stone = setup["stones"][0]
        kres = admin.post(f"{API}/karigars",
                         json={"name": "TEST_SP_ONLY_POLISH", "phone": "",
                               "processes": ["polish"], "active": True},
                         timeout=TIMEOUT)
        assert kres.status_code == 200
        kid = kres.json()["id"]
        try:
            r = admin.post(f"{API}/jangads", json={
                "process": "marking", "date": "2026-07-05",
                "packet_ids": [stone["id"]], "karigar_id": kid,
                "karigar_name": "TEST_SP_ONLY_POLISH"}, timeout=TIMEOUT)
            assert r.status_code == 400, r.text
            assert "karigar" in r.json()["detail"].lower() or "not a" in r.json()["detail"].lower()
        finally:
            admin.delete(f"{API}/karigars/{kid}", timeout=TIMEOUT)


class TestSPReport:
    def test_sp_report_shape(self, admin):
        sp = _new_sp_kapan(admin, weight=80.0)
        try:
            _add_stones(admin, sp["id"], [30.0, 20.0])
            r = admin.get(f"{API}/kapans/{sp['id']}/sp-report", timeout=TIMEOUT)
            assert r.status_code == 200
            d = r.json()
            for k in ("kapan_weight", "stone_count", "stone_weight",
                      "unpacketed_weight", "total_loss", "in_process_weight"):
                assert k in d["summary"]
            assert d["summary"]["stone_count"] == 2
            assert d["summary"]["kapan_weight"] == 80.0
            for s in d["stones"]:
                for k in ("total_loss", "loss_pct", "yield_pct", "difference",
                          "balanced", "steps", "step_count"):
                    assert k in s
        finally:
            admin.delete(f"{API}/kapans/{sp['id']}", timeout=TIMEOUT)
