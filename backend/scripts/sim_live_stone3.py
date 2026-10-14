"""Rebuild the live Stone 3 (SP 516.06) shape exactly, force the impossible weights the old
build allowed, then prove Repair Balance makes the arithmetic add up."""
import random, sys
sys.path.insert(0, "/app/backend/tests")
from backend_test import API, TIMEOUT, login, receive
from dotenv import dotenv_values
from bson import ObjectId
import pymongo

a = login("Admin")
cfg = dotenv_values("/app/backend/.env")
mdb = pymongo.MongoClient(cfg["MONGO_URL"])[cfg["DB_NAME"]]

kno = f"SP{random.randint(100000,999999)}"
k = a.post(f"{API}/kapans", json={"date":"2026-09-22","kapan_no":kno,"type":"TEST_LIVE3","pcs":1,"weight":101.06,"mode":"sp"}, timeout=TIMEOUT).json()
a.post(f"{API}/kapans/{k['id']}/sp-stones", json={"date":"2026-09-22","rows":[{"weight":50.53}]}, timeout=TIMEOUT)
sid = a.get(f"{API}/kapans/{k['id']}/sp-report", timeout=TIMEOUT).json()["stones"][0]["id"]

def make(process, rows):
    r = a.post(f"{API}/kapans/{sid}/process-packets", json={"process":process,"date":"2026-09-22","rows":rows}, timeout=TIMEOUT)
    if r.status_code != 200:
        # the old build let this through on phantom stock — force it the same way
        print("  FORCED:", process, rows, r.json()["detail"])
        created = []
        for row in rows:
            seq = mdb.packets.count_documents({"kapan_id": ObjectId(sid)}) + 1
            doc = {"kapan_id": ObjectId(sid), "mode": "sp_stone", "seq": seq,
                   "packet_no": f"1.{seq}", "code": f"X{random.randint(10000,99999)}",
                   "process": process, "date": "2026-09-22", "pcs": row["pcs"],
                   "weight": row["weight"], "original_weight": 0.0, "carried_weight": row["weight"],
                   "palchu_weight": 0.0, "original_pcs": row["pcs"], "status": "in_stock",
                   "stock_state": "fresh", "split_from": None, "last_process": None,
                   "size": row["weight"], "created_at": "2026-09-22T00:00:00+00:00"}
            res = mdb.packets.insert_one(doc)
            created.append({"id": str(res.inserted_id), "packet_no": doc["packet_no"]})
        return created
    return r.json()["created"]

def cycle(process, rows, rets):
    created = make(process, rows)
    es = a.post(f"{API}/jangads", json={"process":process,"date":"2026-09-22","packet_ids":[c["id"] for c in created],"karigar_name":"SYNOVA"}, timeout=TIMEOUT).json()["entries"]
    for c, e, ret in zip(created, es, rets):
        if ret is None:
            continue
        boil, palchu, rc = ret
        r = receive(a, e["id"], return_pcs=1, return_weight=boil, return_boil=boil, rc=rc, nail_rc=0.0, palchu=palchu)
        if r.status_code != 200:
            print("  receive refused:", c["packet_no"], r.json()["detail"])
    return created

cycle("laser",  [{"pcs":1,"weight":50.53}], [(50.40, 0.0, 0.0)])
cycle("sarine", [{"pcs":1,"weight":40.70},{"pcs":1,"weight":4.69}], [(40.70,0.0,0.0),(4.69,0.0,0.0)])
cycle("laser",  [{"pcs":1,"weight":43.53},{"pcs":1,"weight":6.87}], [(42.99,0.0,0.0),(6.78,0.0,0.0)])
cycle("laser",  [{"pcs":1,"weight":40.70},{"pcs":1,"weight":4.69}], [(37.59,34.43,0.0),(4.33,0.0,0.0)])
cycle("laser",  [{"pcs":1,"weight":10.54}], [(10.43,0.0,2.38)])
cycle("laser",  [{"pcs":1,"weight":9.38}], [None])

d = a.get(f"{API}/kapans/{sid}", timeout=TIMEOUT).json()
print("\nBEFORE:", {kk: d["report"][kk] for kk in ("kapan_weight","stock_weight","allocated_weight","in_process_weight","palchu_available","accounted_weight","difference","balanced")})
print("packets:", [(x["packet_no"], x["status"], x["weight"]) for x in d["packets"]])

r = a.post(f"{API}/kapans/{sid}/repair", timeout=TIMEOUT).json()
print("\nfixed:", r["fixed"])
print("capped:", r["capped"])
print("AFTER:", {kk: r["report"][kk] for kk in ("kapan_weight","stock_weight","allocated_weight","in_process_weight","palchu_available","accounted_weight","difference","balanced")})
d = a.get(f"{API}/kapans/{sid}", timeout=TIMEOUT).json()
print("packets:", [(x["packet_no"], x["status"], x["weight"]) for x in d["packets"]])
a.delete(f"{API}/kapans/{k['id']}", timeout=TIMEOUT)
