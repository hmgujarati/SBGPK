"""One-off: give existing packets a 5-digit code and seed the counter."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import db  # noqa: E402


async def main():
    n = 0
    async for p in db.packets.find({"code": {"$in": [None, ""]}}).sort("created_at", 1):
        doc = await db.counters.find_one_and_update(
            {"_id": "packet_code"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
        )
        await db.packets.update_one({"_id": p["_id"]}, {"$set": {"code": f"{doc['seq']:05d}"}})
        n += 1
    print(f"backfilled {n} packets")


asyncio.run(main())
