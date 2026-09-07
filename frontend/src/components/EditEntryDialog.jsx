import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError, ct, dec2 } from "@/lib/api";
import { PROCESS_CONFIG, PROCESS_LABELS, computeReturn } from "@/lib/processConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";
const Field = ({ label, children }) => (
  <div>
    <Label className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</Label>
    {children}
  </div>
);

/** Admin correction of an already-created jangad line: issue and return figures. */
export const EditEntryDialog = ({ entry, onClose, onDone }) => {
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const process = entry?.process;
  const cfg = PROCESS_CONFIG[process] || { ret: [] };

  useEffect(() => {
    if (!entry) return;
    setV({
      date: entry.date || "",
      karigar_name: entry.karigar_name || "",
      pcs: entry.pcs ?? "",
      weight: entry.weight != null ? String(entry.weight) : "",
      hw: entry.hw || "",
      expected_return_pcs: entry.expected_return_pcs || "",
      return_date: entry.return_date || "",
      return_pcs: entry.return_pcs ?? "",
      return_weight: entry.returned ? String(entry.return_weight ?? "") : "",
      return_boil: entry.return_boil ? String(entry.return_boil) : "",
      rc: entry.rc ? String(entry.rc) : "",
      nail_rc: entry.nail_rc ? String(entry.nail_rc) : "",
      ls_opening: entry.ls_opening || "",
    });
  }, [entry]);

  const calc = useMemo(
    () => (entry ? computeReturn(process, Number(v.weight || 0), v) : {}),
    [entry, process, v]
  );

  const issued = Number(v.weight || 0);
  const boil = Number(v.return_boil || 0);
  const alloc = Number(v.rc || 0) + Number(v.nail_rc || 0);
  const invalid =
    !issued ||
    (entry?.returned &&
      (!boil ||
        (process === "filling" ? boil < issued - 0.001 : boil > issued + 0.001) ||
        alloc > boil + 0.001));

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        date: v.date,
        karigar_name: v.karigar_name,
        pcs: Number(v.pcs || 0),
        weight: Number(v.weight || 0),
        hw: v.hw || "",
        expected_return_pcs: Number(v.expected_return_pcs || 0),
      };
      if (entry.returned) {
        Object.assign(body, {
          return_date: v.return_date,
          return_pcs: Number(v.return_pcs || 0),
          return_weight: Number(v.return_weight || 0),
          return_boil: Number(v.return_boil || 0),
          rc: Number(v.rc || 0),
          nail_rc: Number(v.nail_rc || 0),
          ls_opening: v.ls_opening || "",
        });
      }
      await api.put(`/entries/${entry.id}`, body);
      toast.success("Entry updated");
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
      <DialogContent className="max-w-2xl rounded-none bg-white" data-testid="edit-entry-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">
            Edit — {PROCESS_LABELS[process]} · {entry.jangad_no} · {entry.packet_no}
          </DialogTitle>
        </DialogHeader>

        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Issue</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Date">
            <Input data-testid="edit-date-input" type="date" value={v.date || ""}
              onChange={(e) => setV({ ...v, date: e.target.value })} className={inp} />
          </Field>
          <Field label="Karigar">
            <Input data-testid="edit-karigar-input" value={v.karigar_name || ""}
              onChange={(e) => setV({ ...v, karigar_name: e.target.value })} className={inp} />
          </Field>
          <Field label="Issue Pcs">
            <Input data-testid="edit-pcs-input" type="number" value={v.pcs ?? ""}
              onChange={(e) => setV({ ...v, pcs: e.target.value })} className={inp} />
          </Field>
          <Field label="Issue Weight">
            <Input data-testid="edit-weight-input" type="text" inputMode="decimal" value={v.weight ?? ""}
              onChange={(e) => setV({ ...v, weight: dec2(e.target.value) })} className={inp} />
          </Field>
          {process === "laser" && (
            <>
              <Field label="H / W">
                <Input data-testid="edit-hw-input" value={v.hw || ""}
                  onChange={(e) => setV({ ...v, hw: e.target.value })} className={inp} />
              </Field>
              <Field label="Exp. Ret Pcs">
                <Input data-testid="edit-exp-pcs-input" type="number" value={v.expected_return_pcs ?? ""}
                  onChange={(e) => setV({ ...v, expected_return_pcs: e.target.value })} className={inp} />
              </Field>
            </>
          )}
        </div>

        {entry.returned && (
          <>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Return</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Return Date">
                <Input data-testid="edit-return-date-input" type="date" value={v.return_date || ""}
                  onChange={(e) => setV({ ...v, return_date: e.target.value })} className={inp} />
              </Field>
              <Field label="Return Pcs">
                <Input data-testid="edit-return-pcs-input" type="number" value={v.return_pcs ?? ""}
                  onChange={(e) => setV({ ...v, return_pcs: e.target.value })} className={inp} />
              </Field>
              <Field label="Return Weight">
                <Input data-testid="edit-return-weight-input" type="text" inputMode="decimal" value={v.return_weight ?? ""}
                  onChange={(e) => setV({ ...v, return_weight: dec2(e.target.value) })} className={inp} />
              </Field>
              {cfg.ret.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input data-testid={`edit-${f.key}-input`}
                    type={f.step ? "text" : f.type}
                    inputMode={f.step ? "decimal" : undefined}
                    value={v[f.key] ?? ""}
                    onChange={(e) => setV({ ...v, [f.key]: f.step ? dec2(e.target.value) : e.target.value })}
                    className={inp} />
                </Field>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 border border-[#B4975A]/40 bg-[#B4975A]/5 p-3 text-xs">
              {process === "filling" ? (
                <div data-testid="edit-calc-gain">
                  <span className="text-zinc-500">Weight Gain</span>
                  <div className="font-heading text-base font-bold tabular-nums text-[#16A34A]">{ct(calc.weight_gain)}</div>
                </div>
              ) : (
                <>
                  <div data-testid="edit-calc-loss">
                    <span className="text-zinc-500">Loss (auto)</span>
                    <div className="font-heading text-base font-bold tabular-nums text-[#DC2626]">{ct(calc.loss)}</div>
                  </div>
                  <div data-testid="edit-calc-loss-pct">
                    <span className="text-zinc-500">Loss %</span>
                    <div className="font-heading text-base font-bold tabular-nums text-[#DC2626]">{ct(calc.loss_pct)}%</div>
                  </div>
                </>
              )}
              <div data-testid="edit-calc-return-pct">
                <span className="text-zinc-500">Return %</span>
                <div className="font-heading text-base font-bold tabular-nums">{ct(calc.return_pct)}%</div>
              </div>
              <div data-testid="edit-calc-net">
                <span className="text-zinc-500">Carries forward</span>
                <div className="font-heading text-base font-bold tabular-nums text-[#16A34A]">{ct(calc.net)}</div>
              </div>
            </div>
          </>
        )}

        {invalid && (
          <p data-testid="edit-warning" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#DC2626]">
            {!issued
              ? "Issue weight must be greater than 0"
              : !boil
                ? "Return boil must be greater than 0"
                : alloc > boil + 0.001
                  ? `RC + Nail RC (${alloc.toFixed(2)}) cannot exceed the return boil ${boil.toFixed(2)} cts`
                  : process === "filling"
                    ? `Filling adds weight — return boil cannot be less than ${issued.toFixed(2)} cts`
                    : `Return boil (${boil.toFixed(2)}) cannot exceed issued ${issued.toFixed(2)} cts`}
          </p>
        )}

        <DialogFooter>
          <Button data-testid="edit-submit-button" onClick={submit} disabled={busy || invalid}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditEntryDialog;
