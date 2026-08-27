import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { api, apiError, ct, today } from "@/lib/api";
import { PROCESS_CONFIG, PROCESS_LABELS } from "@/lib/processConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";
const cell = "h-9 rounded-none border-black/15 tabular-nums";
const emptyRow = () => ({ pcs: "", weight: "", hw: "", ds: "Single", expected_return_pcs: "" });

export const BulkPacketDialog = ({ open, onOpenChange, kapanId, process, remaining, onDone }) => {
  const [head, setHead] = useState({ date: today(), karigar_id: "", karigar_name: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [karigars, setKarigars] = useState([]);
  const [busy, setBusy] = useState(false);

  const cfg = PROCESS_CONFIG[process] || { issue: [] };
  const extra = cfg.issue;

  useEffect(() => {
    if (!open) return;
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setHead({ date: today(), karigar_id: "", karigar_name: "" });
    api.get("/karigars", { params: { process } })
      .then((r) => setKarigars(r.data))
      .catch(() => setKarigars([]));
  }, [open, process]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ pcs: a.pcs + Number(r.pcs || 0), weight: a.weight + Number(r.weight || 0) }),
        { pcs: 0, weight: 0 }
      ),
    [rows]
  );

  const over = totals.weight > Number(remaining || 0) + 0.001;
  const setRow = (i, patch) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    const payloadRows = rows
      .filter((r) => Number(r.weight || 0) > 0)
      .map((r) => ({
        pcs: Number(r.pcs || 0),
        weight: Number(r.weight || 0),
        hw: r.hw,
        ds: r.ds,
        expected_return_pcs: Number(r.expected_return_pcs || 0),
      }));
    if (!payloadRows.length) return toast.error("Enter at least one packet weight");
    setBusy(true);
    try {
      const { data } = await api.post(`/kapans/${kapanId}/process-packets`, {
        process,
        date: head.date,
        karigar_id: head.karigar_id || null,
        karigar_name: head.karigar_name,
        rows: payloadRows,
      });
      toast.success(`${data.count} packet${data.count > 1 ? "s" : ""} created & issued to ${PROCESS_LABELS[process]}`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none" data-testid="bulk-packet-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">
            Add Packets — {PROCESS_LABELS[process]}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Date</Label>
            <Input data-testid="bulk-date-input" type="date" value={head.date}
              onChange={(e) => setHead({ ...head, date: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Karigar</Label>
            <Select
              value={head.karigar_id || "manual"}
              onValueChange={(v) => {
                if (v === "manual") return setHead({ ...head, karigar_id: "", karigar_name: "" });
                const k = karigars.find((x) => x.id === v);
                setHead({ ...head, karigar_id: v, karigar_name: k?.name || "" });
              }}
            >
              <SelectTrigger data-testid="bulk-karigar-select" className={inp}>
                <SelectValue placeholder="Select karigar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">— Type manually —</SelectItem>
                {karigars.map((k) => (
                  <SelectItem key={k.id} value={k.id} data-testid={`bulk-karigar-opt-${k.name}`}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!head.karigar_id && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Name (manual)</Label>
              <Input data-testid="bulk-karigar-name-input" value={head.karigar_name}
                onChange={(e) => setHead({ ...head, karigar_name: e.target.value })} className={inp} />
            </div>
          )}
        </div>

        <div className="max-h-[45vh] overflow-auto border border-black/10">
          <table className="w-full border-collapse text-xs" data-testid="bulk-rows-table">
            <thead className="sticky top-0">
              <tr className="bg-zinc-900 text-white">
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">#</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Pcs</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Weight</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Size</th>
                {extra.map((f) => (
                  <th key={f.key} className="px-2 py-2 text-left font-semibold uppercase tracking-wider">{f.label}</th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const size = Number(r.pcs || 0) ? (Number(r.weight || 0) / Number(r.pcs)).toFixed(2) : "—";
                return (
                  <tr key={i} className="border-b border-black/5" data-testid={`bulk-row-${i}`}>
                    <td className="px-2 py-1.5 text-zinc-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Input data-testid={`bulk-pcs-${i}`} type="number" value={r.pcs}
                        onChange={(e) => setRow(i, { pcs: e.target.value })} className={`${cell} w-20`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input data-testid={`bulk-weight-${i}`} type="number" step="0.01" value={r.weight}
                        onChange={(e) => setRow(i, { weight: e.target.value })} className={`${cell} w-24`} />
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-zinc-500" data-testid={`bulk-size-${i}`}>{size}</td>
                    {extra.map((f) =>
                      f.type === "select" ? (
                        <td key={f.key} className="px-2 py-1.5">
                          <Select value={r[f.key]} onValueChange={(v) => setRow(i, { [f.key]: v })}>
                            <SelectTrigger data-testid={`bulk-${f.key}-${i}`} className={`${cell} w-28`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {f.options.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      ) : (
                        <td key={f.key} className="px-2 py-1.5">
                          <Input data-testid={`bulk-${f.key}-${i}`} type={f.type} step={f.step} value={r[f.key] ?? ""}
                            onChange={(e) => setRow(i, { [f.key]: e.target.value })} className={`${cell} w-24`} />
                        </td>
                      )
                    )}
                    <td className="px-2 py-1.5 text-right">
                      {rows.length > 1 && (
                        <button data-testid={`bulk-remove-${i}`}
                          onClick={() => setRows((rs) => rs.filter((_, x) => x !== i))}
                          className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                          <Trash size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-zinc-100 font-semibold" data-testid="bulk-totals-row">
                <td className="px-2 py-2 uppercase tracking-wider">Total</td>
                <td className="px-2 py-2 tabular-nums">{totals.pcs}</td>
                <td className="px-2 py-2 tabular-nums">{ct(totals.weight)}</td>
                <td colSpan={2 + extra.length} />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button data-testid="bulk-add-row-button" onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="inline-flex items-center gap-1 border border-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-900 hover:text-white">
            <Plus size={13} /> Add row
          </button>
          <div className={`text-xs ${over ? "font-semibold text-[#DC2626]" : "text-zinc-500"}`} data-testid="bulk-remaining">
            Un-packeted left: <b className="tabular-nums">{ct(remaining)}</b> cts
            {over && " — total exceeds this"}
          </div>
        </div>

        <DialogFooter>
          <Button data-testid="bulk-save-button" onClick={submit} disabled={busy || over || !totals.weight}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Saving…" : `Create & Issue to ${PROCESS_LABELS[process]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkPacketDialog;
