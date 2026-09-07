import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer, ArrowLeft } from "@phosphor-icons/react";
import { api, ct } from "@/lib/api";

const Meta = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-black/20 py-1 text-[11px]">
    <span className="uppercase tracking-wider text-zinc-600">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

const Slip = ({ j, copyLabel }) => {
  const laser = j.process === "laser";
  return (
    <div className="jangad-copy flex flex-1 flex-col border border-black/30 bg-white p-4"
      data-testid={`jangad-slip-${copyLabel.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="font-heading text-base font-bold uppercase tracking-[0.14em]">Jangad</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Polki Manufacturing</div>
        </div>
        <div className="text-right">
          <div className="font-heading text-sm font-bold tabular-nums">{j.jangad_no}</div>
          <div className="text-[10px] tabular-nums text-zinc-600">{j.date}</div>
          <div className="mt-1 inline-block border border-black px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            {copyLabel}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Meta label="Kapan No" value={j.kapan_no} />
        <Meta label="Type" value={j.kapan_type || "—"} />
        <Meta label="Process" value={j.process_label} />
        <Meta label="Karigar" value={j.karigar_name || "—"} />
        {j.ds ? <Meta label="D / S" value={j.ds} /> : null}
      </div>

      <table className="mt-3 w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-y-2 border-black">
            <th className="px-1 py-1 text-left uppercase tracking-wider">#</th>
            <th className="px-1 py-1 text-left uppercase tracking-wider">Packet</th>
            <th className="px-1 py-1 text-right uppercase tracking-wider">Pcs</th>
            <th className="px-1 py-1 text-right uppercase tracking-wider">Wt</th>
            {laser && (
              <>
                <th className="px-1 py-1 text-left uppercase tracking-wider">H/W</th>
                <th className="px-1 py-1 text-right uppercase tracking-wider">Tops</th>
                <th className="px-1 py-1 text-right uppercase tracking-wider">Exp</th>
              </>
            )}
            <th className="px-1 py-1 text-right uppercase tracking-wider">Ret Pcs</th>
            <th className="px-1 py-1 text-right uppercase tracking-wider">Ret Wt</th>
          </tr>
        </thead>
        <tbody>
          {j.lines.map((l, i) => (
            <tr key={l.id} className="border-b border-black/20" data-testid={`jangad-line-${l.packet_no}`}>
              <td className="px-1 py-1 text-zinc-500">{i + 1}</td>
              <td className="px-1 py-1 font-semibold tabular-nums">{l.packet_no}</td>
              <td className="px-1 py-1 text-right tabular-nums">{l.pcs}</td>
              <td className="px-1 py-1 text-right font-semibold tabular-nums">{ct(l.weight)}</td>
              {laser && (
                <>
                  <td className="px-1 py-1 tabular-nums">{l.hw || "—"}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{l.tops || 0}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{l.expected_return_pcs || 0}</td>
                </>
              )}
              <td className="px-1 py-1 text-right tabular-nums">{l.returned ? l.return_pcs : ""}</td>
              <td className="px-1 py-1 text-right tabular-nums">{l.returned ? ct(l.return_weight) : ""}</td>
            </tr>
          ))}
          <tr className="border-y-2 border-black font-bold">
            <td className="px-1 py-1 uppercase tracking-wider" colSpan={2}>Total ({j.lines.length})</td>
            <td className="px-1 py-1 text-right tabular-nums">{j.total_pcs}</td>
            <td className="px-1 py-1 text-right tabular-nums">{ct(j.total_weight)}</td>
            <td colSpan={laser ? 5 : 2} />
          </tr>
        </tbody>
      </table>

      <div className="mt-auto pt-10">
        <div className="grid grid-cols-2 gap-4 text-[10px] uppercase tracking-wider">
          <div className="border-t border-black pt-1">Issued by {j.issued_by ? `— ${j.issued_by}` : ""}</div>
          <div className="border-t border-black pt-1">Received by (sign)</div>
        </div>
        <p className="mt-3 text-[8px] leading-relaxed text-zinc-600">
          Goods received on jangad (approval) basis. The above goods remain the property of the company
          and must be returned on demand. Weights are in carats.
        </p>
      </div>
    </div>
  );
};

export default function Jangad() {
  const { jangadNo } = useParams();
  const navigate = useNavigate();
  const [j, setJ] = useState(null);

  useEffect(() => {
    api.get(`/jangads/${jangadNo}`).then((r) => setJ(r.data)).catch(() => {});
  }, [jangadNo]);

  if (!j) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  return (
    <div data-testid="jangad-page">
      <style>{`@media print {
        @page { size: A4 portrait; margin: 6mm; }
        .jangad-sheet { display: flex !important; gap: 6mm; height: 100%; }
        .jangad-copy { border: none !important; }
        .jangad-copy + .jangad-copy { border-left: 1px dashed #000 !important; padding-left: 5mm !important; }
      }`}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <button data-testid="jangad-back" onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900">
          <ArrowLeft size={13} /> Back
        </button>
        <button data-testid="jangad-print-button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800">
          <Printer size={14} /> Print 2 Copies (A4)
        </button>
      </div>

      <p className="no-print mb-3 text-xs text-zinc-500" data-testid="jangad-no">
        {j.jangad_no} — one A4 sheet, two copies side by side: office copy and karigar copy.
      </p>

      <div className="print-area jangad-sheet mx-auto flex max-w-5xl gap-4" data-testid="jangad-slip">
        <Slip j={j} copyLabel="Office Copy" />
        <Slip j={j} copyLabel="Karigar Copy" />
      </div>
    </div>
  );
}
