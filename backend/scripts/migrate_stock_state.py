"""One-time backfill: an in-stock packet is free stock ("returned") only if it has
actually come back from a process; otherwise it is a created-but-unissued packet ("fresh").
"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import db


async def main():
    fresh = returned = 0
    async for p in db.packets.find({"status": "in_stock"}, {"_id": 1}):
        has_return = await db.entries.count_documents({"packet_id": p["_id"], "returned": True})
        state = "returned" if has_return else "fresh"
        await db.packets.update_one({"_id": p["_id"]}, {"$set": {"stock_state": state}})
        if state == "fresh":
            fresh += 1
        else:
            returned += 1
    print("fresh:", fresh, "returned:", returned)


asyncio.run(main())
