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

export const EntryTable = ({ rows, onReceive, onDelete, showKapan = true }) => {
  const { can } = useAuth();
  if (!rows.length) return <Empty testid="entries-empty" text="No packets found." />;
  return (
    <div className="overflow-x-auto border border-black/10 bg-white">
      <table className="w-full min-w-[1150px] border-collapse text-xs">
        <thead>
          <tr className="bg-zinc-900 text-white">
            {["Jangad", "Date", ...(showKapan ? ["Kapan"] : []), "Process", "Name", "Pcs", "Weight", "H/W · D/S", "Ret Date", "Ret Pcs", "Ret Wt", "Boil", "RC", "Nail RC", "Loss", "Loss %", "Gain", "Ret %", "Status", ""].map((h, i) => (
              <th key={h + i} className="border-r border-white/10 px-2.5 py-2.5 text-left font-semibold uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} data-testid={`entry-row-${e.jangad_no}`} className="border-b border-black/5 transition-colors hover:bg-zinc-50">
              <td className="border-r border-black/5 px-2.5 py-2 font-semibold tabular-nums">
                <Link to={`/jangad/${e.id}`} data-testid={`jangad-link-${e.jangad_no}`}
                  className="underline decoration-[#B4975A] decoration-2 underline-offset-4 transition-colors hover:text-[#B4975A]">
                  {e.jangad_no}
                </Link>
              </td>
              <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{e.date}</td>
              {showKapan && <td className="border-r border-black/5 px-2.5 py-2 tabular-nums">{e.kapan_no}</td>}
              <td className="border-r border-black/5 px-2.5 py-2">{PROCESS_LABELS[e.process]}</td>
              <td className="border-r border-black/5 px-2.5 py-2">{e.karigar_name || "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{e.pcs}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums">{ct(e.weight)}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{e.hw || e.ds || "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{e.return_date || "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{e.returned ? e.return_pcs : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{e.returned ? ct(e.return_weight) : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(e.return_boil)}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(e.rc)}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(e.nail_rc)}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{e.returned ? ct(e.loss) : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{e.returned ? `${ct(e.loss_pct)}%` : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#16A34A]">{e.returned && e.weight_gain ? ct(e.weight_gain) : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#16A34A]">{e.returned ? `${ct(e.return_pct)}%` : "—"}</td>
              <td className="border-r border-black/5 px-2.5 py-2">
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.returned ? "bg-emerald-50 text-[#16A34A]" : "bg-amber-50 text-[#B4975A]"}`}>
                  {e.returned ? "Received" : "Out"}
                </span>
              </td>
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

export default function Packets({ mode }) {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [kapans, setKapans] = useState([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const load = () =>
    api.get("/entries", { params: mode === "receive" ? { status: "open" } : {} })
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
    api.get("/kapans").then((r) => setKapans(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const remove = async (e) => {
    if (!window.confirm(`Delete jangad ${e.jangad_no}?`)) return;
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
        subtitle={mode === "receive" ? "Pending packets out with karigars — fill returns" : "Issue packets, auto-generate Jangad slips"}
      >
        {mode !== "receive" && can("can_create") && (
          <Button data-testid="new-issue-button" onClick={() => setIssueOpen(true)}
            className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
            <Plus size={14} className="mr-1" /> Issue Packet
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat testid="packets-total" label="Records" value={rows.length} />
        <Stat testid="packets-out" label="Out" value={rows.filter((r) => !r.returned).length} tone="accent" />
        <Stat testid="packets-out-weight" label="Out Weight" value={ct(outWeight)} unit="cts" tone="accent" />
        <Stat testid="packets-received" label="Received" value={rows.filter((r) => r.returned).length} tone="good" />
      </div>

      <EntryTable rows={rows} onReceive={setReceiving} onDelete={remove} />

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} kapans={kapans} onDone={load} />
      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
    </div>
  );
}
