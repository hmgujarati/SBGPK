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
    Permissions,
    UserCreate,
    UserUpdate,
)

app = FastAPI(title="Polki Manufacturing Tracker")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

LOSS_PROCESSES = {"laser", "shape", "ghat", "polish", "table_polish", "nats", "filling"}


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid id")


def r2(v) -> float:
    return round(float(v or 0), 2)


def compute_entry(doc: dict) -> dict:
    """Fill derived fields on a process entry document."""
    process = doc.get("process")
    weight = r2(doc.get("weight"))
    pcs = int(doc.get("pcs") or 0)
    doc["size"] = r2(weight / pcs) if pcs else 0.0
    doc["weight"] = weight

    if not doc.get("returned"):
        for k in ("loss", "loss_pct", "return_pct", "weight_gain"):
            doc[k] = 0.0
        return doc

    rw = r2(doc.get("return_weight"))
    boil = r2(doc.get("return_boil"))
    rc = r2(doc.get("rc"))
    nail_rc = r2(doc.get("nail_rc"))
    doc["return_weight"], doc["return_boil"], doc["rc"], doc["nail_rc"] = rw, boil, rc, nail_rc

    accounted = rw + boil + rc + nail_rc
    if process == "filling":
        doc["weight_gain"] = r2(rw - weight)
        doc["loss"] = 0.0
        doc["loss_pct"] = 0.0
    else:
        doc["weight_gain"] = 0.0
        doc["loss"] = r2(weight - accounted)
        doc["loss_pct"] = r2((doc["loss"] / weight * 100) if weight else 0)
    doc["return_pct"] = r2((rw / weight * 100) if weight else 0)
    return doc


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
    buckets = {
        "rc": 0.0,
        "nail_rc": 0.0,
        "boil": 0.0,
        "laser_loss": 0.0,
        "shape_ghat_loss": 0.0,
        "polish_loss": 0.0,
        "nats_loss": 0.0,
        "filling_gain": 0.0,
        "in_process_weight": 0.0,
        "in_process_pcs": 0,
    }
    stage_order = {p: i for i, p in enumerate(PROCESSES)}
    last_returned = None
    for e in entries:
        p = e.get("process")
        if not e.get("returned"):
            buckets["in_process_weight"] += r2(e.get("weight"))
            buckets["in_process_pcs"] += int(e.get("pcs") or 0)
            continue
        buckets["rc"] += r2(e.get("rc"))
        buckets["nail_rc"] += r2(e.get("nail_rc"))
        buckets["boil"] += r2(e.get("return_boil"))
        loss = r2(e.get("loss"))
        if p == "laser":
            buckets["laser_loss"] += loss
        elif p in ("shape", "ghat"):
            buckets["shape_ghat_loss"] += loss
        elif p in ("polish", "table_polish"):
            buckets["polish_loss"] += loss
        elif p == "nats":
            buckets["nats_loss"] += loss
        elif p == "filling":
            buckets["filling_gain"] += r2(e.get("weight_gain"))
        if last_returned is None or stage_order.get(p, 0) >= stage_order.get(last_returned.get("process"), 0):
            last_returned = e

    polish_weight = 0.0
    if last_returned and last_returned.get("process") in ("polish", "table_polish", "nats", "filling"):
        polish_weight = r2(last_returned.get("return_weight"))

    kapan_weight = r2(kapan.get("weight"))
    accounted = (
        buckets["rc"]
        + buckets["nail_rc"]
        + buckets["boil"]
        + buckets["laser_loss"]
        + buckets["shape_ghat_loss"]
        + buckets["polish_loss"]
        + buckets["nats_loss"]
        + polish_weight
        + buckets["in_process_weight"]
        - buckets["filling_gain"]
    )
    report = {k: r2(v) if k != "in_process_pcs" else v for k, v in buckets.items()}
    report["polish_weight"] = r2(polish_weight)
    report["kapan_weight"] = kapan_weight
    report["accounted_weight"] = r2(accounted)
    report["difference"] = r2(kapan_weight - accounted)
    report["balanced"] = abs(report["difference"]) <= 0.02
    report["entries_count"] = len(entries)
    report["open_count"] = sum(1 for e in entries if not e.get("returned"))
    stages = sorted(
        {e.get("process") for e in entries if e.get("process")},
        key=lambda p: stage_order.get(p, 99),
    )
    report["stages"] = stages
    open_stages = sorted(
        {e.get("process") for e in entries if not e.get("returned")},
        key=lambda p: stage_order.get(p, 99),
    )
    report["current_stage"] = (open_stages[-1] if open_stages else (stages[-1] if stages else None))
    report["current_stage_label"] = PROCESS_LABELS.get(report["current_stage"], "Not Started")
    report["status"] = "In Process" if open_stages else ("Idle" if stages else "New")
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
    entries = await db.entries.find({"kapan_id": _id}).sort("date", 1).to_list(5000)
    out = serialize(kapan)
    out["report"] = await build_report(_id, kapan)
    out["entries"] = [serialize(e) for e in entries]
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
    _kid = oid(payload.kapan_id)
    if not await db.kapans.find_one({"_id": _kid}):
        raise HTTPException(status_code=404, detail="Kapan not found")
    doc = payload.model_dump()
    if payload.process != "laser":
        doc["hw"] = ""
        doc["expected_return_pcs"] = 0
    if payload.process != "polish":
        doc["ds"] = ""
    doc["kapan_id"] = _kid
    doc["returned"] = False
    doc["return_date"] = None
    doc.update({"return_pcs": 0, "return_weight": 0.0, "return_boil": 0.0, "rc": 0.0,
                "nail_rc": 0.0, "ls_opening": ""})
    doc["jangad_no"] = await next_jangad_no()
    doc["created_at"] = now_utc()
    doc["created_by"] = user.get("name")
    compute_entry(doc)
    res = await db.entries.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api.post("/entries/{entry_id}/receive")
async def receive_entry(entry_id: str, payload: EntryReturn, user: dict = Depends(get_current_user)):
    require(user, "can_create")
    _id = oid(entry_id)
    entry = await db.entries.find_one({"_id": _id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.update({k: v for k, v in payload.model_dump().items() if v is not None})
    entry["returned"] = True
    entry["received_by"] = user.get("name")
    compute_entry(entry)
    entry.pop("_id", None)
    await db.entries.update_one({"_id": _id}, {"$set": entry})
    entry["_id"] = _id
    return serialize(entry)


@api.put("/entries/{entry_id}")
async def update_entry(entry_id: str, payload: EntryUpdate, user: dict = Depends(get_current_user)):
    require(user, "can_edit")
    _id = oid(entry_id)
    entry = await db.entries.find_one({"_id": _id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    data.pop("kapan_id", None)
    entry.update(data)
    compute_entry(entry)
    entry.pop("_id", None)
    await db.entries.update_one({"_id": _id}, {"$set": entry})
    entry["_id"] = _id
    return serialize(entry)


@api.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    require(user, "can_delete")
    res = await db.entries.delete_one({"_id": oid(entry_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Entry not found")
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
    total_weight = r2(sum(r2(k.get("weight")) for k in kapans))
    in_process = r2(sum(r2(e.get("weight")) for e in entries if not e.get("returned")))
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
        "open_jangads": sum(1 for e in entries if not e.get("returned")),
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
