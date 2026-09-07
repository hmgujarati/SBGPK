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

- Backend test suite: 69/69 passing (/app/backend/tests/backend_test.py)

## Backlog
- P1: Barcode scanning UX — scan a packet barcode to issue; scan on receive to open the receive popup
- P2: Karigar-wise loss/performance report
- P2: Export registers to Excel/CSV

## Credentials
See /app/memory/test_credentials.md (admin@polki.com / admin123).
