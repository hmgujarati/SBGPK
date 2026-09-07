import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Printer, ArrowLeft } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import PacketLabel from "@/components/PacketLabel";

export default function Labels() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get("ids") || "";
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    api.get("/settings/print").then((r) => setSettings(r.data)).catch(() => {});
    if (ids) api.get("/packets/labels", { params: { ids } }).then((r) => setRows(r.data)).catch(() => {});
  }, [ids]);

  if (!settings) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const sheet = rows.flatMap((r) => Array.from({ length: copies }, (_, i) => ({ ...r, _k: `${r.id}-${i}` })));

  return (
    <div data-testid="labels-page">
      <style>{`@media print {
        @page { size: ${settings.sticker_width_in}in ${settings.sticker_height_in}in; margin: 0; }
        .label-sheet { display: block !important; gap: 0 !important; }
        .label-sticker { border: none !important; page-break-after: always; break-after: page; }
      }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button data-testid="labels-back" onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-900">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-600">
            Copies each
            <input data-testid="labels-copies-input" type="number" min="1" value={copies}
              onChange={(e) => setCopies(Math.max(1, Number(e.target.value || 1)))}
              className="h-9 w-16 border border-black/15 px-2 tabular-nums" />
          </label>
          <button data-testid="labels-print-button" onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800">
            <Printer size={14} /> Print {sheet.length} Labels
          </button>
        </div>
      </div>

      <p className="no-print mb-4 text-xs text-zinc-500">
        Sticker size {settings.sticker_width_in}in × {settings.sticker_height_in}in — change it in Print Settings.
      </p>

      {sheet.length === 0 ? (
        <div className="border border-dashed border-black/15 bg-white p-10 text-center text-sm text-zinc-500">
          No packets selected for labels.
        </div>
      ) : (
        <div className="label-sheet flex flex-wrap gap-3" data-testid="labels-sheet">
          {sheet.map((r) => (
            <PacketLabel key={r._k} packet={r} settings={settings} />
          ))}
        </div>
      )}
    </div>
  );
}
