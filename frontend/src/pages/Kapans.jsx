import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { api, apiError, ct, dec2, today } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const blank = { date: today(), kapan_no: "", type: "", pcs: "", weight: "", notes: "" };

export default function Kapans() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/kapans").then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => {
    load();
  }, []);

  const size = useMemo(() => {
    const p = Number(form.pcs || 0);
    return p ? (Number(form.weight || 0) / p).toFixed(2) : "0.00";
  }, [form.pcs, form.weight]);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/kapans", {
        date: form.date,
        kapan_no: form.kapan_no || Number(form.weight || 0).toFixed(2),
        type: form.type,
        pcs: Number(form.pcs || 0),
        weight: Number(form.weight || 0),
        notes: form.notes,
      });
      toast.success("Kapan created");
      setOpen(false);
      setForm(blank);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this kapan and all its entries?")) return;
    try {
      await api.delete(`/kapans/${id}`);
      toast.success("Kapan deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filtered = rows.filter(
    (r) =>
      !q ||
      r.kapan_no?.toLowerCase().includes(q.toLowerCase()) ||
      r.type?.toLowerCase().includes(q.toLowerCase())
  );

  const totals = filtered.reduce(
    (a, r) => {
      const p = r.report || {};
      a.weight += Number(r.weight || 0);
      a.rc += p.rc || 0;
      a.nail += p.nail_rc || 0;
      a.laser += p.laser_loss || 0;
      a.polish += p.polish_loss || 0;
      a.shape += p.shape_ghat_loss || 0;
      a.pol_w += p.polish_weight || 0;
      a.inproc += p.in_process_weight || 0;
      return a;
    },
    { weight: 0, rc: 0, nail: 0, laser: 0, polish: 0, shape: 0, pol_w: 0, inproc: 0 }
  );

  return (
    <div data-testid="kapans-page">
      <PageHeader title="Kapan Register" subtitle="Rough lots with live weight reconciliation">
        <div className="relative">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            data-testid="kapan-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search kapan no / type"
            className="h-9 w-full rounded-none border-black/15 pl-8 sm:w-56"
          />
        </div>
        {can("can_create") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="add-kapan-button"
                className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800"
              >
                <Plus size={14} className="mr-1" /> New Kapan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg rounded-none" data-testid="kapan-dialog">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wide">New Kapan</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider">Date</Label>
                  <Input data-testid="kapan-date-input" type="date" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Type</Label>
                  <Input data-testid="kapan-type-input" value={form.type} placeholder="e.g. Polki"
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Pcs</Label>
                  <Input data-testid="kapan-pcs-input" type="number" value={form.pcs}
                    onChange={(e) => setForm({ ...form, pcs: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Weight (cts)</Label>
                  <Input data-testid="kapan-weight-input" type="text" inputMode="decimal" value={form.weight}
                    onChange={(e) => {
                      const w = dec2(e.target.value);
                      setForm((f) => ({
                        ...f,
                        weight: w,
                        kapan_no: f.kapan_no && f.kapan_no !== Number(f.weight || 0).toFixed(2)
                          ? f.kapan_no
                          : Number(w || 0).toFixed(2),
                      }));
                    }}
                    className="mt-1 h-10 rounded-none border-black/15 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Kapan No (= weight)</Label>
                  <Input data-testid="kapan-no-input" value={form.kapan_no}
                    onChange={(e) => setForm({ ...form, kapan_no: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15 tabular-nums font-semibold" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Size (auto)</Label>
                  <Input data-testid="kapan-size-display" value={size} readOnly
                    className="mt-1 h-10 rounded-none border-black/15 bg-zinc-100 tabular-nums" />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="kapan-save-button" onClick={save} disabled={busy || !form.weight}
                  className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
                  {busy ? "Saving…" : "Create Kapan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {filtered.length === 0 ? (
        <Empty testid="kapans-empty" text="No kapan yet. Create your first rough lot to begin tracking." />
      ) : (
        <div className="overflow-x-auto border border-black/10 bg-white">
          <table className="w-full min-w-[1080px] border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white">
                {["Date", "Kapan No", "Type", "Pcs", "Weight", "Size", "Pkts", "Stage", "RC", "Nail RC", "Laser Loss", "Shape/Ghat", "Polish Loss", "Polish Wt", "In Process", "Diff", ""].map((h, i) => (
                  <th key={h + i} className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${i >= 3 && i !== 7 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const p = r.report || {};
                return (
                  <tr key={r.id} data-testid={`kapan-row-${r.kapan_no}`} className="border-b border-black/5 transition-colors hover:bg-zinc-50">
                    <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{r.date}</td>
                    <td className="border-r border-black/5 px-2.5 py-2">
                      <Link to={`/kapans/${r.id}`} data-testid={`kapan-link-${r.kapan_no}`}
                        className="font-heading font-bold tabular-nums underline decoration-[#B4975A] decoration-2 underline-offset-4 transition-colors hover:text-[#B4975A]">
                        {r.kapan_no}
                      </Link>
                    </td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-zinc-600">{r.type || "—"}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{r.pcs}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums">{ct(r.weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-zinc-500">{ct(r.size)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{p.packet_count ?? 0}</td>
                    <td className="border-r border-black/5 px-2.5 py-2">
                      <span className="border border-black/10 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        {p.current_stage_label || "New"}
                      </span>
                    </td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(p.rc)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(p.nail_rc)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(p.laser_loss)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(p.shape_ghat_loss)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(p.polish_loss)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums text-[#16A34A]">{ct(p.polish_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#B4975A]">{ct(p.in_process_weight)}</td>
                    <td className={`border-r border-black/5 px-2.5 py-2 text-right tabular-nums ${p.balanced ? "text-zinc-400" : "font-semibold text-[#DC2626]"}`}>
                      {ct(p.difference)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {can("can_delete") && (
                        <button data-testid={`kapan-delete-${r.kapan_no}`} onClick={() => remove(r.id)}
                          className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                          <Trash size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-zinc-100 font-semibold" data-testid="kapan-totals-row">
                <td className="px-2.5 py-2.5 uppercase tracking-wider" colSpan={4}>Total ({filtered.length})</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.weight)}</td>
                <td colSpan={3} />
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.rc)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.nail)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.laser)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.shape)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.polish)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.pol_w)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{ct(totals.inproc)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
