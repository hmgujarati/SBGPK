import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError, ct, today } from "@/lib/api";
import { PROCESS_CONFIG, PROCESS_LABELS, PROCESS_ORDER } from "@/lib/processConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";
const Field = ({ label, children }) => (
  <div>
    <Label className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</Label>
    {children}
  </div>
);

export const IssueDialog = ({ open, onOpenChange, packets = [], onDone }) => {
  const [form, setForm] = useState({
    process: "sarine",
    date: today(),
    karigar_id: "",
    karigar_name: "",
    ds: "Single",
  });
  const [picked, setPicked] = useState([]);
  const [karigars, setKarigars] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.get("/karigars", { params: { process: form.process } })
      .then((r) => setKarigars(r.data))
      .catch(() => setKarigars([]));
  }, [form.process, open]);

  const cfg = PROCESS_CONFIG[form.process] || { issue: [] };
  const chosen = useMemo(() => packets.filter((p) => picked.includes(p.id)), [packets, picked]);
  const totals = chosen.reduce(
    (a, p) => ({ pcs: a.pcs + Number(p.pcs || 0), weight: a.weight + Number(p.weight || 0) }),
    { pcs: 0, weight: 0 }
  );

  const toggle = (id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allPicked = packets.length > 0 && picked.length === packets.length;

  const submit = async () => {
    if (!picked.length) return toast.error("Select at least one packet");
    setBusy(true);
    try {
      const { data } = await api.post("/jangads", {
        process: form.process,
        date: form.date,
        packet_ids: picked,
        karigar_id: form.karigar_id || null,
        karigar_name: form.karigar_name,
        ds: form.ds,
      });
      toast.success(`Jangad ${data.jangad_no} · ${data.count} packets issued`);
      onOpenChange(false);
      setPicked([]);
      onDone?.(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none" data-testid="issue-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">
            Issue Packets — one Jangad
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <Field label="Karigar">
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

        <div className="max-h-[38vh] overflow-auto border border-black/10">
          <table className="w-full border-collapse text-xs" data-testid="issue-packet-table">
            <thead className="sticky top-0">
              <tr className="bg-zinc-900 text-white">
                <th className="px-2 py-2 text-left">
                  <Checkbox data-testid="issue-select-all" checked={allPicked} className="rounded-none border-white/40"
                    onCheckedChange={(c) => setPicked(c ? packets.map((p) => p.id) : [])} />
                </th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Kapan</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Packet</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider">Pcs</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider">Weight</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Last Process</th>
              </tr>
            </thead>
            <tbody>
              {packets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                    No packets in stock. Create packets from a Kapan process register first.
                  </td>
                </tr>
              )}
              {packets.map((p) => (
                <tr key={p.id} data-testid={`issue-packet-row-${p.packet_no}`}
                  onClick={() => toggle(p.id)}
                  className={`cursor-pointer border-b border-black/5 transition-colors ${picked.includes(p.id) ? "bg-[#B4975A]/10" : "hover:bg-zinc-50"}`}>
                  <td className="px-2 py-1.5">
                    <Checkbox data-testid={`issue-packet-check-${p.packet_no}`} checked={picked.includes(p.id)}
                      onCheckedChange={() => toggle(p.id)} className="rounded-none" />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{p.kapan_no}</td>
                  <td className="px-2 py-1.5 font-semibold tabular-nums">{p.packet_no}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.pcs}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{ct(p.weight)}</td>
                  <td className="px-2 py-1.5 text-zinc-500">{PROCESS_LABELS[p.last_process] || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {form.process === "laser" && (
          <p className="border border-black/10 bg-zinc-50 px-3 py-2 text-xs text-zinc-600" data-testid="issue-expected-hint">
            H/W and Tops come from the packet — set them when creating packets in the Laser register.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#B4975A]/40 bg-[#B4975A]/5 px-3 py-2 text-xs" data-testid="issue-selection-summary">
          <span>Selected: <b className="tabular-nums">{picked.length}</b> packets</span>
          <span>Total Pcs: <b className="tabular-nums">{totals.pcs}</b></span>
          <span>Total Weight: <b className="tabular-nums">{ct(totals.weight)}</b> cts</span>
        </div>

        <DialogFooter>
          <Button data-testid="issue-submit-button" onClick={submit} disabled={busy || !picked.length}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Issuing…" : `Issue ${picked.length || ""} Packets & Create Jangad`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueDialog;
