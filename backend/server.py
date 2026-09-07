from core import (
    db,
    client,
    get_current_user,
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    set_auth_cookies,
    now_utc,
    require,
)

import os
import logging
from datetime import timedelta
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware

from models import (
    PROCESSES,
    PROCESS_LABELS,
    EntryCreate,
    EntryReturn,
    EntryUpdate,
    KapanCreate,
    KarigarCreate,
    LoginRequest,
    BulkProcessPackets,
    JangadCreate,
    PacketCreate,
    PrintSettings,
    Permissions,
    UserCreate,
    UserUpdate,
)

app = FastAPI(title="Polki Manufacturing Tracker")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

LOSS_PROCESSES = {"laser", "shape", "ghat", "polish", "table_polish", "nats", "filling"}


async def next_packet_code() -> str:
    """Global, never-reused 5-digit packet identifier (00001, 00002, ...)."""
    doc = await db.counters.find_one_and_update(
        {"_id": "packet_code"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"{doc['seq']:05d}"


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid id")


def r2(v) -> float:
    """Round half-up to 2 decimals so backend matches the UI preview."""
    from decimal import Decimal, ROUND_HALF_UP
    return float(Decimal(str(float(v or 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_entry(doc: dict) -> dict:
    """Fill derived fields. Loss comes off the Return Boil; RC / Nail RC are
    allocations out of the boil, and whatever is left carries forward."""
    process = doc.get("process")
    weight = r2(doc.get("weight"))
    pcs = int(doc.get("pcs") or 0)
    doc["size"] = r2(weight / pcs) if pcs else 0.0
    doc["weight"] = weight
    if process == "laser":
        doc["tops"] = int(doc.get("tops") or 0)
        doc["expected_return_pcs"] = int(doc.get("expected_return_pcs") or 0)
    else:
        doc["tops"] = 0
        doc["expected_return_pcs"] = 0

    if not doc.get("returned"):
        for k in ("loss", "loss_pct", "return_pct", "weight_gain", "net_weight"):
            doc[k] = 0.0
        return doc

    rw = r2(doc.get("return_weight"))
    boil = r2(doc.get("return_boil"))
    rc = r2(doc.get("rc"))
    nail_rc = r2(doc.get("nail_rc"))
    doc["return_weight"], doc["return_boil"], doc["rc"], doc["nail_rc"] = rw, boil, rc, nail_rc

    doc["net_weight"] = r2(boil - rc - nail_rc)
    if process == "filling":
        doc["weight_gain"] = r2(boil - weight)
        doc["loss"] = 0.0
        doc["loss_pct"] = 0.0
    else:
        doc["weight_gain"] = 0.0
        doc["loss"] = r2(weight - boil)
        doc["loss_pct"] = r2((doc["loss"] / weight * 100) if weight else 0)
    doc["return_pct"] = r2((rw / weight * 100) if weight else 0)
    return doc


def validate_return(process: str, issued: float, payload_like: dict) -> None:
    """Shared guard for receiving and editing a return."""
    boil = r2(payload_like.get("return_boil"))
    rc = r2(payload_like.get("rc"))
    nail_rc = r2(payload_like.get("nail_rc"))
    if boil <= 0:
        raise HTTPException(status_code=400, detail="Return boil must be greater than 0")
    if process == "filling":
        if boil < issued - 0.001:
            raise HTTPException(
                status_code=400,
                detail=f"Filling adds weight — return boil cannot be less than issued {issued:.2f} cts",
            )
    elif boil > issued + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Return boil ({boil:.2f}) cannot exceed issued weight {issued:.2f} cts",
        )
    if rc + nail_rc > boil + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"RC + Nail RC ({rc + nail_rc:.2f}) cannot exceed the return boil {boil:.2f} cts",
        )


def serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
    doc.pop("password_hash", None)
    if "created_at" in doc and not isinstance(doc["created_at"], str):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


# ---------------------------------------------------------------- auth
@api.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        if now_utc() - attempt["last_attempt"].replace(tzinfo=attempt["last_attempt"].tzinfo or None) < timedelta(minutes=15):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
        await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last_attempt": now_utc()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Account is disabled")

    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    set_auth_cookies(response, access, create_refresh_token(uid))
    out = serialize(user)
    out["token"] = access
    return out


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    import jwt as _jwt
    from core import get_jwt_secret, JWT_ALGORITHM
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = _jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except _jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user["_id"]), user["email"])
    set_auth_cookies(response, access, create_refresh_token(str(user["_id"])))
    return {"token": access}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    user["id"] = user.pop("_id")
    if not isinstance(user.get("created_at"), str) and user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()
    return user


# ---------------------------------------------------------------- users / staff
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    require(user, "can_manage_staff")
    docs = await db.users.find().sort("created_at", 1).to_list(500)
    return [serialize(d) for d in docs]


@api.post("/users")
async def create_user(payload: UserCreate, user: dict = Depends(get_current_user)):
    require(user, "can_manage_staff")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    perms = payload.permissions.model_dump()
    if payload.role == "admin":
        perms = {k: True for k in perms}
    doc = {
        "name": payload.name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "permissions": perms,
        "active": True,
        "created_at": now_utc(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(get_current_user)):
    require(user, "can_manage_staff")
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.active is not None:
        updates["active"] = payload.active
    if payload.permissions is not None:
        perms = payload.permissions.model_dump()
        if updates.get("role") == "admin":
            perms = {k: True for k in perms}
        updates["permissions"] = perms
    if payload.password:
        updates["password_hash"] = hash_password(payload.password)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    doc = await db.users.find_one_and_update({"_id": oid(user_id)}, {"$set": updates}, return_document=True)
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize(doc)


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_manage_staff")
    if user_id == user["_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    res = await db.users.delete_one({"_id": oid(user_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ---------------------------------------------------------------- karigars
@api.get("/karigars")
async def list_karigars(process: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"active": True, "processes": process} if process else {}
    docs = await db.karigars.find(q).sort("name", 1).to_list(1000)
    return [serialize(d) for d in docs]


@api.post("/karigars")
async def create_karigar(payload: KarigarCreate, user: dict = Depends(get_current_user)):
    require(user, "can_manage_karigar")
    doc = payload.model_dump()
    doc["created_at"] = now_utc()
    res = await db.karigars.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api.put("/karigars/{karigar_id}")
async def update_karigar(karigar_id: str, payload: KarigarCreate, user: dict = Depends(get_current_user)):
    require(user, "can_edit")
    doc = await db.karigars.find_one_and_update(
        {"_id": oid(karigar_id)}, {"$set": payload.model_dump()}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Karigar not found")
    return serialize(doc)


@api.delete("/karigars/{karigar_id}")
async def delete_karigar(karigar_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_delete")
    res = await db.karigars.delete_one({"_id": oid(karigar_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Karigar not found")
    return {"ok": True}


# ---------------------------------------------------------------- kapans
async def build_report(kapan_id: ObjectId, kapan: dict) -> dict:
    entries = await db.entries.find({"kapan_id": kapan_id}).to_list(5000)
    packets = await db.packets.find({"kapan_id": kapan_id}).to_list(2000)
    stage_order = {p: i for i, p in enumerate(PROCESSES)}
    POLISHED = {"polish", "table_polish", "nats", "filling"}

    b = {"rc": 0.0, "nail_rc": 0.0, "boil": 0.0, "laser_loss": 0.0, "shape_ghat_loss": 0.0,
         "polish_loss": 0.0, "nats_loss": 0.0, "other_loss": 0.0, "filling_gain": 0.0}
    LOSS_BUCKET = {
        "sarine": "other_loss", "marking": "other_loss", "laser": "laser_loss",
        "shape": "shape_ghat_loss", "ghat": "shape_ghat_loss",
        "polish": "polish_loss", "table_polish": "polish_loss", "nats": "nats_loss",
    }
    for e in entries:
        if not e.get("returned"):
            continue
        b["rc"] += r2(e.get("rc"))
        b["nail_rc"] += r2(e.get("nail_rc"))
        b["boil"] += r2(e.get("return_boil"))
        p = e.get("process")
        if p == "filling":
            b["filling_gain"] += r2(e.get("weight_gain"))
        else:
            b[LOSS_BUCKET.get(p, "other_loss")] += r2(e.get("loss"))

    issued = [p for p in packets if p.get("status") == "issued"]
    in_stock = [p for p in packets if p.get("status") != "issued"]
    in_process_weight = r2(sum(r2(p.get("weight")) for p in issued))
    polish_weight = r2(sum(r2(p.get("weight")) for p in in_stock if p.get("last_process") in POLISHED))
    stock_weight = r2(sum(r2(p.get("weight")) for p in in_stock if p.get("last_process") not in POLISHED))
    packeted = r2(sum(r2(p.get("original_weight")) for p in packets))
    kapan_weight = r2(kapan.get("weight"))
    unpacketed = r2(kapan_weight - packeted)

    accounted = r2(
        b["rc"] + b["nail_rc"] + b["laser_loss"] + b["shape_ghat_loss"]
        + b["polish_loss"] + b["nats_loss"] + b["other_loss"] + in_process_weight + polish_weight
        + stock_weight + unpacketed - b["filling_gain"]
    )

    report = {k: r2(v) for k, v in b.items()}
    report.update({
        "kapan_weight": kapan_weight,
        "in_process_weight": in_process_weight,
        "in_process_pcs": sum(int(p.get("pcs") or 0) for p in issued),
        "polish_weight": polish_weight,
        "stock_weight": stock_weight,
        "packeted_weight": packeted,
        "unpacketed_weight": unpacketed,
        "accounted_weight": accounted,
        "difference": r2(kapan_weight - accounted),
        "packet_count": len(packets),
        "issued_count": len(issued),
        "entries_count": len(entries),
        "open_count": len(issued),
    })
    report["balanced"] = abs(report["difference"]) <= 0.02

    open_stages = sorted({e.get("process") for e in entries if not e.get("returned")},
                         key=lambda p: stage_order.get(p, 99))
    done_stages = sorted({e.get("process") for e in entries if e.get("returned")},
                         key=lambda p: stage_order.get(p, 99))
    report["current_stage"] = open_stages[-1] if open_stages else (done_stages[-1] if done_stages else None)
    report["current_stage_label"] = PROCESS_LABELS.get(report["current_stage"], "Not Started")
    report["status"] = "In Process" if open_stages else ("Idle" if done_stages else "New")
    return report


@api.get("/kapans")
async def list_kapans(user: dict = Depends(get_current_user)):
    kapans = await db.kapans.find().sort("created_at", -1).to_list(1000)
    out = []
    for k in kapans:
        item = serialize(k)
        item["report"] = await build_report(k["_id"], k)
        out.append(item)
    return out


@api.post("/kapans")
async def create_kapan(payload: KapanCreate, user: dict = Depends(get_current_user)):
    require(user, "can_create")
    if await db.kapans.find_one({"kapan_no": payload.kapan_no}):
        raise HTTPException(status_code=400, detail="Kapan No already exists")
    doc = payload.model_dump()
    doc["weight"] = r2(doc["weight"])
    doc["size"] = r2(doc["weight"] / doc["pcs"]) if doc["pcs"] else 0.0
    doc["created_at"] = now_utc()
    doc["created_by"] = user.get("name")
    res = await db.kapans.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api.get("/kapans/{kapan_id}")
async def get_kapan(kapan_id: str, user: dict = Depends(get_current_user)):
    _id = oid(kapan_id)
    kapan = await db.kapans.find_one({"_id": _id})
    if not kapan:
        raise HTTPException(status_code=404, detail="Kapan not found")
    entries = await db.entries.find({"kapan_id": _id}).sort("created_at", 1).to_list(5000)
    packets = await db.packets.find({"kapan_id": _id}).sort("seq", 1).to_list(2000)
    pmap = {p["_id"]: p for p in packets}
    out = serialize(kapan)
    out["report"] = await build_report(_id, kapan)
    out["packets"] = [serialize(p) for p in packets]
    out["entries"] = [
        {**serialize(e), "packet_no": (pmap.get(e.get("packet_id")) or {}).get("packet_no", "")}
        for e in entries
    ]
    return out


@api.put("/kapans/{kapan_id}")
async def update_kapan(kapan_id: str, payload: KapanCreate, user: dict = Depends(get_current_user)):
    require(user, "can_edit")
    doc = payload.model_dump()
    doc["weight"] = r2(doc["weight"])
    doc["size"] = r2(doc["weight"] / doc["pcs"]) if doc["pcs"] else 0.0
    updated = await db.kapans.find_one_and_update({"_id": oid(kapan_id)}, {"$set": doc}, return_document=True)
    if not updated:
        raise HTTPException(status_code=404, detail="Kapan not found")
    return serialize(updated)


@api.delete("/kapans/{kapan_id}")
async def delete_kapan(kapan_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_delete")
    _id = oid(kapan_id)
    res = await db.kapans.delete_one({"_id": _id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Kapan not found")
    await db.entries.delete_many({"kapan_id": _id})
    await db.packets.delete_many({"kapan_id": _id})
    return {"ok": True}


# ---------------------------------------------------------------- packets
@api.get("/packets")
async def list_packets(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"status": status} if status else {}
    docs = await db.packets.find(q).sort("created_at", -1).to_list(3000)
    kapans = {k["_id"]: k for k in await db.kapans.find().to_list(2000)}
    out = []
    for d in docs:
        item = serialize(d)
        k = kapans.get(d.get("kapan_id"))
        item["kapan_no"] = k.get("kapan_no") if k else ""
        item["kapan_type"] = k.get("type") if k else ""
        out.append(item)
    return out


@api.post("/kapans/{kapan_id}/packets")
async def create_packet(kapan_id: str, payload: PacketCreate, user: dict = Depends(get_current_user)):
    require(user, "can_create")
    _kid = oid(kapan_id)
    kapan = await db.kapans.find_one({"_id": _kid})
    if not kapan:
        raise HTTPException(status_code=404, detail="Kapan not found")
    weight = r2(payload.weight)
    if weight <= 0:
        raise HTTPException(status_code=400, detail="Weight must be greater than 0")

    existing = await db.packets.find({"kapan_id": _kid}).to_list(2000)
    packeted = r2(sum(r2(p.get("original_weight")) for p in existing))
    remaining = r2(r2(kapan.get("weight")) - packeted)
    if weight > remaining + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Only {remaining:.2f} cts remaining un-packeted in this kapan",
        )
    seq = max([int(p.get("seq") or 0) for p in existing], default=0) + 1
    doc = {
        "kapan_id": _kid,
        "seq": seq,
        "code": await next_packet_code(),
        "packet_no": payload.packet_no or f"{kapan['kapan_no']}-{seq:02d}",
        "date": payload.date,
        "pcs": int(payload.pcs or 0),
        "weight": weight,
        "original_pcs": int(payload.pcs or 0),
        "original_weight": weight,
        "size": r2(weight / payload.pcs) if payload.pcs else 0.0,
        "status": "in_stock",
        "last_process": None,
        "notes": payload.notes or "",
        "created_at": now_utc(),
        "created_by": user.get("name"),
    }
    res = await db.packets.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api.post("/kapans/{kapan_id}/process-packets")
async def create_process_packets(kapan_id: str, payload: BulkProcessPackets, user: dict = Depends(get_current_user)):
    """Create several packets from a kapan's un-packeted rough, tagged to one process register."""
    require(user, "can_create")
    if payload.process not in PROCESSES:
        raise HTTPException(status_code=400, detail="Unknown process")
    rows = [r for r in payload.rows if r.weight and r.weight > 0]
    if not rows:
        raise HTTPException(status_code=400, detail="Add at least one packet row with a weight")

    _kid = oid(kapan_id)
    kapan = await db.kapans.find_one({"_id": _kid})
    if not kapan:
        raise HTTPException(status_code=404, detail="Kapan not found")

    existing = await db.packets.find({"kapan_id": _kid}).to_list(2000)
    remaining = r2(r2(kapan.get("weight")) - r2(sum(r2(p.get("original_weight")) for p in existing)))
    total = r2(sum(r2(r.weight) for r in rows))
    if total > remaining + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Total {total:.2f} cts exceeds the {remaining:.2f} cts remaining un-packeted in this kapan",
        )

    seq = max([int(p.get("seq") or 0) for p in existing], default=0)
    created = []
    for row in rows:
        seq += 1
        weight, pcs = r2(row.weight), int(row.pcs or 0)
        packet = {
            "kapan_id": _kid,
            "seq": seq,
            "code": await next_packet_code(),
            "packet_no": f"{kapan['kapan_no']}-{seq:02d}",
            "process": payload.process,
            "date": payload.date,
            "pcs": pcs,
            "weight": weight,
            "original_pcs": pcs,
            "original_weight": weight,
            "size": r2(weight / pcs) if pcs else 0.0,
            "status": "in_stock",
            "hw": (row.hw or "") if payload.process == "laser" else "",
            "ds": (row.ds or "") if payload.process == "polish" else "",
            "tops": int(row.tops or 0) if payload.process == "laser" else 0,
            "expected_return_pcs": int(row.expected_return_pcs or 0) if payload.process == "laser" else 0,
            "last_process": None,
            "current_process": None,
            "notes": "",
            "created_at": now_utc(),
            "created_by": user.get("name"),
        }
        res = await db.packets.insert_one(packet)
        packet["_id"] = res.inserted_id
        created.append(serialize(packet))

    return {"created": created, "count": len(created), "total_weight": total}


@api.post("/jangads")
async def create_jangad(payload: JangadCreate, user: dict = Depends(get_current_user)):
    """Issue several packets to one karigar under a single jangad number."""
    require(user, "can_create")
    if payload.process not in PROCESSES:
        raise HTTPException(status_code=400, detail="Unknown process")
    if not payload.packet_ids:
        raise HTTPException(status_code=400, detail="Select at least one packet to issue")

    ids = [oid(p) for p in payload.packet_ids]
    packets = await db.packets.find({"_id": {"$in": ids}}).to_list(500)
    if len(packets) != len(ids):
        raise HTTPException(status_code=404, detail="One or more packets not found")
    busy = [p["packet_no"] for p in packets if p.get("status") == "issued"]
    if busy:
        raise HTTPException(status_code=400, detail=f"Already issued and not received: {', '.join(busy)}")

    jangad_no = await next_jangad_no()
    entries = []
    for packet in packets:
        entry = {
            "packet_id": packet["_id"],
            "kapan_id": packet["kapan_id"],
            "packet_no": packet.get("packet_no"),
            "process": payload.process,
            "date": payload.date,
            "karigar_id": payload.karigar_id,
            "karigar_name": payload.karigar_name,
            "pcs": int(packet.get("pcs") or 0),
            "weight": r2(packet.get("weight")),
            "hw": (packet.get("hw") or "") if payload.process == "laser" else "",
            "ds": (packet.get("ds") or "") if payload.process == "polish" else "",
            "tops": int(packet.get("tops") or 0) if payload.process == "laser" else 0,
            "expected_return_pcs": int(packet.get("expected_return_pcs") or 0) if payload.process == "laser" else 0,
            "notes": payload.notes or "",
            "prev_process": packet.get("last_process"),
            "returned": False,
            "return_date": None,
            "return_pcs": 0,
            "return_weight": 0.0,
            "return_boil": 0.0,
            "rc": 0.0,
            "nail_rc": 0.0,
            "ls_opening": "",
            "jangad_no": jangad_no,
            "created_at": now_utc(),
            "created_by": user.get("name"),
        }
        compute_entry(entry)
        res = await db.entries.insert_one(entry)
        entry["_id"] = res.inserted_id
        entries.append(serialize(entry))
        await db.packets.update_one(
            {"_id": packet["_id"]},
            {"$set": {"status": "issued", "current_process": payload.process}},
        )

    return {
        "jangad_no": jangad_no,
        "count": len(entries),
        "total_weight": r2(sum(e["weight"] for e in entries)),
        "entries": entries,
    }


@api.get("/jangads/{jangad_no}")
async def get_jangad_by_no(jangad_no: str, user: dict = Depends(get_current_user)):
    entries = await db.entries.find({"jangad_no": jangad_no}).sort("created_at", 1).to_list(500)
    if not entries:
        raise HTTPException(status_code=404, detail="Jangad not found")
    kapans = {k["_id"]: k for k in await db.kapans.find().to_list(2000)}
    first = entries[0]
    kapan = kapans.get(first["kapan_id"]) or {}
    return {
        "jangad_no": jangad_no,
        "date": first.get("date"),
        "process": first.get("process"),
        "process_label": PROCESS_LABELS.get(first.get("process"), first.get("process")),
        "karigar_name": first.get("karigar_name") or "",
        "issued_by": first.get("created_by") or "",
        "kapan_no": kapan.get("kapan_no", ""),
        "kapan_type": kapan.get("type", ""),
        "hw": first.get("hw") or "",
        "ds": first.get("ds") or "",
        "tops": first.get("tops") or 0,
        "expected_return_pcs": first.get("expected_return_pcs") or 0,
        "total_pcs": sum(int(e.get("pcs") or 0) for e in entries),
        "total_weight": r2(sum(r2(e.get("weight")) for e in entries)),
        "returned_all": all(e.get("returned") for e in entries),
        "lines": [
            {
                **serialize(e),
                "kapan_no": (kapans.get(e["kapan_id"]) or {}).get("kapan_no", ""),
            }
            for e in entries
        ],
    }


# ---------------------------------------------------------------- print settings
@api.get("/settings/print")
async def get_print_settings(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"_id": "print"})
    defaults = PrintSettings().model_dump()
    if doc:
        doc.pop("_id", None)
        defaults.update({k: v for k, v in doc.items() if k in defaults})
    return defaults


@api.put("/settings/print")
async def update_print_settings(payload: PrintSettings, user: dict = Depends(get_current_user)):
    require(user, "can_manage_staff")
    data = payload.model_dump()
    if data["sticker_width_in"] <= 0 or data["sticker_height_in"] <= 0:
        raise HTTPException(status_code=400, detail="Sticker size must be greater than 0")
    await db.settings.update_one({"_id": "print"}, {"$set": data}, upsert=True)
    return data


@api.get("/packets/labels")
async def packet_labels(ids: str = "", user: dict = Depends(get_current_user)):
    id_list = [oid(i) for i in ids.split(",") if i.strip()]
    if not id_list:
        raise HTTPException(status_code=400, detail="No packets selected")
    packets = await db.packets.find({"_id": {"$in": id_list}}).sort("seq", 1).to_list(500)
    kapans = {k["_id"]: k for k in await db.kapans.find().to_list(2000)}
    # Label serial matches the process register's # column: position of the packet
    # among that kapan's packets in the same process, ordered by creation sequence.
    serials = {}
    for kid, proc in {(p["kapan_id"], p.get("process")) for p in packets}:
        siblings = await db.packets.find({"kapan_id": kid, "process": proc}).sort("seq", 1).to_list(2000)
        for i, s in enumerate(siblings, start=1):
            serials[s["_id"]] = i
    return [
        {
            "id": str(p["_id"]),
            "seq": serials.get(p["_id"], p.get("seq")),
            "code": p.get("code") or "",
            "packet_no": p.get("packet_no"),
            "kapan_no": (kapans.get(p["kapan_id"]) or {}).get("kapan_no", ""),
            "pcs": int(p.get("pcs") or 0),
            "weight": r2(p.get("weight")),
            "size": r2(p.get("size")),
            "process": p.get("process"),
        }
        for p in packets
    ]


@api.delete("/packets/{packet_id}")
async def delete_packet(packet_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_delete")
    _id = oid(packet_id)
    if await db.entries.count_documents({"packet_id": _id}):
        raise HTTPException(status_code=400, detail="Packet has process entries — delete those first")
    res = await db.packets.delete_one({"_id": _id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Packet not found")
    return {"ok": True}


# ---------------------------------------------------------------- entries (packet issue / receive)
async def next_jangad_no() -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": "jangad"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"JG-{doc['seq']:05d}"


@api.get("/entries")
async def list_entries(
    status: Optional[str] = None,
    process: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if status == "open":
        q["returned"] = False
    elif status == "closed":
        q["returned"] = True
    if process:
        q["process"] = process
    docs = await db.entries.find(q).sort("created_at", -1).to_list(3000)
    kapans = {k["_id"]: k for k in await db.kapans.find().to_list(2000)}
    out = []
    for d in docs:
        item = serialize(d)
        k = kapans.get(d.get("kapan_id"))
        item["kapan_no"] = k.get("kapan_no") if k else ""
        item["kapan_type"] = k.get("type") if k else ""
        out.append(item)
    return out


@api.post("/entries")
async def create_entry(payload: EntryCreate, user: dict = Depends(get_current_user)):
    require(user, "can_create")
    if payload.process not in PROCESSES:
        raise HTTPException(status_code=400, detail="Unknown process")
    _pid = oid(payload.packet_id)
    packet = await db.packets.find_one({"_id": _pid})
    if not packet:
        raise HTTPException(status_code=404, detail="Packet not found")
    if packet.get("status") == "issued":
        raise HTTPException(status_code=400, detail="Packet is already issued and not yet received")

    doc = payload.model_dump()
    doc.pop("packet_id", None)
    if payload.process != "laser":
        doc["hw"] = ""
        doc["expected_return_pcs"] = 0
        doc["tops"] = 0
    if payload.process != "polish":
        doc["ds"] = ""
    doc.update({
        "packet_id": _pid,
        "kapan_id": packet["kapan_id"],
        "packet_no": packet.get("packet_no"),
        "pcs": int(packet.get("pcs") or 0),
        "weight": r2(packet.get("weight")),
        "prev_process": packet.get("last_process"),
        "returned": False,
        "return_date": None,
        "return_pcs": 0,
        "return_weight": 0.0,
        "return_boil": 0.0,
        "rc": 0.0,
        "nail_rc": 0.0,
        "ls_opening": "",
        "jangad_no": await next_jangad_no(),
        "created_at": now_utc(),
        "created_by": user.get("name"),
    })
    compute_entry(doc)
    res = await db.entries.insert_one(doc)
    doc["_id"] = res.inserted_id
    await db.packets.update_one({"_id": _pid}, {"$set": {"status": "issued", "current_process": payload.process}})
    return serialize(doc)


@api.post("/entries/{entry_id}/receive")
async def receive_entry(entry_id: str, payload: EntryReturn, user: dict = Depends(get_current_user)):
    require(user, "can_create")
    _id = oid(entry_id)
    entry = await db.entries.find_one({"_id": _id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.get("returned"):
        raise HTTPException(status_code=400, detail="This packet has already been received")

    issued_weight = r2(entry.get("weight"))
    validate_return(entry.get("process"), issued_weight, payload.model_dump())

    entry.update({k: v for k, v in payload.model_dump().items() if v is not None})
    entry["returned"] = True
    entry["received_by"] = user.get("name")
    compute_entry(entry)
    entry.pop("_id", None)
    await db.entries.update_one({"_id": _id}, {"$set": entry})
    entry["_id"] = _id

    net = r2(entry.get("net_weight"))
    await db.packets.update_one(
        {"_id": entry["packet_id"]},
        {"$set": {
            "status": "in_stock",
            "weight": net,
            "pcs": int(payload.return_pcs or 0),
            "size": r2(net / payload.return_pcs) if payload.return_pcs else 0.0,
            "last_process": entry.get("process"),
            "current_process": None,
        }},
    )
    return serialize(entry)


@api.put("/entries/{entry_id}")
async def update_entry(entry_id: str, payload: EntryUpdate, user: dict = Depends(get_current_user)):
    """Correct an entry's issue and/or return figures. Keeps the packet in sync."""
    require(user, "can_edit")
    _id = oid(entry_id)
    entry = await db.entries.find_one({"_id": _id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    entry.update(data)
    if entry.get("process") != "laser":
        entry["hw"], entry["expected_return_pcs"], entry["tops"] = "", 0, 0
    if entry.get("process") != "polish":
        entry["ds"] = ""

    issued = r2(entry.get("weight"))
    if issued <= 0:
        raise HTTPException(status_code=400, detail="Issue weight must be greater than 0")

    # A packet can never be issued for more than it actually weighs at that point.
    packet = await db.packets.find_one({"_id": entry["packet_id"]})
    prior = await db.entries.count_documents({
        "packet_id": entry["packet_id"],
        "created_at": {"$lt": entry.get("created_at")},
    })
    if prior == 0 and packet and issued > r2(packet.get("original_weight")) + 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Issue weight cannot exceed the packet's created weight {r2(packet.get('original_weight')):.2f} cts",
        )
    # Correcting the packet's very first issue also corrects the packet's created figures,
    # otherwise the kapan would show a permanent unaccounted gap.
    if prior == 0 and packet:
        await db.packets.update_one(
            {"_id": packet["_id"]},
            {"$set": {"original_weight": issued, "original_pcs": int(entry.get("pcs") or 0)}},
        )

    if entry.get("returned"):
        if entry.get("process") != "laser" and int(entry.get("return_pcs") or 0) > int(entry.get("pcs") or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Return pcs cannot exceed issued pcs ({int(entry.get('pcs') or 0)})",
            )
        validate_return(entry.get("process"), issued, entry)

    compute_entry(entry)
    entry["edited_by"] = user.get("name")
    entry["edited_at"] = now_utc()
    entry.pop("_id", None)
    await db.entries.update_one({"_id": _id}, {"$set": entry})
    entry["_id"] = _id

    # Only the packet's most recent entry defines its current weight.
    newer = await db.entries.count_documents({
        "packet_id": entry["packet_id"],
        "created_at": {"$gt": entry.get("created_at")},
    })
    if not newer:
        if entry.get("returned"):
            pcs = int(entry.get("return_pcs") or 0)
            wt = r2(entry.get("net_weight"))
            last_process = entry.get("process")
            status = "in_stock"
        else:
            pcs = int(entry.get("pcs") or 0)
            wt = issued
            last_process = entry.get("prev_process")
            status = "issued"
        await db.packets.update_one(
            {"_id": entry["packet_id"]},
            {"$set": {
                "status": status,
                "pcs": pcs,
                "weight": wt,
                "size": r2(wt / pcs) if pcs else 0.0,
                "last_process": last_process,
                "current_process": None if status == "in_stock" else entry.get("process"),
            }},
        )
    return serialize(entry)


@api.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_delete")
    _id = oid(entry_id)
    entry = await db.entries.find_one({"_id": _id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    later = await db.entries.count_documents({
        "packet_id": entry.get("packet_id"),
        "created_at": {"$gt": entry.get("created_at")},
    })
    if later:
        raise HTTPException(status_code=400, detail="Delete the newer entries of this packet first")
    await db.entries.delete_one({"_id": _id})
    await db.packets.update_one(
        {"_id": entry.get("packet_id")},
        {"$set": {
            "status": "in_stock",
            "weight": r2(entry.get("weight")),
            "pcs": int(entry.get("pcs") or 0),
            "size": r2(entry.get("size")),
            "last_process": entry.get("prev_process"),
            "current_process": None,
        }},
    )
    return {"ok": True}


@api.get("/entries/{entry_id}/jangad")
async def get_jangad(entry_id: str, user: dict = Depends(get_current_user)):
    entry = await db.entries.find_one({"_id": oid(entry_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    kapan = await db.kapans.find_one({"_id": entry["kapan_id"]})
    out = serialize(entry)
    out["kapan_no"] = kapan.get("kapan_no") if kapan else ""
    out["kapan_type"] = kapan.get("type") if kapan else ""
    out["process_label"] = PROCESS_LABELS.get(entry.get("process"), entry.get("process"))
    return out


# ---------------------------------------------------------------- dashboard
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    kapans = await db.kapans.find().to_list(2000)
    entries = await db.entries.find().to_list(10000)
    packets = await db.packets.find().to_list(5000)
    total_weight = r2(sum(r2(k.get("weight")) for k in kapans))
    in_process = r2(sum(r2(p.get("weight")) for p in packets if p.get("status") == "issued"))
    total_loss = r2(sum(r2(e.get("loss")) for e in entries if e.get("returned")))
    by_process = {}
    for p in PROCESSES:
        rel = [e for e in entries if e.get("process") == p]
        by_process[p] = {
            "label": PROCESS_LABELS[p],
            "open": sum(1 for e in rel if not e.get("returned")),
            "open_weight": r2(sum(r2(e.get("weight")) for e in rel if not e.get("returned"))),
            "loss": r2(sum(r2(e.get("loss")) for e in rel if e.get("returned"))),
        }
    return {
        "kapan_count": len(kapans),
        "total_weight": total_weight,
        "in_process_weight": in_process,
        "total_loss": total_loss,
        "open_jangads": len({e.get("jangad_no") for e in entries if not e.get("returned") and e.get("jangad_no")}),
        "packet_count": len(packets),
        "stock_packets": sum(1 for p in packets if p.get("status") != "issued"),
        "karigar_count": await db.karigars.count_documents({"active": True}),
        "by_process": by_process,
    }


@api.get("/meta/processes")
async def meta_processes():
    return [{"key": p, "label": PROCESS_LABELS[p]} for p in PROCESSES]


@api.get("/")
async def root():
    return {"status": "ok", "service": "polki-tracker"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.entries.create_index("kapan_id")
    await db.entries.create_index("packet_id")
    await db.packets.create_index("kapan_id")
    await db.kapans.create_index("kapan_no", unique=True)

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    all_perms = {k: True for k in Permissions().model_dump()}
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "name": "Admin", "email": admin_email,
            "password_hash": hash_password(admin_password), "role": "admin",
            "permissions": all_perms, "active": True, "created_at": now_utc(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password),
                                            "role": "admin", "permissions": all_perms}})

    if not await db.users.find_one({"email": "staff@polki.com"}):
        await db.users.insert_one({
            "name": "Staff User", "email": "staff@polki.com",
            "password_hash": hash_password("staff123"), "role": "staff",
            "permissions": {"can_create": True, "can_edit": True, "can_delete": False,
                            "can_manage_staff": False, "can_manage_karigar": True},
            "active": True, "created_at": now_utc(),
        })


@app.on_event("shutdown")
async def shutdown():
    client.close()
