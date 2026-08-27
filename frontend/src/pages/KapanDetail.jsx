import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react";
import { api, apiError, ct } from "@/lib/api";
import { PROCESS_LABELS, PROCESS_ORDER } from "@/lib/processConfig";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Stat, Empty } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import IssueDialog from "@/components/IssueDialog";
import ReceiveDialog from "@/components/ReceiveDialog";
import PacketDialog from "@/components/PacketDialog";
import BulkPacketDialog from "@/components/BulkPacketDialog";
import { EntryTable } from "@/pages/Packets";

export default function KapanDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [k, setK] = useState(null);
  const [tab, setTab] = useState("packets");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuePacket, setIssuePacket] = useState(null);
  const [packetOpen, setPacketOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const load = useCallback(() => {
    api.get(`/kapans/${id}`).then((r) => setK(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!k) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const p = k.report || {};
  const packets = k.packets || [];
  const stock = packets.filter((x) => x.status !== "issued");

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

  const removePacket = async (pk) => {
    if (!window.confirm(`Delete packet ${pk.packet_no}?`)) return;
    try {
      await api.delete(`/packets/${pk.id}`);
      toast.success("Packet deleted");
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const openIssue = (pk) => {
    setIssuePacket(pk.id);
    setIssueOpen(true);
  };

  return (
    <div data-testid="kapan-detail-page">
      <Link to="/kapans" data-testid="back-to-kapans"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900">
        <ArrowLeft size={13} /> Kapan register
      </Link>

      <PageHeader
        title={`Kapan ${k.kapan_no}`}
        subtitle={`${k.date} · ${k.type || "—"} · ${k.pcs} pcs · ${ct(k.weight)} cts · size ${ct(k.size)}`}
      >
        {can("can_create") && (
          <Button data-testid="add-packet-button" onClick={() => setPacketOpen(true)}
            className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
            <Plus size={14} className="mr-1" /> New Packet
          </Button>
        )}
      </PageHeader>

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
        {["packets", ...PROCESS_ORDER].map((t) => (
          <button
            key={t}
            data-testid={`kapan-tab-${t}`}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {t === "packets" ? `Packets (${packets.length})` : PROCESS_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "packets" ? (
          packets.length === 0 ? (
            <Empty testid="packets-empty" text="No packets yet. Create a packet from this kapan to start the process." />
          ) : (
            <div className="overflow-x-auto border border-black/10 bg-white">
              <table className="w-full min-w-[820px] border-collapse text-xs" data-testid="packet-table">
                <thead>
                  <tr className="bg-zinc-900 text-white">
                    {["#", "Packet No", "Date", "Org Pcs", "Org Wt", "Cur Pcs", "Cur Wt", "Size", "Last Process", "Status", ""].map((h, i) => (
                      <th key={h + i} className={`border-r border-white/10 px-2.5 py-2.5 font-semibold uppercase tracking-wider ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {packets.map((pk, i) => (
                    <tr key={pk.id} data-testid={`packet-row-${pk.packet_no}`} className="border-b border-black/5 transition-colors hover:bg-zinc-50">
                      <td className="border-r border-black/5 px-2.5 py-2 text-zinc-400">{i + 1}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 font-heading font-bold tabular-nums">{pk.packet_no}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-zinc-500">{pk.date}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-zinc-500">{pk.original_pcs}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-zinc-500">{ct(pk.original_weight)}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums">{pk.pcs}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-right font-semibold tabular-nums">{ct(pk.weight)}</td>
                      <td className="border-r border-black/5 px-2.5 py-2 text-right tabular-nums text-zinc-500">{ct(pk.size)}</td>
                      <td className="border-r border-black/5 px-2.5 py-2">{PROCESS_LABELS[pk.last_process] || "—"}</td>
                      <td className="border-r border-black/5 px-2.5 py-2">
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pk.status === "issued" ? "bg-amber-50 text-[#B4975A]" : "bg-emerald-50 text-[#16A34A]"}`}>
                          {pk.status === "issued" ? "Issued" : "In Stock"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {pk.status !== "issued" && can("can_create") && (
                          <button data-testid={`packet-issue-${pk.packet_no}`} onClick={() => openIssue(pk)}
                            className="mr-2 border border-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-900 hover:text-white">
                            Issue
                          </button>
                        )}
                        {can("can_delete") && (
                          <button data-testid={`packet-delete-${pk.packet_no}`} onClick={() => removePacket(pk)}
                            className="text-zinc-400 transition-colors hover:text-[#DC2626]">
                            <Trash size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
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
            <EntryTable
              rows={(k.entries || []).filter((e) => e.process === tab).map((e) => ({ ...e, kapan_no: k.kapan_no }))}
              onReceive={setReceiving}
              onDelete={removeEntry}
              showKapan={false}
              showSr
            />
          </>
        )}
      </div>

      <PacketDialog open={packetOpen} onOpenChange={setPacketOpen} kapanId={id}
        remaining={p.unpacketed_weight} onDone={load} />
      {tab !== "packets" && (
        <BulkPacketDialog open={bulkOpen} onOpenChange={setBulkOpen} kapanId={id} process={tab}
          remaining={p.unpacketed_weight} onDone={load} />
      )}
      <IssueDialog
        open={issueOpen}
        onOpenChange={(o) => { setIssueOpen(o); if (!o) setIssuePacket(null); }}
        packets={stock}
        fixedPacketId={issuePacket}
        onDone={load}
      />
      <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onDone={load} />
    </div>
  );
}
