import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ct } from "@/lib/api";
import { PageHeader, Stat } from "@/components/Bits";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const d = data || {};

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle="Live factory position across all kapan" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat testid="stat-kapan-count" label="Kapan" value={d.kapan_count ?? "—"} />
        <Stat testid="stat-total-weight" label="Total Rough" value={ct(d.total_weight)} unit="cts" />
        <Stat testid="stat-in-process" label="In Process" value={ct(d.in_process_weight)} unit="cts" tone="accent" />
        <Stat testid="stat-total-loss" label="Total Loss" value={ct(d.total_loss)} unit="cts" tone="warn" />
        <Stat testid="stat-open-jangads" label="Open Jangads" value={d.open_jangads ?? "—"} />
        <Stat testid="stat-packets" label="Packets" value={d.packet_count ?? "—"} />
        <Stat testid="stat-karigars" label="Karigars" value={d.karigar_count ?? "—"} />
      </div>

      <Link
        to="/kapans"
        data-testid="dashboard-goto-kapans"
        className="mt-6 inline-block border border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-900 hover:text-white"
      >
        Open Kapan register
      </Link>
    </div>
  );
}
