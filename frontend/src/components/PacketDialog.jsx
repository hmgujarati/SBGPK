import { useState } from "react";
import { toast } from "sonner";
import { api, apiError, today } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";

export const PacketDialog = ({ open, onOpenChange, kapanId, remaining, onDone }) => {
  const [form, setForm] = useState({ date: today(), pcs: "", weight: "" });
  const [busy, setBusy] = useState(false);

  const size = Number(form.pcs || 0) ? (Number(form.weight || 0) / Number(form.pcs)).toFixed(2) : "0.00";

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/kapans/${kapanId}/packets`, {
        date: form.date,
        pcs: Number(form.pcs || 0),
        weight: Number(form.weight || 0),
      });
      toast.success(`Packet ${data.packet_no} created`);
      setForm({ date: today(), pcs: "", weight: "" });
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
      <DialogContent className="max-w-lg rounded-none" data-testid="packet-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wide">New Packet</DialogTitle>
        </DialogHeader>
        <p className="border border-black/10 bg-zinc-50 px-3 py-2 text-xs" data-testid="packet-remaining">
          Un-packeted weight left in this kapan:{" "}
          <b className="tabular-nums">{Number(remaining || 0).toFixed(2)} cts</b>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Date</Label>
            <Input data-testid="packet-date-input" type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Pcs</Label>
            <Input data-testid="packet-pcs-input" type="number" value={form.pcs}
              onChange={(e) => setForm({ ...form, pcs: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Weight (cts)</Label>
            <Input data-testid="packet-weight-input" type="number" step="0.01" value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })} className={inp} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Size (auto)</Label>
            <Input data-testid="packet-size-display" value={size} readOnly className={`${inp} bg-zinc-100`} />
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="packet-save-button" onClick={submit} disabled={busy || !form.weight}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Saving…" : "Create Packet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PacketDialog;
