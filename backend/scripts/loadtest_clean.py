"""Remove all LOADTEST data."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import db  # noqa: E402


async def main():
    kids = [k["_id"] async for k in db.kapans.find({"type": "LOADTEST"}, {"_id": 1})]
    await db.entries.delete_many({"kapan_id": {"$in": kids}})
    await db.packets.delete_many({"kapan_id": {"$in": kids}})
    await db.kapans.delete_many({"_id": {"$in": kids}})
    print("removed", len(kids), "loadtest kapans;",
          "packets left:", await db.packets.count_documents({}),
          "entries left:", await db.entries.count_documents({}))


asyncio.run(main())
