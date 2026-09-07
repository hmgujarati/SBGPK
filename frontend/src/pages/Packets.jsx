import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { api, apiError, ct } from "@/lib/api";
import { PROCESS_LABELS } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty, Stat } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import IssueDialog from "@/components/IssueDialog";
import ReceiveDialog from "@/components/ReceiveDialog";

const TH = ({ children, right }) => (
  <th className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);
const TD = ({ children, right, cls = "" }) => (
  <td className={`border-r border-black/5 px-2.5 py-2 ${right ? "text-right tabular-nums" : ""} ${cls}`}>{children}</td>
);

export const EntryTable = ({ rows, onReceive, onDelete, showKapan = true, showSr = false }) => {
  const { can } = useAuth();
  if (!rows.length) return <Empty testid="entries-empty" text="No packets found." />;
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
            <TH>Ret Date</TH>
            <TH right>Ret Pcs</TH>
            <TH right>Ret Wt</TH>
            <TH right>Boil</TH>
            <TH right>RC</TH>
            <TH right>Nail RC</TH>
            <TH right>Loss</TH>
            <TH right>Loss %</TH>
            <TH right>Gain</TH>
            <TH right>Ret %</TH>
            <TH>Status</TH>
            <TH />
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
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
              <TD cls="text-zinc-500">{e.return_date || "—"}</TD>
              <TD right>{e.returned ? e.return_pcs : "—"}</TD>
              <TD right>{e.returned ? ct(e.return_weight) : "—"}</TD>
              <TD right>{ct(e.return_boil)}</TD>
              <TD right>{ct(e.rc)}</TD>
              <TD right>{ct(e.nail_rc)}</TD>
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
                {can("can_delete") && onDelete && (
                  <button data-testid={`entry-delete-${e.jangad_no}`} onClick={() => onDelete(e)}
                    className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                    <Trash size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const PacketStockTable = ({ rows }) => {
  if (!rows.length) return null;
  const total = rows.reduce((a, p) => a + Number(p.weight || 0), 0);
  return (
    <div className="mb-4 overflow-x-auto border border-[#B4975A]/40 bg-[#B4975A]/5" data-testid="packet-stock-table">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#B4975A]/40 text-zinc-600">
            <th className="px-2.5 py-2 text-left font-semibold uppercase tracking-wider" colSpan={6}>
              In stock — not yet issued ({rows.length} packets · {ct(total)} cts) · issue them from Packet Issue
            </th>
          </tr>
          <tr className="border-b border-[#B4975A]/30 text-zinc-500">
            <th className="px-2.5 py-1.5 text-left font-semibold uppercase tracking-wider">#</th>
            <th className="px-2.5 py-1.5 text-left font-semibold uppercase tracking-wider">Packet No</th>
            <th className="px-2.5 py-1.5 text-left font-semibold uppercase tracking-wider">Date</th>
            <th className="px-2.5 py-1.5 text-right font-semibold uppercase tracking-wider">Pcs</th>
            <th className="px-2.5 py-1.5 text-right font-semibold uppercase tracking-wider">Weight</th>
            <th className="px-2.5 py-1.5 text-right font-semibold uppercase tracking-wider">Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} data-testid={`stock-row-${p.packet_no}`} className="border-b border-[#B4975A]/20">
              <td className="px-2.5 py-1.5 text-zinc-400">{i + 1}</td>
              <td className="px-2.5 py-1.5 font-semibold tabular-nums">{p.packet_no}</td>
              <td className="px-2.5 py-1.5 text-zinc-500">{p.date}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{p.pcs}</td>
              <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">{ct(p.weight)}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-zinc-500">{ct(p.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function Packets({ mode }) {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [stock, setStock] = useState([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const load = () => {
    api.get("/entries", { params: mode === "receive" ? { status: "open" } : {} })
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(apiError(e)));
    api.get("/packets", { params: { status: "in_stock" } })
      .then((r) => setStock(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  const outWeight = rows.filter((r) => !r.returned).reduce((a, r) => a + Number(r.weight || 0), 0);

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

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat testid="packets-total" label="Jangads" value={new Set(rows.map((r) => r.jangad_no)).size} />
        <Stat testid="packets-out" label="Out" value={rows.filter((r) => !r.returned).length} tone="accent" />
        <Stat testid="packets-out-weight" label="Out Weight" value={ct(outWeight)} unit="cts" tone="accent" />
        <Stat testid="packets-in-stock" label="Packets In Stock" value={stock.length} tone="good" />
      </div>

      <EntryTable rows={rows} onReceive={setReceiving} onDelete={remove} />

      <IssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        packets={stock}
        onDone={load}
      />
      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
    </div>
  );
}
