"""Load-test seeder: bulk kapans + packets + issued/received entries.
Usage: python scripts/loadtest_seed.py 150 25   (kapans, packets each)
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import db  # noqa: E402

PROCS = ["sarine", "laser", "shape", "ghat", "polish"]


async def main(nk: int, npk: int):
    now = datetime.now(timezone.utc)
    start = await db.packets.count_documents({})
    code = start
    for k in range(nk):
        kno = f"LT{k:05d}-{os.getpid()}"
        kdoc = {"kapan_no": kno, "date": "2026-06-01", "type": "LOADTEST", "pcs": npk * 2,
                "weight": float(npk * 10), "size": 5.0, "created_at": now, "created_by": "seed"}
        kid = (await db.kapans.insert_one(kdoc)).inserted_id
        packets, entries = [], []
        for i in range(1, npk + 1):
            code += 1
            proc = PROCS[i % len(PROCS)]
            pid = None
            packets.append({
                "kapan_id": kid, "seq": i, "code": f"{code:05d}", "packet_no": f"{kno}-{i:02d}",
                "process": proc, "date": "2026-06-01", "pcs": 2, "weight": 10.0,
                "original_pcs": 2, "original_weight": 10.0, "size": 5.0, "status": "in_stock",
                "hw": "", "ds": "", "tops": 0, "expected_return_pcs": 0,
                "last_process": None, "current_process": None, "notes": "",
                "created_at": now, "created_by": "seed",
            })
        res = await db.packets.insert_many(packets)
        for pid, p in zip(res.inserted_ids, packets):
            # one closed entry per packet so reports have data to crunch
            entries.append({
                "packet_id": pid, "kapan_id": kid, "packet_no": p["packet_no"], "process": p["process"],
                "date": "2026-06-02", "karigar_id": None, "karigar_name": "LT_K", "pcs": 2, "weight": 10.0,
                "hw": "", "ds": "", "tops": 0, "expected_return_pcs": 0, "notes": "",
                "returned": True, "return_date": "2026-06-03", "return_pcs": 2, "return_weight": 9.5,
                "return_boil": 9.5, "rc": 0.5, "nail_rc": 0.0, "ls_opening": "",
                "net_weight": 9.0, "loss": 0.5, "loss_pct": 5.0, "return_pct": 95.0, "weight_gain": 0.0,
                "size": 5.0, "jangad_no": f"LT-{k:05d}", "created_at": now, "created_by": "seed",
            })
        await db.entries.insert_many(entries)
    print("kapans:", await db.kapans.count_documents({}),
          "packets:", await db.packets.count_documents({}),
          "entries:", await db.entries.count_documents({}))


asyncio.run(main(int(sys.argv[1]), int(sys.argv[2])))
