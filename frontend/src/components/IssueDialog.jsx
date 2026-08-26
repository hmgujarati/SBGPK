import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError, ct, today } from "@/lib/api";
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

export const IssueDialog = ({ open, onOpenChange, packets = [], fixedPacketId, onDone }) => {
  const [form, setForm] = useState({
    packet_id: fixedPacketId || "",
    process: "sarine",
    date: today(),
    karigar_id: "",
    karigar_name: "",
    hw: "",
    ds: "Single",
    expected_return_pcs: "",
    notes: "",
  });
  const [karigars, setKarigars] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fixedPacketId) setForm((f) => ({ ...f, packet_id: fixedPacketId }));
  }, [fixedPacketId]);

  useEffect(() => {
    if (!open) setForm((f) => ({ ...f, packet_id: fixedPacketId || "" }));
  }, [open, fixedPacketId]);

  useEffect(() => {
    if (!open) return;
    api.get("/karigars", { params: { process: form.process } })
      .then((r) => setKarigars(r.data))
      .catch(() => setKarigars([]));
  }, [form.process, open]);

  const packet = useMemo(() => packets.find((p) => p.id === form.packet_id), [packets, form.packet_id]);
  const cfg = PROCESS_CONFIG[form.process] || { issue: [] };

  const submit = async () => {
    if (!form.packet_id) return toast.error("Select a packet");
    setBusy(true);
    try {
      const { data } = await api.post("/entries", {
        packet_id: form.packet_id,
        process: form.process,
        date: form.date,
        karigar_id: form.karigar_id || null,
        karigar_name: form.karigar_name,
        hw: form.hw,
        ds: form.ds,
        expected_return_pcs: Number(form.expected_return_pcs || 0),
        notes: form.notes,
      });
      toast.success(`Issued · Jangad ${data.jangad_no}`);
      onOpenChange(false);
      setForm((f) => ({ ...f, packet_id: fixedPacketId || "", hw: "", expected_return_pcs: "" }));
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
          <div className="col-span-2">
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Packet</Label>
            <Select value={form.packet_id} onValueChange={(v) => setForm({ ...form, packet_id: v })} disabled={Boolean(fixedPacketId)}>
              <SelectTrigger data-testid="issue-packet-select" className={inp}>
                <SelectValue placeholder="Select packet in stock" />
              </SelectTrigger>
              <SelectContent>
                {packets.length === 0 && <SelectItem value="none" disabled>No packets in stock</SelectItem>}
                {packets.map((p) => (
                  <SelectItem key={p.id} value={p.id} data-testid={`issue-packet-opt-${p.packet_no}`}>
                    {p.packet_no} · {p.pcs} pcs · {ct(p.weight)} ct
                    {p.last_process ? ` · after ${PROCESS_LABELS[p.last_process]}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <Field label="Pcs (from packet)">
            <Input data-testid="issue-pcs-display" value={packet?.pcs ?? ""} readOnly className={`${inp} bg-zinc-100`} />
          </Field>
          <Field label="Weight (from packet)">
            <Input data-testid="issue-weight-display" value={packet ? ct(packet.weight) : ""} readOnly className={`${inp} bg-zinc-100`} />
          </Field>
          <Field label="Size">
            <Input data-testid="issue-size-display" value={packet ? ct(packet.size) : ""} readOnly className={`${inp} bg-zinc-100`} />
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
          <Button data-testid="issue-submit-button" onClick={submit} disabled={busy || !form.packet_id}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Issuing…" : "Issue & Create Jangad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueDialog;
