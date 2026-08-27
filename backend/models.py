from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from core import BaseDocument

PROCESSES = [
    "sarine",
    "marking",
    "laser",
    "shape",
    "ghat",
    "polish",
    "table_polish",
    "nats",
    "filling",
]

PROCESS_LABELS = {
    "sarine": "Sarine",
    "marking": "Marking",
    "laser": "Laser Sawing",
    "shape": "Shape Cutting",
    "ghat": "Ghat",
    "polish": "Polish",
    "table_polish": "Table Polish",
    "nats": "Nats",
    "filling": "Filling",
}


class Permissions(BaseModel):
    can_create: bool = True
    can_edit: bool = False
    can_delete: bool = False
    can_manage_staff: bool = False
    can_manage_karigar: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "staff"
    permissions: Permissions = Field(default_factory=Permissions)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    permissions: Optional[Permissions] = None


class KarigarCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    processes: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    active: bool = True


class KapanCreate(BaseModel):
    date: str
    kapan_no: str
    type: str = ""
    pcs: int = 0
    weight: float = 0.0
    notes: Optional[str] = ""


class PacketCreate(BaseModel):
    date: str
    pcs: int = 0
    weight: float = 0.0
    packet_no: Optional[str] = None
    notes: Optional[str] = ""


class PacketRow(BaseModel):
    pcs: int = 0
    weight: float = 0.0
    hw: Optional[str] = ""
    ds: Optional[str] = ""
    expected_return_pcs: Optional[int] = 0


class BulkProcessPackets(BaseModel):
    process: str
    date: str
    karigar_id: Optional[str] = None
    karigar_name: str = ""
    rows: List[PacketRow] = Field(default_factory=list)


class EntryCreate(BaseModel):
    packet_id: str
    process: str
    date: str
    karigar_id: Optional[str] = None
    karigar_name: str = ""
    hw: Optional[str] = ""
    ds: Optional[str] = ""
    expected_return_pcs: Optional[int] = 0
    notes: Optional[str] = ""


class EntryReturn(BaseModel):
    return_date: Optional[str] = None
    return_pcs: Optional[int] = 0
    return_weight: Optional[float] = 0.0
    return_boil: Optional[float] = 0.0
    rc: Optional[float] = 0.0
    nail_rc: Optional[float] = 0.0
    ls_opening: Optional[str] = ""
    notes: Optional[str] = ""


class EntryUpdate(EntryReturn):
    date: Optional[str] = None
    karigar_id: Optional[str] = None
    karigar_name: Optional[str] = None
    hw: Optional[str] = None
    ds: Optional[str] = None
    expected_return_pcs: Optional[int] = None
