"""Recompute every kapan's reconciliation straight against a restored copy of the live DB."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CHECK_DB", "livecheck")
import core
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

cfg = dotenv_values("/app/backend/.env")
core.db = AsyncIOMotorClient(cfg["MONGO_URL"])[os.environ["CHECK_DB"]]
import server
server.db = core.db


async def main():
    kapans = await core.db.kapans.find({}).to_list(None)
    reports = await server.build_reports(kapans)
    bad = 0
    for k in sorted(kapans, key=lambda x: str(x.get("kapan_no"))):
        r = reports[k["_id"]]
        flag = "" if r["balanced"] else "  <-- UNBALANCED"
        if not r["balanced"]:
            bad += 1
        if k.get("kapan_no", "").startswith("516.06") or not r["balanced"]:
            print(f"{k.get('kapan_no'):>12} w={r['kapan_weight']:>7} rc={r['rc']:>5} "
                  f"loss={r2_sum(r):>5} palchu={r['palchu_available']:>6} "
                  f"inproc={r['in_process_weight']:>6} stock={r['stock_weight']:>6} "
                  f"alloc={r['allocated_weight']:>6} unpk={r['unpacketed_weight']:>6} "
                  f"acc={r['accounted_weight']:>7} diff={r['difference']:>6} drift={r['stock_drift']}{flag}")
    print(f"\n{len(kapans)} kapans, unbalanced: {bad}")


def r2_sum(r):
    return round(r["laser_loss"] + r["shape_ghat_loss"] + r["polish_loss"]
                 + r["nats_loss"] + r["other_loss"], 2)


asyncio.run(main())
