import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError, ct, dec2 } from "@/lib/api";
import { PROCESS_CONFIG, PROCESS_LABELS, computeReturn } from "@/lib/processConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Field = ({ label, children }) => (
  <div>
    <Label className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</Label>
    {children}
  </div>
);
const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";

export const ReceiveDialog = ({ entry, onClose, onDone }) => {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const process = entry?.process;
  const cfg = PROCESS_CONFIG[process] || { ret: [] };

  useEffect(() => {
    if (entry)
      setV({
        return_date: new Date().toISOString().slice(0, 10),
        return_pcs: entry.pcs || "",
        return_weight: "",
        return_boil: "",
        rc: "",
        nail_rc: "",
        ls_opening: "",
      });
  }, [entry]);

  const calc = useMemo(
    () => (entry ? computeReturn(process, entry.weight, v) : {}),
    [entry, process, v]
  );

  const issued = Number(entry?.weight || 0);
  const accounted =
    Number(v.return_weight || 0) + Number(v.return_boil || 0) + Number(v.rc || 0) + Number(v.nail_rc || 0);
  const invalid =
    process === "filling"
      ? Number(v.return_weight || 0) > 0 && Number(v.return_weight) < issued - 0.001
      : accounted > issued + 0.001;
  const warning =
    process === "filling"
      ? `Filling adds weight — return weight cannot be less than ${issued.toFixed(2)} cts`
      : `Return Weight + Return Boil + RC (${accounted.toFixed(2)}) cannot exceed issued ${issued.toFixed(2)} cts`;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/entries/${entry.id}/receive`, {
        return_date: v.return_date,
        return_pcs: Number(v.return_pcs || 0),
        return_weight: Number(v.return_weight || 0),
        return_boil: Number(v.return_boil || 0),
        rc: Number(v.rc || 0),
        nail_rc: Number(v.nail_rc || 0),
        ls_opening: v.ls_opening || "",
      });
      toast.success("Packet received");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!entry) return null;

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-none" data-testid="receive-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">
            Receive — {PROCESS_LABELS[process]} · {entry.jangad_no}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 border border-black/10 bg-zinc-50 p-3 text-xs sm:grid-cols-4">
          <div><span className="text-zinc-500">Kapan</span><div className="font-semibold tabular-nums">{entry.kapan_no}</div></div>
          <div><span className="text-zinc-500">Packet</span><div className="font-semibold tabular-nums">{entry.packet_no}</div></div>
          <div><span className="text-zinc-500">Issued Pcs</span><div className="font-semibold tabular-nums">{entry.pcs}</div></div>
          <div><span className="text-zinc-500">Issued Wt</span><div className="font-semibold tabular-nums">{ct(entry.weight)} ct</div></div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Return Date">
            <Input data-testid="receive-date-input" type="date" value={v.return_date || ""}
              onChange={(e) => setV({ ...v, return_date: e.target.value })} className={inp} />
          </Field>
          <Field label="Return Pcs">
            <Input data-testid="receive-pcs-input" type="number" value={v.return_pcs ?? ""}
              onChange={(e) => setV({ ...v, return_pcs: e.target.value })} className={inp} />
          </Field>
          <Field label="Return Weight">
            <Input data-testid="receive-weight-input" type="text" inputMode="decimal" value={v.return_weight ?? ""}
              onChange={(e) => setV({ ...v, return_weight: dec2(e.target.value) })} className={inp} />
          </Field>
          {cfg.ret.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input data-testid={`receive-${f.key}-input`}
                type={f.step ? "text" : f.type}
                inputMode={f.step ? "decimal" : undefined}
                value={v[f.key] ?? ""}
                onChange={(e) => setV({ ...v, [f.key]: f.step ? dec2(e.target.value) : e.target.value })}
                className={inp} />
            </Field>
          ))}
        </div>

        {invalid && (
          <p data-testid="receive-warning" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#DC2626]">
            {warning}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 border border-[#B4975A]/40 bg-[#B4975A]/5 p-3 text-xs">
          {process === "filling" ? (
            <div data-testid="calc-weight-gain">
              <span className="text-zinc-500">Weight Gain</span>
              <div className="font-heading text-base font-bold tabular-nums text-[#16A34A]">{ct(calc.weight_gain)}</div>
            </div>
          ) : (
            <>
              <div data-testid="calc-loss">
                <span className="text-zinc-500">Loss (auto)</span>
                <div className="font-heading text-base font-bold tabular-nums text-[#DC2626]">{ct(calc.loss)}</div>
              </div>
              <div data-testid="calc-loss-pct">
                <span className="text-zinc-500">Loss %</span>
                <div className="font-heading text-base font-bold tabular-nums text-[#DC2626]">{ct(calc.loss_pct)}%</div>
              </div>
            </>
          )}
          <div data-testid="calc-return-pct">
            <span className="text-zinc-500">Return %</span>
            <div className="font-heading text-base font-bold tabular-nums">{ct(calc.return_pct)}%</div>
          </div>
        </div>

        <DialogFooter>
          <Button data-testid="receive-submit-button" onClick={submit}
            disabled={busy || invalid || !Number(v.return_weight || 0)}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Saving…" : "Confirm Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiveDialog;
