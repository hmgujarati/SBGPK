import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash, Barcode } from "@phosphor-icons/react";
import { api, apiError, ct, dec2, today } from "@/lib/api";
import { PROCESS_LABELS } from "@/lib/processConfig";
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

export const IssueDialog = ({ open, onOpenChange, onDone }) => {
  const [form, setForm] = useState({ date: today(), karigar_id: "", karigar_name: "" });
  const [cart, setCart] = useState([]);
  const [scan, setScan] = useState("");
  const [karigars, setKarigars] = useState([]);
  const [stock, setStock] = useState({ items: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);

  // the jangad's process and kapan type come from the packets themselves
  const pProcess = (p) => p?.process || p?.last_process || null;
  const process = pProcess(cart[0]);
  const isSP = cart[0]?.mode === "sp_stone";

  useEffect(() => {
    if (!open) {
      setCart([]);
      setScan("");
      setForm({ date: today(), karigar_id: "", karigar_name: "" });
    } else {
      setTimeout(() => scanRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.get("/karigars", { params: process ? { process } : {} })
      .then((r) => setKarigars(r.data))
      .catch(() => setKarigars([]));
    api.get("/packets", {
      params: {
        status: "in_stock",
        ...(process ? { process, mode: isSP ? "sp" : "normal" } : {}),
        limit: 200,
      },
    })
      .then((r) => setStock({ items: r.data.items, total: r.data.total }))
      .catch(() => setStock({ items: [], total: 0 }));
  }, [process, isSP, open]);

  // a karigar picked for one process should not stay selected if the process changes
  useEffect(() => {
    setForm((f) => ({ ...f, karigar_id: "", karigar_name: "" }));
  }, [process]);

  const available = useMemo(
    () => stock.items.filter((p) => !cart.some((c) => c.id === p.id)),
    [stock, cart]
  );

  const totals = cart.reduce(
    (a, p) => ({ pcs: a.pcs + Number(p.pcs || 0), weight: a.weight + Number(p.weight || 0) }),
    { pcs: 0, weight: 0 }
  );

  const add = (p) => {
    if (cart.some((c) => c.id === p.id)) return toast.error(`${p.packet_no} is already in the list`);
    if (p.status === "issued") return toast.error(`${p.packet_no} is already out with a karigar`);
    if (process && pProcess(p) !== process)
      return toast.error(
        `${p.packet_no} is in the ${PROCESS_LABELS[pProcess(p)] || "unassigned"} list — this jangad is ${PROCESS_LABELS[process]}`
      );
    if (cart.length && (p.mode === "sp_stone") !== isSP)
      return toast.error(
        isSP
          ? `${p.packet_no} is a normal kapan packet — this jangad is for SP kapan stones`
          : `${p.packet_no} belongs to an SP kapan stone — this jangad is for normal kapans`
      );
    setCart((c) => [...c, p]);
  };

  const scanAdd = async (e) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    try {
      const { data } = await api.get("/packets/lookup", { params: { code } });
      add(data);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setScan("");
      scanRef.current?.focus();
    }
  };

  const submit = async () => {
    if (!cart.length) return toast.error("Scan or add at least one packet");
    setBusy(true);
    try {
      const { data } = await api.post("/jangads", {
        process,
        date: form.date,
        packet_ids: cart.map((p) => p.id),
        karigar_id: form.karigar_id || null,
        karigar_name: form.karigar_name,
      });
      toast.success(`Jangad ${data.jangad_no} · ${data.count} packets issued`);
      onOpenChange(false);
      setCart([]);
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
            Issue Packets — scan into the list
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Process (auto-detected)">
            <div data-testid="issue-detected-process"
              className="mt-1 flex h-10 items-center border border-black/15 bg-zinc-50 px-3 text-sm">
              {process
                ? `${isSP ? "SP · " : ""}${PROCESS_LABELS[process]}`
                : <span className="text-zinc-400">Scan a packet to set the process</span>}
            </div>
          </Field>
          <Field label="Date">
            <Input data-testid="issue-date-input" type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} />
          </Field>
          <Field label={`${process ? PROCESS_LABELS[process] : ""} Karigar`}>
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
        </div>

        {process && karigars.length === 0 && (
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-[#B4975A]" data-testid="issue-no-karigar-warning">
            No karigar is registered for {PROCESS_LABELS[process]} — add one in Karigar, or type a name manually.
          </p>
        )}

        <form onSubmit={scanAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-[11px] uppercase tracking-wider text-zinc-600">
              Scan packet barcode / type code
            </Label>
            <Input ref={scanRef} data-testid="issue-scan-input" value={scan} autoComplete="off"
              placeholder="00042"
              onChange={(e) => setScan(e.target.value)}
              className={`${inp} font-heading text-base tracking-[0.2em]`} />
          </div>
          <Button type="submit" data-testid="issue-scan-add-button"
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            <Barcode size={15} className="mr-1" /> Add
          </Button>
        </form>

        <div className="max-h-[32vh] overflow-auto border border-black/10">
          <table className="w-full border-collapse text-xs" data-testid="issue-cart-table">
            <thead className="sticky top-0">
              <tr className="bg-zinc-900 text-white">
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">#</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Code</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Kapan</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Packet</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider">Stage</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider">Pcs</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider">Weight</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                    Nothing scanned yet — scan a packet sticker or pick one below.
                  </td>
                </tr>
              )}
              {cart.map((p, i) => (
                <tr key={p.id} className="border-b border-black/5" data-testid={`issue-cart-row-${p.packet_no}`}>
                  <td className="px-2 py-1.5 text-zinc-400">{i + 1}</td>
                  <td className="px-2 py-1.5 font-heading font-bold tabular-nums tracking-widest">{p.code || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{p.kapan_no}</td>
                  <td className="px-2 py-1.5 font-semibold tabular-nums">{p.packet_no}</td>
                  <td className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                    {p.last_process ? `after ${PROCESS_LABELS[p.last_process]}` : "new"}
                  </td>

                  <td className="px-2 py-1.5 text-right tabular-nums">{p.pcs}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{ct(p.weight)}</td>

                  <td className="px-2 py-1.5 text-right">
                    <button data-testid={`issue-cart-remove-${p.packet_no}`}
                      onClick={() => setCart((c) => c.filter((x) => x.id !== p.id))}
                      className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="border border-black/10" data-testid="issue-available-wrap">
          <summary className="cursor-pointer bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            {process ? PROCESS_LABELS[process] : "All"} stock — {stock.total} packet(s) available
            {stock.total > stock.items.length && ` (showing first ${stock.items.length} — scan to add any other)`}
          </summary>
          <div className="max-h-[24vh] overflow-auto">
            <table className="w-full border-collapse text-xs" data-testid="issue-packet-table">
              <tbody>
                {available.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-zinc-500">
                      No packets in stock{process ? ` for ${PROCESS_LABELS[process]}` : ""} — create them in the
                      kapan's process register first.
                    </td>
                  </tr>
                )}
                {available.map((p) => (
                  <tr key={p.id} data-testid={`issue-packet-row-${p.packet_no}`}
                    onClick={() => add(p)}
                    className="cursor-pointer border-b border-black/5 transition-colors hover:bg-[#B4975A]/10">
                    <td className="px-2 py-1.5 font-heading font-bold tabular-nums tracking-widest">{p.code || "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{p.kapan_no}</td>
                    <td className="px-2 py-1.5 font-semibold tabular-nums">{p.packet_no}</td>
                    <td className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      {p.last_process ? `after ${PROCESS_LABELS[p.last_process]}` : "new"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.pcs}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{ct(p.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#B4975A]/40 bg-[#B4975A]/5 px-3 py-2 text-xs" data-testid="issue-selection-summary">
          <span>In list: <b className="tabular-nums">{cart.length}</b> packets</span>
          <span>Total Pcs: <b className="tabular-nums">{totals.pcs}</b></span>
          <span>Total Weight: <b className="tabular-nums">{ct(totals.weight)}</b> cts</span>
        </div>

        <DialogFooter>
          <Button data-testid="issue-submit-button" onClick={submit} disabled={busy || !cart.length}
            className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
            {busy ? "Issuing…" : `Issue ${cart.length || ""} Packets & Create Jangad`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueDialog;
