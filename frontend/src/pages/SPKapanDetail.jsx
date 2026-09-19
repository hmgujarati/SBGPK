import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Printer, Trash } from "@phosphor-icons/react";
import { api, apiError, ct, dec2, today } from "@/lib/api";
import { PROCESS_LABELS } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Stat } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReceiveDialog from "@/components/ReceiveDialog";

const emptyRow = () => ({ weight: "" });

const StoneChain = ({ stone, onReceive }) => (
  <div className="border border-black/10 bg-white" data-testid={`sp-stone-${stone.packet_no}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-zinc-50 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-heading text-base font-bold tabular-nums">{stone.packet_no}</span>
        <span className="border border-black/15 px-1.5 py-0.5 font-heading text-[11px] font-bold tabular-nums tracking-widest">
          {stone.code}
        </span>
        <span className="text-xs text-zinc-500">
          Rough <b className="tabular-nums text-zinc-900">{ct(stone.original_weight)}</b> ct → now{" "}
          <b className="tabular-nums text-[#16A34A]">{ct(stone.weight)}</b> ct
        </span>
        <span className="text-xs text-zinc-500">
          Loss <b className="tabular-nums text-[#DC2626]">{ct(stone.total_loss)}</b> ct ({ct(stone.loss_pct)}%) · Yield{" "}
          <b className="tabular-nums">{ct(stone.yield_pct)}%</b>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          stone.status === "issued" ? "bg-amber-50 text-[#B4975A]" : "bg-emerald-50 text-[#16A34A]"}`}>
          {stone.status === "issued" ? `Out · ${PROCESS_LABELS[stone.current_process] || ""}` : "In stock"}
        </span>
        <Link to={`/labels?ids=${stone.id}`} data-testid={`sp-stone-label-${stone.packet_no}`}
          className="text-zinc-400 hover:text-zinc-900" title="Print sticker">
          <Printer size={14} />
        </Link>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-xs">
        <thead>
          <tr className="bg-zinc-900 text-white">
            {["#", "Jangad", "Date", "Process", "Karigar", "Sub-packets", "Issue Wt", "Return Boil", "RC", "Nail RC", "Loss", "Loss %", "Carries Fwd", ""].map((h, i) => (
              <th key={h + i} className={`px-2 py-2 font-semibold uppercase tracking-wider ${i >= 6 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stone.steps.length === 0 && (
            <tr><td colSpan={14} className="px-3 py-4 text-center text-zinc-500">
              Not started — issue this stone from Packet Issue (SP mode).
            </td></tr>
          )}
          {stone.steps.map((e, i) => (
            <tr key={e.id} className="border-b border-black/5" data-testid={`sp-step-${e.jangad_no}-${i}`}>
              <td className="px-2 py-1.5 text-zinc-400">{i + 1}</td>
              <td className="px-2 py-1.5">
                <Link to={`/jangad/${e.jangad_no}`} className="font-semibold tabular-nums underline decoration-[#B4975A] decoration-2 underline-offset-4">
                  {e.jangad_no}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-zinc-500">{e.date}</td>
              <td className="px-2 py-1.5 font-semibold">{PROCESS_LABELS[e.process]}</td>
              <td className="px-2 py-1.5">{e.karigar_name || "—"}</td>
              <td className="px-2 py-1.5 text-zinc-600">
                {(e.sub_packets || []).length
                  ? e.sub_packets.map((s) => `${s.no} (${Number(s.weight).toFixed(2)})`).join(", ")
                  : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{ct(e.weight)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{e.returned ? ct(e.return_boil) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{e.returned ? ct(e.rc) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{e.returned ? ct(e.nail_rc) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[#DC2626]">{e.returned ? ct(e.loss) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[#DC2626]">{e.returned ? `${ct(e.loss_pct)}%` : "—"}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-[#16A34A]">{e.returned ? ct(e.net_weight) : "—"}</td>
              <td className="px-2 py-1.5 text-right">
                {!e.returned && (
                  <button data-testid={`sp-receive-${e.jangad_no}`} onClick={() => onReceive(e)}
                    className="border border-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-zinc-900 hover:text-white">
                    Receive
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default function SPKapanDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const load = useCallback(() => {
    api.get(`/kapans/${id}/sp-report`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const { kapan, stones, summary } = data;
  const total = rows.reduce((a, r) => a + Number(r.weight || 0), 0);
  const over = total > Number(summary.unpacketed_weight || 0) + 0.001;

  const addStones = async () => {
    const payload = rows.filter((r) => Number(r.weight || 0) > 0).map((r) => ({ weight: Number(r.weight) }));
    if (!payload.length) return toast.error("Enter at least one stone weight");
    setBusy(true);
    try {
      const { data: res } = await api.post(`/kapans/${id}/sp-stones`, { date, rows: payload });
      toast.success(`${res.count} stone${res.count > 1 ? "s" : ""} added`);
      setOpen(false);
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeStone = async (s) => {
    if (!window.confirm(`Delete stone ${s.packet_no}? Its ${ct(s.weight)} cts return to the kapan.`)) return;
    try {
      await api.delete(`/packets/${s.id}`);
      toast.success("Stone deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="sp-kapan-detail-page">
      <Link to="/sp-kapans" data-testid="back-to-sp-kapans"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900">
        <ArrowLeft size={13} /> SP Kapan register
      </Link>

      <PageHeader
        title={`SP Kapan ${kapan.kapan_no}`}
        subtitle={`${kapan.date} · ${kapan.type || "—"} · ${ct(kapan.weight)} cts · ${summary.stone_count} stones`}
      >
        {can("can_create") && (
          <Button data-testid="add-sp-stones-button" onClick={() => setOpen(true)}
            className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest hover:bg-zinc-800">
            <Plus size={14} className="mr-1" /> Add Stones
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat testid="sp-kapan-weight" label="Kapan Weight" value={ct(summary.kapan_weight)} unit="ct" />
        <Stat testid="sp-stone-weight" label="Live Stone Weight" value={ct(summary.stone_weight)} unit="ct" tone="good" />
        <Stat testid="sp-unpacketed" label="Un-packeted" value={ct(summary.unpacketed_weight)} unit="ct" />
        <Stat testid="sp-total-loss" label="Total Loss" value={ct(summary.total_loss)} unit="ct" tone="warn" />
        <Stat testid="sp-total-rc" label="RC + Nail RC" value={ct((summary.total_rc || 0) + (summary.total_nail_rc || 0))} unit="ct" />
        <Stat testid="sp-in-process" label="In Process" value={ct(summary.in_process_weight)} unit="ct" tone="accent" />
      </div>

      <div className="mt-5 space-y-5">
        {stones.length === 0 && (
          <div className="border border-dashed border-black/15 bg-white p-10 text-center text-sm text-zinc-500">
            No stones yet. Add the first single packet from this kapan's rough.
          </div>
        )}
        {stones.map((s) => (
          <div key={s.id}>
            <StoneChain stone={s} onReceive={setReceiving} />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className={s.balanced ? "text-zinc-400" : "font-semibold text-[#DC2626]"}>
                {s.balanced ? "Stone balanced" : `Unaccounted ${ct(s.difference)} ct`}
              </span>
              {can("can_delete") && s.step_count === 0 && (
                <button data-testid={`sp-stone-delete-${s.packet_no}`} onClick={() => removeStone(s)}
                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-[#DC2626]">
                  <Trash size={13} /> Delete stone
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none" data-testid="sp-stones-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wide">Add Stones — one packet each</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Date</Label>
            <Input data-testid="sp-stones-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-10 rounded-none border-black/15" />
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-xs text-zinc-400">{i + 1}</span>
                <Input data-testid={`sp-stone-weight-${i}`} type="text" inputMode="decimal" value={r.weight}
                  placeholder="46.78"
                  onChange={(e) => setRows((rs) => rs.map((x, y) => (y === i ? { weight: dec2(e.target.value) } : x)))}
                  className="h-9 rounded-none border-black/15 tabular-nums" />
              </div>
            ))}
            <button data-testid="sp-stones-add-row" onClick={() => setRows((rs) => [...rs, emptyRow()])}
              className="inline-flex items-center gap-1 border border-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-zinc-900 hover:text-white">
              <Plus size={13} /> Add row
            </button>
          </div>
          <div className={`text-xs ${over ? "font-semibold text-[#DC2626]" : "text-zinc-500"}`} data-testid="sp-stones-remaining">
            Total <b className="tabular-nums">{ct(total)}</b> of <b className="tabular-nums">{ct(summary.unpacketed_weight)}</b> cts un-packeted
            {over && " — exceeds the kapan"}
          </div>
          <DialogFooter>
            <Button data-testid="sp-stones-save" onClick={addStones} disabled={busy || over || !total}
              className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
              {busy ? "Saving…" : "Add Stones"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
    </div>
  );
}
