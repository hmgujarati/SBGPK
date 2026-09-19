import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { api, apiError, ct, dec2, today } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty, Pager } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const blank = { date: today(), kapan_no: "", type: "", pcs: "", weight: "", notes: "" };
const LIMIT = 100;

export default function SPKapans() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get("/kapans", { params: { mode: "sp", q: q || undefined, page, limit: LIMIT } })
      .then((r) => {
        setRows(r.data.items);
        setTotal(r.data.total);
      })
      .catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page]);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/kapans", {
        date: form.date,
        kapan_no: form.kapan_no || Number(form.weight || 0).toFixed(2),
        type: form.type,
        pcs: Number(form.pcs || 0),
        weight: Number(form.weight || 0),
        mode: "sp",
        notes: form.notes,
      });
      toast.success("SP Kapan created");
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
    if (!window.confirm("Delete this SP kapan with all its stones and history?")) return;
    try {
      await api.delete(`/kapans/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="sp-kapans-page">
      <PageHeader title="SP Kapan" subtitle="Single-packet kapan — one big stone per packet, tracked stone by stone">
        <div className="relative">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input data-testid="sp-kapan-search-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search kapan no / type" className="h-9 w-full rounded-none border-black/15 pl-8 sm:w-56" />
        </div>
        {can("can_create") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-sp-kapan-button"
                className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest hover:bg-zinc-800">
                <Plus size={14} className="mr-1" /> New SP Kapan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg rounded-none" data-testid="sp-kapan-dialog">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wide">New SP Kapan</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider">Date</Label>
                  <Input data-testid="sp-kapan-date-input" type="date" value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Type</Label>
                  <Input data-testid="sp-kapan-type-input" value={form.type} placeholder="e.g. Polki"
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Pcs</Label>
                  <Input data-testid="sp-kapan-pcs-input" type="number" value={form.pcs}
                    onChange={(e) => setForm({ ...form, pcs: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider">Weight (cts)</Label>
                  <Input data-testid="sp-kapan-weight-input" type="text" inputMode="decimal" value={form.weight}
                    onChange={(e) => {
                      const w = dec2(e.target.value);
                      setForm((f) => ({
                        ...f,
                        weight: w,
                        kapan_no: f.kapan_no && f.kapan_no !== Number(f.weight || 0).toFixed(2)
                          ? f.kapan_no : Number(w || 0).toFixed(2),
                      }));
                    }}
                    className="mt-1 h-10 rounded-none border-black/15 tabular-nums" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs uppercase tracking-wider">Kapan No (= weight)</Label>
                  <Input data-testid="sp-kapan-no-input" value={form.kapan_no}
                    onChange={(e) => setForm({ ...form, kapan_no: e.target.value })}
                    className="mt-1 h-10 rounded-none border-black/15 font-semibold tabular-nums" />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="sp-kapan-save-button" onClick={save} disabled={busy || !form.weight}
                  className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
                  {busy ? "Saving…" : "Create SP Kapan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <Empty testid="sp-kapans-empty" text="No SP kapan yet. Create one, then add its stones one by one." />
      ) : (
        <div className="overflow-x-auto border border-black/10 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white">
                {["Date", "Kapan No", "Type", "Pcs", "Weight", "Stones", "Un-packeted", "In Process", "Loss", ""].map((h, i) => (
                  <th key={h + i} className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${i >= 3 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.report || {};
                const loss = (p.laser_loss || 0) + (p.shape_ghat_loss || 0) + (p.polish_loss || 0) + (p.other_loss || 0);
                return (
                  <tr key={r.id} data-testid={`sp-kapan-row-${r.kapan_no}`} className="border-b border-black/5 hover:bg-zinc-50">
                    <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{r.date}</td>
                    <td className="border-r border-black/5 px-2.5 py-2">
                      <Link to={`/sp-kapans/${r.id}`} data-testid={`sp-kapan-link-${r.kapan_no}`}
                        className="font-heading font-bold tabular-nums underline decoration-[#B4975A] decoration-2 underline-offset-4 hover:text-[#B4975A]">
                        {r.kapan_no}
                      </Link>
                    </td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-zinc-600">{r.type || "—"}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{r.pcs}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums">{ct(r.weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{p.packet_count ?? 0}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{ct(p.unpacketed_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#B4975A]">{ct(p.in_process_weight)}</td>
                    <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-[#DC2626]">{ct(loss)}</td>
                    <td className="px-2 py-2 text-right">
                      {can("can_delete") && (
                        <button data-testid={`sp-kapan-delete-${r.kapan_no}`} onClick={() => remove(r.id)}
                          className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                          <Trash size={15} />
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
      <Pager page={page} limit={LIMIT} total={total} onPage={setPage} testid="sp-kapans-pager" label="SP kapans" />
    </div>
  );
}
