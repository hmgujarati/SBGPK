# Polki Manufacturing Tracker — PRD

## Original problem statement
Website to track the polki diamond manufacturing process. Menus: Kapan (kapan no = rough purchase weight, e.g. 101.35 cts), Packet Receive, Packet Issue, Staff & Admin management (admin creates staff logins with access rights), Karigar management (karigars per process — polish, laser, shape cutting, sarine etc).

Process chain: marking / sarine → laser sawing → (marking → laser again if needed) → shape cutting or ghat → polish (single / double; double goes to laser then table polish) → nats → filling.

Per-process field sets as specified by the user (laser: H/W, Expected Return Pcs, Return Boil, RC, LS Opening; shape/ghat: Return Boil, Nail/RC; polish: D/S; filling: Weight Gain). Automated calculations wherever possible.

Live kapan report: Kapan Weight = RC | Nail RC | Laser Loss | Polish Loss | Shape/Ghat Loss | Polish Weight | In Process Weight. Issuing a packet creates a printable Jangad for signature.

## User choices
- JWT email/password auth with role-based rights
- Browser print-friendly Jangad
- Carats, 2 decimals
- English, clean data-dense admin UI, mobile friendly

## Architecture
- FastAPI (`/app/backend`): `core.py` (Mongo, JWT, bcrypt, permissions), `models.py` (process definitions + pydantic schemas), `server.py` (all `/api` routes, `compute_entry()` derived math, `build_report()` reconciliation)
- React CRA (`/app/frontend`): pages Login, Dashboard, Kapans, KapanDetail, Packets (issue/receive), Karigars, Staff, Jangad; shared IssueDialog / ReceiveDialog; `lib/processConfig.js` drives per-process fields and live client-side math
- MongoDB collections: `users`, `karigars`, `kapans`, `entries`, `counters`, `login_attempts`

## Implemented (2026-06)
- JWT login, bcrypt hashing, brute-force lockout, admin + staff seeding, `/api/auth/refresh`
- Staff & Admin management with granular rights: create / edit / delete / manage karigars / manage staff; active toggle
- Karigar master with multi-process assignment; issue dropdown filtered by process
- Kapan register: auto kapan no from weight, auto size, per-kapan live reconciliation columns and totals row
- All 9 process stages with correct per-process field sets, auto Loss / Loss % / Return % / Weight Gain
- Packet Issue (auto Jangad no JG-000xx) and Packet Receive (open packets only)
- Printable Jangad slip with signature lines and `@media print` styles
- Dashboard with process board; mobile-responsive layout

## Backlog
- P1: validate issued weight against kapan remaining weight; prevent duplicate open issue per stage
- P1: shadcn Calendar date pickers instead of native date inputs
- P2: multi-packet jangad (one slip for several packets to the same karigar)
- P2: karigar-wise performance report (avg loss %, turnaround)
- P2: Excel / CSV export of kapan register and process registers
- P2: DialogDescription for a11y warnings
