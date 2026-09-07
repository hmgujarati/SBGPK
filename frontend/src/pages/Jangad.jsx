import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer, ArrowLeft } from "@phosphor-icons/react";
import { api, ct } from "@/lib/api";

const Meta = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-black/20 py-1.5 text-sm">
    <span className="uppercase tracking-wider text-zinc-600">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

export default function Jangad() {
  const { jangadNo } = useParams();
  const navigate = useNavigate();
  const [j, setJ] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get(`/jangads/${jangadNo}`).then((r) => setJ(r.data)).catch(() => {});
    api.get("/settings/print").then((r) => setSettings(r.data)).catch(() => {});
  }, [jangadNo]);

  if (!j) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  return (
    <div data-testid="jangad-page">
      {settings && (
        <style>{`@media print { @page { size: ${settings.jangad_paper} ${settings.jangad_orientation}; margin: ${settings.jangad_margin_mm}mm; } }`}</style>
      )}
      <div className="no-print mb-4 flex items-center justify-between">
        <button data-testid="jangad-back" onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900">
          <ArrowLeft size={13} /> Back
        </button>
        <button data-testid="jangad-print-button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800">
          <Printer size={14} /> Print Jangad
        </button>
      </div>

      <div className="print-area mx-auto max-w-3xl border border-black/30 bg-white p-6" data-testid="jangad-slip">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <div className="font-heading text-xl font-bold uppercase tracking-[0.14em]">Jangad</div>
            <div className="text-xs uppercase tracking-wider text-zinc-600">Polki Manufacturing</div>
          </div>
          <div className="text-right">
            <div className="font-heading text-lg font-bold tabular-nums" data-testid="jangad-no">{j.jangad_no}</div>
            <div className="text-xs tabular-nums text-zinc-600">{j.date}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <Meta label="Kapan No" value={j.kapan_no} />
            <Meta label="Type" value={j.kapan_type || "—"} />
            <Meta label="Process" value={j.process_label} />
          </div>
          <div>
            <Meta label="Karigar" value={j.karigar_name || "—"} />
            {j.ds ? <Meta label="D / S" value={j.ds} /> : null}
          </div>
        </div>

        <table className="mt-5 w-full border-collapse text-xs" data-testid="jangad-lines">
          <thead>
            <tr className="border-y-2 border-black">
              <th className="px-2 py-2 text-left uppercase tracking-wider">#</th>
              <th className="px-2 py-2 text-left uppercase tracking-wider">Packet No</th>
              <th className="px-2 py-2 text-right uppercase tracking-wider">Pcs</th>
              <th className="px-2 py-2 text-right uppercase tracking-wider">Weight (cts)</th>
              <th className="px-2 py-2 text-right uppercase tracking-wider">Size</th>
              {j.process === "laser" && (
                <>
                  <th className="px-2 py-2 text-left uppercase tracking-wider">H / W</th>
                  <th className="px-2 py-2 text-right uppercase tracking-wider">Tops</th>
                  <th className="px-2 py-2 text-right uppercase tracking-wider">Exp Ret Pcs</th>
                </>
              )}
              <th className="px-2 py-2 text-right uppercase tracking-wider">Ret Pcs</th>
              <th className="px-2 py-2 text-right uppercase tracking-wider">Ret Wt</th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-black/20" data-testid={`jangad-line-${l.packet_no}`}>
                <td className="px-2 py-1.5 text-zinc-500">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold tabular-nums">{l.packet_no}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.pcs}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{ct(l.weight)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{ct(l.size)}</td>
                {j.process === "laser" && (
                  <>
                    <td className="px-2 py-1.5 tabular-nums">{l.hw || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.tops || 0}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.expected_return_pcs || 0}</td>
                  </>
                )}
                <td className="px-2 py-1.5 text-right tabular-nums">{l.returned ? l.return_pcs : ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.returned ? ct(l.return_weight) : ""}</td>
              </tr>
            ))}
            <tr className="border-y-2 border-black font-bold" data-testid="jangad-total-row">
              <td className="px-2 py-2 uppercase tracking-wider" colSpan={2}>Total ({j.count || j.lines.length})</td>
              <td className="px-2 py-2 text-right tabular-nums">{j.total_pcs}</td>
              <td className="px-2 py-2 text-right tabular-nums">{ct(j.total_weight)}</td>
              <td colSpan={j.process === "laser" ? 6 : 3} />
            </tr>
          </tbody>
        </table>

        <div className="mt-12 grid grid-cols-2 gap-10 text-xs uppercase tracking-wider">
          <div className="border-t border-black pt-2">Issued by {j.issued_by ? `— ${j.issued_by}` : ""}</div>
          <div className="border-t border-black pt-2">Received by (signature)</div>
        </div>
        <p className="mt-6 text-[10px] leading-relaxed text-zinc-600">
          Goods received on jangad (approval) basis. The above goods remain the property of the company
          and must be returned on demand. Weights are in carats.
        </p>
      </div>
    </div>
  );
}
