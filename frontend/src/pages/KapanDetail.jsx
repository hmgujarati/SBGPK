import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { api, apiError, ct } from "@/lib/api";
import { PROCESS_LABELS, PROCESS_ORDER } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Stat } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import ReceiveDialog from "@/components/ReceiveDialog";
import EditEntryDialog from "@/components/EditEntryDialog";
import BulkPacketDialog from "@/components/BulkPacketDialog";
import { EntryTable, PacketStockTable } from "@/pages/Packets";

export default function KapanDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [k, setK] = useState(null);
  const [tab, setTab] = useState("sarine");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.get(`/kapans/${id}`).then((r) => setK(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!k) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const p = k.report || {};
  const rows = (k.entries || []).filter((e) => e.process === tab).map((e) => ({ ...e, kapan_no: k.kapan_no }));

  const removeEntry = async (e) => {
    if (!window.confirm(`Delete jangad ${e.jangad_no}? The packet returns to its previous weight.`)) return;
    try {
      await api.delete(`/entries/${e.id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const countFor = (proc) => (k.entries || []).filter((e) => e.process === proc).length;

  return (
    <div data-testid="kapan-detail-page">
      <Link to="/kapans" data-testid="back-to-kapans"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900">
        <ArrowLeft size={13} /> Kapan register
      </Link>

      <PageHeader
        title={`Kapan ${k.kapan_no}`}
        subtitle={`${k.date} · ${k.type || "—"} · ${k.pcs} pcs · ${ct(k.weight)} cts · size ${ct(k.size)} · ${p.packet_count || 0} packets`}
      />

      <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
        Weight reconciliation
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat testid="rep-kapan-weight" label="Kapan Weight" value={ct(p.kapan_weight)} unit="ct" />
        <Stat testid="rep-rc" label="RC" value={ct(p.rc)} unit="ct" />
        <Stat testid="rep-nail-rc" label="Nail RC" value={ct(p.nail_rc)} unit="ct" />
        <Stat testid="rep-laser-loss" label="Laser Loss" value={ct(p.laser_loss)} unit="ct" tone="warn" />
        <Stat testid="rep-shape-loss" label="Shape / Ghat Loss" value={ct(p.shape_ghat_loss)} unit="ct" tone="warn" />
        <Stat testid="rep-polish-loss" label="Polish Loss" value={ct(p.polish_loss)} unit="ct" tone="warn" />
        <Stat testid="rep-polish-weight" label="Polish Weight" value={ct(p.polish_weight)} unit="ct" tone="good" />
        <Stat testid="rep-in-process" label="In Process" value={ct(p.in_process_weight)} unit="ct" tone="accent" />
      </div>

      <div
        data-testid="balance-bar"
        className={`mt-3 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-xs ${
          p.balanced ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Un-packeted: <b className="tabular-nums" data-testid="rep-unpacketed">{ct(p.unpacketed_weight)}</b></span>
          <span>Stock (pre-polish): <b className="tabular-nums">{ct(p.stock_weight)}</b></span>
          <span>Boil: <b className="tabular-nums">{ct(p.boil)}</b></span>
          <span>Nats Loss: <b className="tabular-nums">{ct(p.nats_loss)}</b></span>
          <span>Sarine / Marking Loss: <b className="tabular-nums" data-testid="rep-other-loss">{ct(p.other_loss)}</b></span>
          <span>Filling Gain: <b className="tabular-nums">{ct(p.filling_gain)}</b></span>
          <span>Accounted: <b className="tabular-nums">{ct(p.accounted_weight)}</b></span>
        </div>
        <div className={`font-heading text-sm font-bold uppercase tracking-wide ${p.balanced ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
          {p.balanced ? "Balanced" : `Unaccounted ${ct(p.difference)} ct`}
        </div>
      </div>

      <div className="no-print mt-6 flex flex-wrap gap-1 border-b border-black/10 pb-2">
        {PROCESS_ORDER.map((t) => {
          const n = countFor(t);
          return (
            <button
              key={t}
              data-testid={`kapan-tab-${t}`}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                tab === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {PROCESS_LABELS[t]}
              {n > 0 && <span className="ml-1 opacity-60">({n})</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            {PROCESS_LABELS[tab]} register
          </h3>
          {can("can_create") && (
            <Button data-testid="bulk-add-packets-button" onClick={() => setBulkOpen(true)}
              className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
              <Plus size={14} className="mr-1" /> Add Packets to {PROCESS_LABELS[tab]}
            </Button>
          )}
        </div>
        <PacketStockTable rows={(k.packets || []).filter((x) => x.process === tab && x.status !== "issued")} />
        <EntryTable rows={rows} onReceive={setReceiving} onDelete={removeEntry} onEdit={setEditing} showKapan={false} showSr />
      </div>

      <BulkPacketDialog open={bulkOpen} onOpenChange={setBulkOpen} kapanId={id} process={tab}
        remaining={p.unpacketed_weight} onDone={load} />
      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
      <EditEntryDialog entry={editing} onClose={() => setEditing(null)} onDone={load} />
    </div>
  );
}
