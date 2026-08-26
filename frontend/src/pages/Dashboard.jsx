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
  const bp = d.by_process || {};

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle="Live factory position across all kapan" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat testid="stat-kapan-count" label="Kapan" value={d.kapan_count ?? "—"} />
        <Stat testid="stat-total-weight" label="Total Rough" value={ct(d.total_weight)} unit="cts" />
        <Stat testid="stat-in-process" label="In Process" value={ct(d.in_process_weight)} unit="cts" tone="accent" />
        <Stat testid="stat-total-loss" label="Total Loss" value={ct(d.total_loss)} unit="cts" tone="warn" />
        <Stat testid="stat-open-jangads" label="Open Jangads" value={d.open_jangads ?? "—"} />
        <Stat testid="stat-karigars" label="Karigars" value={d.karigar_count ?? "—"} />
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-bold uppercase tracking-wide">
        Process board
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(bp).map(([key, p]) => (
          <div
            key={key}
            data-testid={`process-card-${key}`}
            className="border border-black/10 bg-white p-4 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="font-heading text-sm font-bold uppercase tracking-wide">{p.label}</div>
              <span className="border border-black/10 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {p.open} open
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400">Out Weight</div>
                <div className="font-semibold tabular-nums text-[#B4975A]">{ct(p.open_weight)} ct</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400">Loss</div>
                <div className="font-semibold tabular-nums text-[#DC2626]">{ct(p.loss)} ct</div>
              </div>
            </div>
          </div>
        ))}
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
