# Polki Diamond Manufacturing Tracker — PRD

## Problem statement
Website to track the Polki diamond manufacturing process: Kapan management (rough weight),
process tracking (Marking/Sarine -> Laser Sawing -> Shape Cutting/Ghat -> Polish -> Table Polish -> Nats -> Filling),
packet lifecycle (create inside process -> issue with printable Jangad -> receive with boil/RC/loss),
staff + admin RBAC, karigar management, live weight reconciliation, mobile-friendly data-dense UI.

## Stack
React (CRA/Vite + Tailwind + shadcn) · FastAPI · MongoDB · JWT auth.
Files: /app/backend/server.py, models.py, core.py; /app/frontend/src/{pages,components,lib}.

## Core math (do not break)
- Loss = Issued Weight − Return Boil
- RC and Nail RC are allocations OUT of the Return Boil (never double-deducted)
- Net carried forward = Boil − RC − Nail RC
- Kapan Weight = RC + Nail RC + losses + in-process weight (must balance)

## Implemented
- JWT auth + RBAC (admin/staff), staff & karigar management
- Kapan register + detail with live reconciliation and per-process tabs
- Packet-first model: bulk packet creation inside a process register
- Multi-packet Jangad issue + printable slip, customizable paper settings
- Receive flow with boil/RC/nail RC/loss, admin edit + hard delete (restores kapan stock)
- Barcode packet labels + print settings
- 2-decimal enforcement on all weights
- 2026-06: Laser Sawing — H/W and Tops captured at PACKET CREATION (per row),
  expected_return_pcs auto = pcs + tops, carried onto the Jangad entry and printed
  per-line on the slip; LS Opening captured on Receive. Jangad payload hw/tops ignored.
- 2026-06: Exp. Ret Pcs is a MANUAL numeric input at packet creation (no auto pcs+tops)
- 2026-06: Polish — D/S (Double/Single) chosen per row at PACKET CREATION, carried onto the Jangad
- 2026-06: Packet label serial now = position within its own process register (was kapan-wide seq)
- 2026-06: Jangad prints as ONE A4 portrait sheet with two copies side by side
  (Office Copy | Karigar Copy) separated by a dashed cut line
- 2026-06: Packet code — global 5-digit id (00001…99999) from the `packet_code` counter,
  stored on the packet, encoded in the barcode (CODE128, double-width bars) and printed
  under it. Never reused while a packet holds it; after 99999 the numbering wraps and
  reclaims the lowest code freed by deleted kapans/packets. Backfill script:
  /app/backend/scripts/backfill_packet_codes.py
- 2026-06: Packet Issue is a scan-to-cart flow — scan/type the 5-digit code (GET /api/packets/lookup)
  to add packets to a list, remove individually, or expand the process stock list to click-add.
  Backend enforces: every packet must belong to the jangad's process, and a selected karigar
  must be registered for that process (e.g. a ghat karigar can only take ghat packets).
- 2026-06: Packet Receive has a scan bar (GET /api/entries/lookup?code=) — scanning a packet
  opens the Receive popup for its open jangad entry; saving completes the receive.
## Scale / load hardening (2026-06)
- `/api/kapans`, `/api/packets`, `/api/entries` are paginated (`page`, `limit`, `q`) and return
  `{items, total, ...}`. No more silent `to_list()` caps — counts shown in the UI are true totals.
- Kapan reports come from 2 aggregations for a whole page of kapans (`build_reports`), and
  `/api/dashboard` is fully aggregation-based.
- Kapan register total row uses server-computed totals across every matching kapan, not the page.
- Issue dialog loads only the selected process's stock (first 200; scan reaches any packet).
- Indexes: packets(kapan_id, code, packet_no, status, process, created_at),
  entries(kapan_id, packet_id, returned, jangad_no, created_at), kapans(kapan_no unique, created_at).
- Load-test scripts: `backend/scripts/loadtest_seed.py` / `loadtest_clean.py`.
  Measured at 1,006 kapans / 25,014 packets / 25,001 entries: kapans 0.64s, packets 0.46s,
  entries 0.21s, dashboard 0.20s, payloads ~50-70KB (was 1.4-2MB, pages 6-8s).

## SP Kapan (single-packet kapan) — 2026-06 (restructured)
Sidebar tab "SP Kapan" (`/sp-kapans`, `/sp-kapans/:id`).
- **Each stone is its own mini-kapan**: kapan docs carry `mode: "normal" | "sp" | "sp_stone"`;
  a stone is a kapan with `parent_id`, `stone_no`, `kapan_no = "{parent}/{n}"`, weight = stone weight.
  Opening a stone reuses the whole Kapan page: process tabs → create packets → issue → receive →
  reconciliation. SP stone tabs are limited to SP_PROCESSES (marking, sarine, laser, shape, ghat,
  polish, table polish — Nats/Filling rejected), usable in any order, back and forth.
- Packets inside stone N are numbered **N.1, N.2 …** with **S**-prefixed barcodes (S00042) from the
  shared global counter. Sub-packets are simply these packets (no separate split model).
- `POST /api/kapans/{id}/sp-stones` adds stones (can't exceed kapan weight).
- `GET /api/kapans/{id}/sp-report` rolls every stone up: rough, live weight, un-packeted, packets,
  in-process, RC, Nail RC, loss, loss %, yield %, stage and balance.
- `GET /api/kapans?mode=sp|normal` keeps the two registers isolated; stone kapans never appear in
  either listing. Deleting an SP kapan cascades to its stones, packets and entries.
- Issue: a jangad holds either SP-stone packets or normal packets, never both; karigar-process rule
  and the "packet must be in that process register" rule apply to both.
- Tests: backend/tests/test_sp_kapan.py (12) + backend_test.py (69) = **81/81 green**.

- 2026-06: A packet that has come back from a process (`last_process` set) can be re-issued to
  ANY process next (laser again, shape, ghat …). Its `process` follows the new jangad, so it moves
  into that register. Only a brand-new packet is locked to the register it was created in.
  `GET /api/packets?for_process=X` returns what's issuable into X (fresh X packets + all returned
  packets); the Issue dialog shows a Stage column ("new" / "after Polish").
- 2026-06: Packet creation draws from **un-packeted rough + material in stock**. Creating packets in
  a process consumes weight from in-stock packets (fresh or returned, lowest seq first); the source
  packet's weight drops by exactly that much and a fully used source is marked `consumed`
  (hidden from registers, still counted as packeted rough so un-packeted stays right). New packets
  store `original_weight` = rough part only, `carried_weight`, `split_from` and inherit the source's
  stage. Deleting a split packet is refused to protect the balance. Dialog label:
  "Available to packet: N cts (un-packeted rough + stock)".
- 2026-06: **Stage pool rule** — a process register can create packets only from un-packeted rough
  + stock held by packets of OTHER stages (never its own, never material out with a karigar).
  Creating consumes that weight from the source packet(s), so the available figure drops and once a
  stage holds all the material nothing more can be created there. Dialog label: "Available for this
  stage: N cts (un-packeted rough + stock in other stages)". Error names the stage and the split.
- 2026-06: **Stock pool rule (final)** — weight that comes back from any process sits in stock
  (pre-polish) and is fully available to ANY process. Available = un-packeted rough + every in-stock
  packet's weight, whichever stage holds it; material out with a karigar is excluded. Creating
  packets consumes that weight from source packets (lowest seq first), so the total never grows.
  Dialog label: "Available: N cts (un-packeted rough + stock pre-polish)".
- 2026-06: **Undo Split** — `POST /api/packets/{id}/undo-split` (admin) puts a split packet's weight
  back into the packet it was cut from and deletes it. Guards: packet must be `in_stock` (a packet
  already cut into a downstream packet is refused), no process entries, and only
  `min(carried_weight, current weight)` is returned so chained splits can't double count.
  Button: `packet-undo-split-{packet_no}` in the process register.
- Backend test suite: see latest entry below.

## Backlog
- P1: Barcode scanning UX — scan a packet barcode to issue; scan on receive to open the receive popup
- P2: Karigar-wise loss/performance report
- P2: Export registers to Excel/CSV

## Credentials
See /app/memory/test_credentials.md (admin@polki.com / admin123).

- 2026-06-23: **Packet weight is locked on creation (accountability fix)** — a packet created into a
  process register gets `stock_state: "fresh"` and its weight is NO LONGER free stock: it cannot be
  re-split by another process, and it leaves "Stock (pre-polish)". It becomes free stock again only
  after it is issued and received back (`stock_state: "returned"`).
  - Available (Add Packets dialog) = un-packeted rough + in-stock packets with `stock_state != "fresh"`.
  - Report adds `allocated_weight` ("In packets (unissued)") and includes it in accounted weight, so
    mass balance still holds. UI: `rep-stock` + `rep-allocated` on the kapan/stone balance bar.
  - Backfill script: `backend/scripts/migrate_stock_state.py` (a packet is "returned" only if it has
    a returned entry). Already run on this DB.
  - Backend test suite: 98/98 passing.
- 2026-06-23: **Register display fixes** — (1) jangad history rows keep their packet name after the
  packet is consumed by a split (`GET /kapans/{id}` now resolves packet_no from all packets, not just
  live ones); (2) an IN STOCK row is shown only for packets not yet issued (`stock_state !== "returned"`),
  so a received packet no longer appears twice (stock row + its own history row).
- 2026-06-23: Duplicate-row fix made DB-agnostic — the stock row is also suppressed when the packet
  already has jangad history (`entries.packet_id`), and `startup()` backfills `stock_state` on any
  in-stock packet missing it, so older/production databases self-heal on the next restart.
