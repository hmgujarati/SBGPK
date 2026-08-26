import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple } from "@phosphor-icons/react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Empty } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERMS = [
  { key: "can_create", label: "Create entries" },
  { key: "can_edit", label: "Edit entries" },
  { key: "can_delete", label: "Delete entries" },
  { key: "can_manage_karigar", label: "Manage karigars" },
  { key: "can_manage_staff", label: "Manage staff" },
];

const blank = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  permissions: { can_create: true, can_edit: false, can_delete: false, can_manage_karigar: false, can_manage_staff: false },
};

export default function Staff() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank);

  const load = () => api.get("/users").then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (editId) {
        const body = { name: form.name, role: form.role, permissions: form.permissions };
        if (form.password) body.password = form.password;
        await api.put(`/users/${editId}`, body);
      } else {
        await api.post("/users", form);
      }
      toast.success(editId ? "Staff updated" : "Staff created");
      setOpen(false);
      setForm(blank);
      setEditId(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.email}?`)) return;
    try {
      await api.delete(`/users/${r.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleActive = async (r) => {
    try {
      await api.put(`/users/${r.id}`, { active: !(r.active !== false) });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="staff-page">
      <PageHeader title="Staff & Admin" subtitle="Logins and access rights">
        <Button data-testid="add-staff-button"
          onClick={() => { setForm(blank); setEditId(null); setOpen(true); }}
          className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
          <Plus size={14} className="mr-1" /> New Staff
        </Button>
      </PageHeader>

      {rows.length === 0 ? (
        <Empty testid="staff-empty" text="No users." />
      ) : (
        <div className="overflow-x-auto border border-black/10 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white">
                {["Name", "Email", "Role", "Create", "Edit", "Delete", "Karigar", "Staff", "Active", ""].map((h) => (
                  <th key={h} className="border-r border-white/10 px-2.5 py-2.5 text-left font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`staff-row-${r.email}`} className="border-b border-black/5 transition-colors hover:bg-zinc-50">
                  <td className="border-r border-black/5 px-2.5 py-2 font-semibold">{r.name}</td>
                  <td className="border-r border-black/5 px-2.5 py-2 text-zinc-600">{r.email}</td>
                  <td className="border-r border-black/5 px-2.5 py-2">
                    <span className="border border-black/10 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{r.role}</span>
                  </td>
                  {PERMS.map((p) => (
                    <td key={p.key} className="border-r border-black/5 px-2.5 py-2">
                      {r.role === "admin" || r.permissions?.[p.key] ? (
                        <span className="text-[#16A34A]">Yes</span>
                      ) : (
                        <span className="text-zinc-300">No</span>
                      )}
                    </td>
                  ))}
                  <td className="border-r border-black/5 px-2.5 py-2">
                    <Switch data-testid={`staff-active-${r.email}`} checked={r.active !== false}
                      onCheckedChange={() => toggleActive(r)} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button data-testid={`staff-edit-${r.email}`}
                      onClick={() => { setForm({ name: r.name, email: r.email, password: "", role: r.role, permissions: { ...blank.permissions, ...(r.permissions || {}) } }); setEditId(r.id); setOpen(true); }}
                      className="mr-2 text-zinc-400 transition-colors hover:text-zinc-900">
                      <PencilSimple size={15} />
                    </button>
                    {r.id !== user?.id && (
                      <button data-testid={`staff-delete-${r.email}`} onClick={() => remove(r)}
                        className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                        <Trash size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none" data-testid="staff-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wide">
              {editId ? "Edit Staff" : "New Staff"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider">Name</Label>
              <Input data-testid="staff-name-input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 h-10 rounded-none border-black/15" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Email</Label>
              <Input data-testid="staff-email-input" type="email" value={form.email} disabled={Boolean(editId)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 h-10 rounded-none border-black/15" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">
                {editId ? "New Password (optional)" : "Password"}
              </Label>
              <Input data-testid="staff-password-input" type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 h-10 rounded-none border-black/15" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="staff-role-select" className="mt-1 h-10 rounded-none border-black/15">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Access rights</Label>
            <div className="mt-2 space-y-1.5">
              {PERMS.map((p) => (
                <label key={p.key} className="flex items-center justify-between border border-black/10 px-3 py-2 text-xs">
                  {p.label}
                  <Switch data-testid={`perm-${p.key}`} checked={form.role === "admin" || form.permissions[p.key]}
                    disabled={form.role === "admin"}
                    onCheckedChange={(c) => setForm({ ...form, permissions: { ...form.permissions, [p.key]: c } })} />
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="staff-save-button" onClick={save}
              disabled={!form.name || !form.email || (!editId && !form.password)}
              className="h-10 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
