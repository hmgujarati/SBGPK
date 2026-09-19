import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react";
import { api, apiError, ct, dec2, today } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Stat } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const emptyRow = () => ({ weight: "" });

export default function SPKapanDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/kapans/${id}/sp-report`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const { kapan, stones, summary } = data;
  const total = rows.reduce((a, r) => a + Number(r.weight || 0), 0);
  const over = total > Number(summary.unstoned_weight || 0) + 0.001;

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
    if (!window.confirm(`Delete stone ${s.stone_no} (${ct(s.weight)} ct) with all its packets and history?`)) return;
    try {
      await api.delete(`/kapans/${s.id}`);
      toast.success("Stone deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const TH = ({ children, right }) => (
    <th className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );

  return (
    <div data-testid="sp-kapan-detail-page">
      <Link to="/sp-kapans" data-testid="back-to-sp-kapans"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900">
        <ArrowLeft size={13} /> SP Kapan register
      </Link>

      <PageHeader
        title={`SP Kapan ${kapan.kapan_no}`}
        subtitle={`${kapan.date} · ${kapan.type || "—"} · ${ct(kapan.weight)} cts · ${summary.stone_count} stones · ${summary.packet_count} packets`}
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
        <Stat testid="sp-unstoned" label="Not Stoned Yet" value={ct(summary.unstoned_weight)} unit="ct" />
        <Stat testid="sp-total-loss" label="Total Loss" value={ct(summary.total_loss)} unit="ct" tone="warn" />
        <Stat testid="sp-total-rc" label="RC + Nail RC" value={ct((summary.total_rc || 0) + (summary.total_nail_rc || 0))} unit="ct" />
        <Stat testid="sp-in-process" label="In Process" value={ct(summary.in_process_weight)} unit="ct" tone="accent" />
      </div>

      <h2 className="mb-2 mt-6 font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
        Stones — open one to work its process register
      </h2>

      {stones.length === 0 ? (
        <div className="border border-dashed border-black/15 bg-white p-10 text-center text-sm text-zinc-500">
          No stones yet. Add the first single packet from this kapan's rough.
        </div>
      ) : (
        <div className="overflow-x-auto border border-black/10 bg-white">
          <table className="w-full min-w-[1000px] border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white">
                <TH>Stone</TH>
                <TH right>Rough</TH>
                <TH right>Live Wt</TH>
                <TH right>Un-packeted</TH>
                <TH right>Packets</TH>
                <TH right>In Process</TH>
                <TH right>RC</TH>
                <TH right>Nail RC</TH>
                <TH right>Loss</TH>
                <TH right>Loss %</TH>
                <TH right>Yield %</TH>
                <TH>Stage</TH>
                <TH>Balance</TH>
                <TH> </TH>
              </tr>
            </thead>
            <tbody>
              {stones.map((s) => {
                const r = s.report || {};
                return (
                  <tr key={s.id} className="border-b border-black/5 hover:bg-zinc-50" data-testid={`sp-stone-row-${s.stone_no}`}>
                    <td className="border-r border-black/5 px-2.5 py-2">
                      <Link to={`/kapans/${s.id}`} data-testid={`sp-stone-link-${s.stone_no}`}
                        className="font-heading font-bold tabular-nums underline decoration-[#B4975A] decoration-2 underline-offset-4 hover:text-[#B4975A]">
                        Stone {s.stone_no}
                      </Link>
                    </td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums">{ct(s.weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#16A34A]">{ct(s.live_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(r.unpacketed_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{r.packet_count || 0}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#B4975A]">{ct(r.in_process_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(s.total_rc)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(s.total_nail_rc)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(s.total_loss)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(s.loss_pct)}%</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(s.yield_pct)}%</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-zinc-600">{r.current_stage_label}</td>
                    <td className={`border-r border-black/5 px-2.5 py-2 font-semibold ${s.balanced ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                      {s.balanced ? "OK" : ct(s.difference)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {can("can_delete") && (
                        <button data-testid={`sp-stone-delete-${s.stone_no}`} onClick={() => removeStone(s)}
                          className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                          <Trash size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
            Total <b className="tabular-nums">{ct(total)}</b> of <b className="tabular-nums">{ct(summary.unstoned_weight)}</b> cts left in the kapan
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
    </div>
  );
}
