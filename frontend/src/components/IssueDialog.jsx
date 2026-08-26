import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError, today } from "@/lib/api";
import { PROCESS_CONFIG, PROCESS_LABELS, PROCESS_ORDER } from "@/lib/processConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";
const Field = ({ label, children }) => (
  <div>
    <Label className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</Label>
    {children}
  </div>
);

export const IssueDialog = ({ open, onOpenChange, kapans, fixedKapanId, onDone }) => {
  const [form, setForm] = useState({
    kapan_id: fixedKapanId || "",
    process: "sarine",
    date: today(),
    karigar_id: "",
    karigar_name: "",
    pcs: "",
    weight: "",
    hw: "",
    ds: "Single",
    expected_return_pcs: "",
    notes: "",
  });
  const [karigars, setKarigars] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fixedKapanId) setForm((f) => ({ ...f, kapan_id: fixedKapanId }));
  }, [fixedKapanId]);

  useEffect(() => {
    if (!open) return;
    api.get("/karigars", { params: { process: form.process } })
      .then((r) => setKarigars(r.data))
      .catch(() => setKarigars([]));
  }, [form.process, open]);

  const cfg = PROCESS_CONFIG[form.process] || { issue: [] };
  const size = useMemo(() => {
    const p = Number(form.pcs || 0);
    return p ? (Number(form.weight || 0) / p).toFixed(2) : "0.00";
  }, [form.pcs, form.weight]);

  const submit = async () => {
    if (!form.kapan_id) return toast.error("Select a kapan");
    setBusy(true);
    try {
      const { data } = await api.post("/entries", {
        kapan_id: form.kapan_id,
        process: form.process,
        date: form.date,
        karigar_id: form.karigar_id || null,
        karigar_name: form.karigar_name,
        pcs: Number(form.pcs || 0),
        weight: Number(form.weight || 0),
        hw: form.hw,
        ds: form.ds,
        expected_return_pcs: Number(form.expected_return_pcs || 0),
        notes: form.notes,
      });
      toast.success(`Issued · Jangad ${data.jangad_no}`);
      onOpenChange(false);
      setForm((f) => ({ ...f, pcs: "", weight: "", hw: "", expected_return_pcs: "", notes: "" }));
      onDone?.(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-none" data-testid="issue-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">Issue Packet</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!fixedKapanId && (
            <Field label="Kapan">
              <Select value={form.kapan_id} onValueChange={(v) => setForm({ ...form, kapan_id: v })}>
                <SelectTrigger data-testid="issue-kapan-select" className={inp}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {kapans?.map((k) => (
                    <SelectItem key={k.id} value={k.id} data-testid={`issue-kapan-opt-${k.kapan_no}`}>
                      {k.kapan_no} {k.type ? `· ${k.type}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Process">
            <Select value={form.process} onValueChange={(v) => setForm({ ...form, process: v, karigar_id: "", karigar_name: "" })}>
              <SelectTrigger data-testid="issue-process-select" className={inp}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCESS_ORDER.map((p) => (
                  <SelectItem key={p} value={p} data-testid={`issue-process-opt-${p}`}>
                    {PROCESS_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date">
            <Input data-testid="issue-date-input" type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} />
          </Field>
          <Field label="Karigar / Name">
            <Select
              value={form.karigar_id || "manual"}
              onValueChange={(v) => {
                if (v === "manual") return setForm({ ...form, karigar_id: "", karigar_name: "" });
                const k = karigars.find((x) => x.id === v);
                setForm({ ...form, karigar_id: v, karigar_name: k?.name || "" });
              }}
            >
              <SelectTrigger data-testid="issue-karigar-select" className={inp}>
                <SelectValue placeholder="Select karigar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">— Type manually —</SelectItem>
                {karigars.map((k) => (
                  <SelectItem key={k.id} value={k.id} data-testid={`issue-karigar-opt-${k.name}`}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!form.karigar_id && (
            <Field label="Name (manual)">
              <Input data-testid="issue-karigar-name-input" value={form.karigar_name}
                onChange={(e) => setForm({ ...form, karigar_name: e.target.value })} className={inp} />
            </Field>
          )}
          <Field label="Pcs">
            <Input data-testid="issue-pcs-input" type="number" value={form.pcs}
              onChange={(e) => setForm({ ...form, pcs: e.target.value })} className={inp} />
          </Field>
          <Field label="Weight (cts)">
            <Input data-testid="issue-weight-input" type="number" step="0.01" value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })} className={inp} />
          </Field>
          <Field label="Size (auto)">
            <Input data-testid="issue-size-display" value={size} readOnly className={`${inp} bg-zinc-100`} />
          </Field>
          {cfg.issue.map((f) =>
            f.type === "select" ? (
              <Field key={f.key} label={f.label}>
                <Select value={form[f.key]} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                  <SelectTrigger data-testid={`issue-${f.key}-select`} className={inp}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field key={f.key} label={f.label}>
                <Input data-testid={`issue-${f.key}-input`} type={f.type} step={f.step} value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={inp} />
              </Field>
            )
          )}
        </div>

        <DialogFooter>
          <Button data-testid="issue-submit-button" onClick={submit} disabled={busy || !form.weight}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Issuing…" : "Issue & Create Jangad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueDialog;
