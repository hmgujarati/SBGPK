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

## Iteration 2 — packet-first rework (2026-06)
- **Packet is now a first-class record** created inside a Kapan (manual date/pcs/weight, auto packet no `{kapan_no}-01`), guarded so packets can never exceed the kapan's un-packeted weight
- Issue/Receive act on a packet: pcs/weight are copied from the packet (read-only on issue), a packet can only be issued when in stock, and only issued packets can be received
- On receive the packet's current weight/pcs auto-update to the return values and `last_process` advances
- Validation: return weight + boil + RC cannot exceed the issued weight for every process except **Filling**, where the return weight must be greater than or equal to the issued weight (weight gain)
- Kapan detail: Packets tab (default) + one tab per process, no "All" tab, `#` restarts at 1 in each process tab
- Reconciliation identity always balances: kapan weight = RC + Nail RC + Boil + Laser + Shape/Ghat + Polish + Nats + Sarine/Marking loss + In Process + Polish Weight + Stock + Un-packeted − Filling Gain
- Deleting a jangad restores the packet to its previous weight; out-of-order and packet-with-entries deletes are blocked

## Iteration 3 — bulk packet entry inside a process (2026-06)
- Each process tab on Kapan detail has an **Add Packets to {Process}** button opening a multi-row form (Date + Karigar shared, then rows of Pcs / Weight with auto Size, plus H/W + Exp. Ret Pcs for Laser and D/S for Polish)
- `POST /api/kapans/{id}/process-packets` creates every packet and issues each one into that process in a single call, guarding the batch total against the kapan's remaining un-packeted weight
- Each row gets its own packet no and jangad no; reconciliation stays balanced

## Iteration 4 — Packets tab removed (2026-06)
- Kapan detail now opens straight on the **Sarine** tab; the Packets tab and the single "New Packet" dialog are gone since packets are created inside each process
- Process tabs show a live count of jangads, and the packet total moved into the kapan subtitle line
- Moving a packet to the next stage is done from the **Packet Issue** page (in-stock packet picker)

## Iteration 5 — create-only packets + one jangad for many packets (2026-06)
- "Add Packets to {Process}" now **only creates packets** (status in stock, tagged to that process register): rows are Pcs + Weight with auto Size, no karigar, no jangad
- Each process tab shows an amber "In stock — not yet issued" table above its jangad register
- **Issuing happens only in Packet Issue**: the dialog multi-selects in-stock packets (with select-all and a live Selected / Total Pcs / Total Weight summary), takes Process + Date + Karigar (and H/W + Exp Ret Pcs for Laser, D/S for Polish) once for the batch, and creates **one shared jangad number** — `POST /api/jangads`
- Jangad print page is per jangad number (`/jangad/{jangadNo}`, `GET /api/jangads/{no}`): all packets as numbered lines with a bold total row and a single signature block on one paper
- Dashboard "Open Jangads" counts unique jangad numbers

## Iteration 6 — packet labels + print settings (2026-06)
- **Packet sticker labels**: `/labels?ids=...` renders big, easy-to-read stickers — serial top-left, kapan no top-right, pcs-over-weight as a fraction bottom-right, and a CODE128 barcode of the packet no. "Print all labels" on each process stock table plus a printer icon per packet row; a "copies each" control repeats every label
- **Print Settings** admin tab (`can_manage_staff`, `GET/PUT /api/settings/print`): jangad paper size / orientation / margin, and sticker width × height in inches (default 2in × 1in, with presets), barcode height and a barcode on/off switch, plus a live sticker preview
- `@page` size is driven by the saved settings on both the jangad slip and the label sheet, so each sticker prints one per page at the exact physical size
- `GET /api/packets/labels?ids=` returns the label payload (seq, packet_no, kapan_no, pcs, weight)

## Iteration 8 — admin can edit issue & return figures (2026-06)
- Pencil icon on every jangad row (Kapan process registers + Packet Issue/Receive), gated on `can_edit`, opens an Edit dialog: ISSUE section (date, karigar, pcs, weight, plus H/W + Exp Ret Pcs for Laser) and, for received rows, a RETURN section with live Loss / Loss % / Return % (or Weight Gain for Filling)
- `PUT /api/entries/{id}` recomputes derived figures, stamps `edited_by`/`edited_at`, re-syncs the packet's current weight/pcs **only when the edited row is the packet's latest entry**, and re-syncs the packet's created weight when its first issue is corrected so the kapan never shows phantom unaccounted weight
- Guards: issue weight > 0, issue weight ≤ packet's created weight (first entry), return + boil + RC ≤ issued (non-filling), return ≥ issued (filling), return pcs ≤ issued pcs (except Laser, which splits), 2-decimal caps
- Test suite grew to **54 passing** backend tests

## Iteration 9 — packet hard delete + stock table removed (2026-06)
- Removed the separate amber "In stock — not yet issued" table; un-issued packets now appear as amber rows **inside** the process register itself (Jangad `—`, "In Stock" badge, no Receive button)
- Each stock row has a **trash icon that hard-deletes the packet** (`DELETE /api/packets/{id}`), returning its weight to the kapan's Un-packeted figure; the confirm names the exact cts. Blocked (403) without `can_delete`, and refused if the packet still has jangad entries
- Root cause of the reported bug: the only trash on a register deleted the *jangad entry*, which by design returns the packet to stock, so the packet (and its allocated weight) survived and Un-packeted stayed at 0.00
- "Print labels (n)" moved into the register header; test suite now **59 passing**

## Iteration 10 — loss now comes off Return Boil (2026-06)
- **New maths**: `Loss = Issue Weight − Return Boil`, `Loss % = Loss / Issue × 100`. Return Weight is stored for reference only and drives just the informational Return %
- **RC / Nail RC are allocations out of the boil**: `Net Forward = Boil − RC − Nail RC`, and that net is the weight the packet carries into the next process. Both fields are available on every process
- Return Boil is now a receive field on **all nine processes**; Filling's gain is `Boil − Issue`
- Guards: boil required and ≤ issue (≥ issue for Filling), RC + Nail RC ≤ boil
- Reconciliation identity drops boil (it is no longer double counted): kapan = RC + Nail RC + all losses + in-process + polish weight + stock + un-packeted − filling gain
- Registers renamed "Boil" → **Return Boil** and gained a **Net Fwd** column; test suite now **69 passing**

## Backlog
- P1: barcode on each packet — scan to issue (print jangad) and scan to receive (opens the return popup)
- P1: validate issued weight against kapan remaining weight; prevent duplicate open issue per stage
- P1: shadcn Calendar date pickers instead of native date inputs
- P2: multi-packet jangad (one slip for several packets to the same karigar)
- P2: karigar-wise performance report (avg loss %, turnaround)
- P2: Excel / CSV export of kapan register and process registers
- P2: DialogDescription for a11y warnings
