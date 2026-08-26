import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Printer, ArrowLeft } from "@phosphor-icons/react";
import { api, ct } from "@/lib/api";

const Row = ({ label, value }) => (
  <div className="flex justify-between border-b border-black/20 py-1.5 text-sm">
    <span className="uppercase tracking-wider text-zinc-600">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

export default function Jangad() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [e, setE] = useState(null);

  useEffect(() => {
    api.get(`/entries/${id}/jangad`).then((r) => setE(r.data)).catch(() => {});
  }, [id]);

  if (!e) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  return (
    <div data-testid="jangad-page">
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

      <div className="print-area mx-auto max-w-2xl border border-black/30 bg-white p-6" data-testid="jangad-slip">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <div className="font-heading text-xl font-bold uppercase tracking-[0.14em]">Jangad</div>
            <div className="text-xs uppercase tracking-wider text-zinc-600">Polki Manufacturing</div>
          </div>
          <div className="text-right">
            <div className="font-heading text-lg font-bold tabular-nums" data-testid="jangad-no">{e.jangad_no}</div>
            <div className="text-xs tabular-nums text-zinc-600">{e.date}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8">
          <div>
            <Row label="Kapan No" value={e.kapan_no} />
            <Row label="Type" value={e.kapan_type || "—"} />
            <Row label="Process" value={e.process_label} />
            <Row label="Karigar" value={e.karigar_name || "—"} />
          </div>
          <div>
            <Row label="Pcs" value={e.pcs} />
            <Row label="Weight (cts)" value={ct(e.weight)} />
            <Row label="Size" value={ct(e.size)} />
            {e.hw ? <Row label="H / W" value={e.hw} /> : null}
            {e.ds ? <Row label="D / S" value={e.ds} /> : null}
            {e.expected_return_pcs ? <Row label="Exp. Return Pcs" value={e.expected_return_pcs} /> : null}
          </div>
        </div>

        {e.returned && (
          <div className="mt-4 border border-black/30 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest">Return details</div>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <Row label="Return Date" value={e.return_date || "—"} />
                <Row label="Return Pcs" value={e.return_pcs} />
                <Row label="Return Weight" value={ct(e.return_weight)} />
              </div>
              <div>
                <Row label="Boil" value={ct(e.return_boil)} />
                {e.process === "filling" ? (
                  <Row label="Weight Gain" value={ct(e.weight_gain)} />
                ) : (
                  <>
                    <Row label="Loss" value={ct(e.loss)} />
                    <Row label="Loss %" value={`${ct(e.loss_pct)}%`} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-xs uppercase tracking-wider">
          <div className="border-t border-black pt-2">Issued by</div>
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
