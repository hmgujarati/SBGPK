import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash, Printer, PencilSimple, Barcode } from "@phosphor-icons/react";
import { api, apiError, ct } from "@/lib/api";
import { PROCESS_LABELS } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty, Stat, Pager } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IssueDialog from "@/components/IssueDialog";
import ReceiveDialog from "@/components/ReceiveDialog";
import EditEntryDialog from "@/components/EditEntryDialog";

const TH = ({ children, right }) => (
  <th className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);
const TD = ({ children, right, cls = "" }) => (
  <td className={`border-r border-black/5 px-2.5 py-2 ${right ? "text-right tabular-nums" : ""} ${cls}`}>{children}</td>
);

export const EntryTable = ({ rows, onReceive, onDelete, onEdit, onDeletePacket, showKapan = true, showSr = false }) => {
  const { can } = useAuth();
  if (!rows.length) return <Empty testid="entries-empty" text="No packets in this stage yet." />;
  return (
    <div className="overflow-x-auto border border-black/10 bg-white">
      <table className="w-full min-w-[1200px] border-collapse text-xs">
        <thead>
          <tr className="bg-zinc-900 text-white">
            {showSr && <TH>#</TH>}
            <TH>Jangad</TH>
            <TH>Date</TH>
            {showKapan && <TH>Kapan</TH>}
            <TH>Packet</TH>
            <TH>Process</TH>
            <TH>Name</TH>
            <TH right>Pcs</TH>
            <TH right>Weight</TH>
            <TH>H/W · D/S</TH>
            <TH right>Tops</TH>
            <TH right>Exp Ret</TH>
            <TH>Ret Date</TH>
            <TH right>Ret Pcs</TH>
            <TH right>Ret Wt</TH>
            <TH right>Return Boil</TH>
            <TH right>RC</TH>
            <TH right>Nail RC</TH>
            <TH right>Net Fwd</TH>
            <TH right>Loss</TH>
            <TH right>Loss %</TH>
            <TH right>Gain</TH>
            <TH right>Ret %</TH>
            <TH>Status</TH>
            <TH />
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) =>
            e._isPacket ? (
              <tr key={e.id} data-testid={`stock-row-${e.packet_no}`} className="border-b border-black/5 bg-[#B4975A]/5 transition-colors hover:bg-[#B4975A]/10">
                {showSr && <TD right cls="text-zinc-400">{i + 1}</TD>}
                <TD cls="text-zinc-400">—</TD>
                <TD cls="text-zinc-500">{e.date}</TD>
                {showKapan && <TD cls="tabular-nums">{e.kapan_no}</TD>}
                <TD cls="font-semibold tabular-nums">{e.packet_no}</TD>
                <TD>{PROCESS_LABELS[e.process]}</TD>
                <TD cls="text-zinc-400">—</TD>
                <TD right>{e.pcs}</TD>
                <TD right cls="font-semibold">{ct(e.weight)}</TD>
                <TD cls="text-zinc-500">{e.hw || e.ds || "—"}</TD>
                <TD right>{e.process === "laser" ? e.tops || 0 : "—"}</TD>
                <TD right>{e.process === "laser" ? e.expected_return_pcs || 0 : "—"}</TD>
                {Array.from({ length: 11 }).map((_, x) => (
                  <TD key={x} cls="text-zinc-300">—</TD>
                ))}
                <TD>
                  <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    In Stock
                  </span>
                </TD>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <Link to={`/labels?ids=${e.id}`} data-testid={`print-label-${e.packet_no}`} title="Print label"
                    className="mr-2 inline-block text-zinc-400 transition-colors hover:text-zinc-900">
                    <Printer size={14} />
                  </Link>
                  {can("can_delete") && onDeletePacket && (
                    <button data-testid={`packet-delete-${e.packet_no}`} onClick={() => onDeletePacket(e)}
                      title="Delete packet and return its weight to the kapan"
                      className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                      <Trash size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ) : (
            <tr key={e.id} data-testid={`entry-row-${e.jangad_no}`} className="border-b border-black/5 transition-colors hover:bg-zinc-50">
              {showSr && <TD right cls="text-zinc-400">{i + 1}</TD>}
              <TD>
                <Link to={`/jangad/${e.jangad_no}`} data-testid={`jangad-link-${e.jangad_no}`}
                  className="font-semibold tabular-nums underline decoration-[#B4975A] decoration-2 underline-offset-4 transition-colors hover:text-[#B4975A]">
                  {e.jangad_no}
                </Link>
              </TD>
              <TD cls="text-zinc-500">{e.date}</TD>
              {showKapan && <TD cls="tabular-nums">{e.kapan_no}</TD>}
              <TD cls="font-semibold tabular-nums">{e.packet_no}</TD>
              <TD>{PROCESS_LABELS[e.process]}</TD>
              <TD>{e.karigar_name || "—"}</TD>
              <TD right>{e.pcs}</TD>
              <TD right cls="font-semibold">{ct(e.weight)}</TD>
              <TD cls="text-zinc-500">{e.hw || e.ds || "—"}</TD>
              <TD right>{e.process === "laser" ? e.tops || 0 : "—"}</TD>
              <TD right>{e.process === "laser" ? e.expected_return_pcs || 0 : "—"}</TD>
              <TD cls="text-zinc-500">{e.return_date || "—"}</TD>
              <TD right>{e.returned ? e.return_pcs : "—"}</TD>
              <TD right>{e.returned ? ct(e.return_weight) : "—"}</TD>
              <TD right>{ct(e.return_boil)}</TD>
              <TD right>{ct(e.rc)}</TD>
              <TD right>{ct(e.nail_rc)}</TD>
              <TD right cls="font-semibold text-[#16A34A]">{e.returned ? ct(e.net_weight) : "—"}</TD>
              <TD right cls="text-[#DC2626]">{e.returned ? ct(e.loss) : "—"}</TD>
              <TD right cls="text-[#DC2626]">{e.returned ? `${ct(e.loss_pct)}%` : "—"}</TD>
              <TD right cls="text-[#16A34A]">{e.returned && e.weight_gain ? ct(e.weight_gain) : "—"}</TD>
              <TD right cls="text-[#16A34A]">{e.returned ? `${ct(e.return_pct)}%` : "—"}</TD>
              <TD>
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.returned ? "bg-emerald-50 text-[#16A34A]" : "bg-amber-50 text-[#B4975A]"}`}>
                  {e.returned ? "Received" : "Out"}
                </span>
              </TD>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                {!e.returned && (
                  <button data-testid={`receive-btn-${e.jangad_no}`} onClick={() => onReceive(e)}
                    className="mr-2 border border-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-900 hover:text-white">
                    Receive
                  </button>
                )}
                {can("can_edit") && onEdit && (
                  <button data-testid={`entry-edit-${e.jangad_no}-${e.packet_no}`} onClick={() => onEdit(e)}
                    title="Edit issue / return weight"
                    className="mr-2 text-zinc-400 transition-colors hover:text-zinc-900">
                    <PencilSimple size={14} />
                  </button>
                )}
                {can("can_delete") && onDelete && (
                  <button data-testid={`entry-delete-${e.jangad_no}`} onClick={() => onDelete(e)}
                    className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                    <Trash size={14} />
                  </button>
                )}
              </td>
            </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

export default function Packets({ mode }) {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [stockCount, setStockCount] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [scan, setScan] = useState("");
  const scanRef = useRef(null);
  const LIMIT = 100;

  const scanReceive = async (e) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    try {
      const { data } = await api.get("/entries/lookup", { params: { code } });
      setReceiving(data);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setScan("");
      scanRef.current?.focus();
    }
  };

  const load = () => {
    api.get("/entries", {
      params: { status: mode === "receive" ? "open" : undefined, q: q || undefined, page, limit: LIMIT },
    })
      .then((r) => {
        setRows(r.data.items);
        setTotal(r.data.total);
        setStats(r.data.stats || {});
      })
      .catch((e) => toast.error(apiError(e)));
    api.get("/packets", { params: { status: "in_stock", limit: 1 } })
      .then((r) => setStockCount(r.data.total))
      .catch(() => {});
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, q, page]);

  useEffect(() => setPage(1), [q, mode]);

  const remove = async (e) => {
    if (!window.confirm(`Delete jangad ${e.jangad_no}? The packet will be restored to its previous weight.`)) return;
    try {
      await api.delete(`/entries/${e.id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const outWeight = stats.open_weight || 0;

  return (
    <div data-testid={mode === "receive" ? "packet-receive-page" : "packet-issue-page"}>
      <PageHeader
        title={mode === "receive" ? "Packet Receive" : "Packet Issue"}
        subtitle={mode === "receive" ? "Packets out with karigars — enter return pcs & weight" : "Select packets from stock and issue them under one Jangad"}
      >
        {mode !== "receive" && can("can_create") && (
          <Button data-testid="new-issue-button" onClick={() => setIssueOpen(true)}
            className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
            <Plus size={14} className="mr-1" /> Issue Packet
          </Button>
        )}
      </PageHeader>

      {mode === "receive" && can("can_create") && (
        <form onSubmit={scanReceive} className="mb-4 flex items-end gap-2 border border-black/10 bg-white p-3">          <div className="flex-1">
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">
              Scan packet barcode to receive
            </Label>
            <Input ref={scanRef} data-testid="receive-scan-input" value={scan} autoComplete="off"
              placeholder="00042" onChange={(e) => setScan(e.target.value)}
              className="mt-1 h-10 rounded-none border-black/15 font-heading text-base tracking-[0.2em] tabular-nums" />
          </div>
          <Button type="submit" data-testid="receive-scan-button"
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            <Barcode size={15} className="mr-1" /> Open Receive
          </Button>
        </form>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat testid="packets-total" label="Jangads" value={stats.jangads || 0} />
        <Stat testid="packets-out" label="Out" value={stats.open || 0} tone="accent" />
        <Stat testid="packets-out-weight" label="Out Weight" value={ct(outWeight)} unit="cts" tone="accent" />
        <Stat testid="packets-in-stock" label="Packets In Stock" value={stockCount} tone="good" />
      </div>

      <div className="mb-3">
        <Input data-testid="entries-search-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search packet no / jangad / karigar"
          className="h-9 w-full rounded-none border-black/15 sm:w-72" />
      </div>

      <EntryTable rows={rows} onReceive={setReceiving} onDelete={remove} onEdit={setEditing} />
      <Pager page={page} limit={LIMIT} total={total} onPage={setPage} testid="entries-pager" label="entries" />

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onDone={load} />
      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
      <EditEntryDialog entry={editing} onClose={() => setEditing(null)} onDone={load} />
    </div>
  );
}
