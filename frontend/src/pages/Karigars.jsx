import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple } from "@phosphor-icons/react";
import { api, apiError } from "@/lib/api";
import { PROCESS_LABELS, PROCESS_ORDER } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const blank = { name: "", phone: "", processes: [], notes: "", active: true };

export default function Karigars() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank);

  const load = () => api.get("/karigars").then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (editId) await api.put(`/karigars/${editId}`, form);
      else await api.post("/karigars", form);
      toast.success(editId ? "Karigar updated" : "Karigar added");
      setOpen(false);
      setForm(blank);
      setEditId(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try {
      await api.delete(`/karigars/${r.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleProc = (p) =>
    setForm((f) => ({
      ...f,
      processes: f.processes.includes(p) ? f.processes.filter((x) => x !== p) : [...f.processes, p],
    }));

  return (
    <div data-testid="karigars-page">
      <PageHeader title="Karigar Management" subtitle="Workers mapped to manufacturing processes">
        {can("can_manage_karigar") && (
          <Button data-testid="add-karigar-button"
            onClick={() => { setForm(blank); setEditId(null); setOpen(true); }}
            className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
            <Plus size={14} className="mr-1" /> Add Karigar
          </Button>
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <Empty testid="karigars-empty" text="No karigars yet. Add polish, laser, shape cutting and sarine workers." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} data-testid={`karigar-card-${r.name}`}
              className="border border-black/10 bg-white p-4 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-heading text-base font-bold">{r.name}</div>
                  <div className="text-xs text-zinc-500">{r.phone || "No phone"}</div>
                </div>
                <div className="flex gap-2">
                  {can("can_edit") && (
                    <button data-testid={`karigar-edit-${r.name}`}
                      onClick={() => { setForm({ name: r.name, phone: r.phone || "", processes: r.processes || [], notes: r.notes || "", active: r.active !== false }); setEditId(r.id); setOpen(true); }}
                      className="text-zinc-400 transition-colors hover:text-zinc-900">
                      <PencilSimple size={15} />
                    </button>
                  )}
                  {can("can_delete") && (
                    <button data-testid={`karigar-delete-${r.name}`} onClick={() => remove(r)}
                      className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                      <Trash size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(r.processes || []).length === 0 && <span className="text-xs text-zinc-400">No process assigned</span>}
                {(r.processes || []).map((p) => (
                  <span key={p} className="border border-black/10 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    {PROCESS_LABELS[p] || p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none" data-testid="karigar-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wide">
              {editId ? "Edit Karigar" : "Add Karigar"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider">Name</Label>
              <Input data-testid="karigar-name-input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 h-10 rounded-none border-black/15" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Phone</Label>
              <Input data-testid="karigar-phone-input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 h-10 rounded-none border-black/15" />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Processes</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROCESS_ORDER.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 border border-black/10 px-2 py-1.5 text-xs transition-colors hover:bg-zinc-50">
                  <Checkbox data-testid={`karigar-proc-${p}`} checked={form.processes.includes(p)}
                    onCheckedChange={() => toggleProc(p)} className="rounded-none" />
                  {PROCESS_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="karigar-save-button" onClick={save} disabled={!form.name}
              className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
