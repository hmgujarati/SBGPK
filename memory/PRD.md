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
- Backend test suite: 69/69 passing (/app/backend/tests/backend_test.py)

## Backlog
- P1: Barcode scanning UX — scan a packet barcode to issue; scan on receive to open the receive popup
- P2: Karigar-wise loss/performance report
- P2: Export registers to Excel/CSV

## Credentials
See /app/memory/test_credentials.md (admin@polki.com / admin123).
