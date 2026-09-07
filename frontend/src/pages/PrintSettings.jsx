import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { PageHeader } from "@/components/Bits";
import PacketLabel from "@/components/PacketLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const inp = "mt-1 h-10 rounded-none border-black/15 tabular-nums";
const PAPERS = ["A4", "A5", "Letter", "Legal"];
const PRESETS = [
  { label: '2" × 1"', w: 2, h: 1 },
  { label: '1.5" × 1"', w: 1.5, h: 1 },
  { label: '2" × 1.25"', w: 2, h: 1.25 },
  { label: '3" × 1"', w: 3, h: 1 },
];

export default function PrintSettings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/print").then((r) => setS(r.data)).catch((e) => toast.error(apiError(e)));
  }, []);

  if (!s) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/settings/print", {
        ...s,
        jangad_margin_mm: Number(s.jangad_margin_mm || 0),
        sticker_width_in: Number(s.sticker_width_in || 2),
        sticker_height_in: Number(s.sticker_height_in || 1),
        sticker_barcode_height: Number(s.sticker_barcode_height || 24),
      });
      setS(data);
      toast.success("Print settings saved");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="print-settings-page">
      <PageHeader title="Print Settings" subtitle="Jangad paper and packet sticker sizes">
        <Button data-testid="settings-save-button" onClick={save} disabled={busy}
          className="h-9 rounded-none bg-zinc-900 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800">
          {busy ? "Saving…" : "Save Settings"}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="border border-black/10 bg-white p-5">
          <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Jangad paper
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Paper size</Label>
              <Select value={s.jangad_paper} onValueChange={(v) => setS({ ...s, jangad_paper: v })}>
                <SelectTrigger data-testid="jangad-paper-select" className={inp}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPERS.map((p) => (
                    <SelectItem key={p} value={p} data-testid={`jangad-paper-opt-${p}`}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Orientation</Label>
              <Select value={s.jangad_orientation} onValueChange={(v) => setS({ ...s, jangad_orientation: v })}>
                <SelectTrigger data-testid="jangad-orientation-select" className={inp}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Margin (mm)</Label>
              <Input data-testid="jangad-margin-input" type="number" value={s.jangad_margin_mm}
                onChange={(e) => setS({ ...s, jangad_margin_mm: e.target.value })} className={inp} />
            </div>
          </div>
        </div>

        <div className="border border-black/10 bg-white p-5">
          <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
            Packet sticker
          </h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} data-testid={`sticker-preset-${p.w}x${p.h}`}
                onClick={() => setS({ ...s, sticker_width_in: p.w, sticker_height_in: p.h })}
                className={`border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  Number(s.sticker_width_in) === p.w && Number(s.sticker_height_in) === p.h
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-black/15 hover:bg-zinc-100"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Width (inches)</Label>
              <Input data-testid="sticker-width-input" type="number" step="0.05" value={s.sticker_width_in}
                onChange={(e) => setS({ ...s, sticker_width_in: e.target.value })} className={inp} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Height (inches)</Label>
              <Input data-testid="sticker-height-input" type="number" step="0.05" value={s.sticker_height_in}
                onChange={(e) => setS({ ...s, sticker_height_in: e.target.value })} className={inp} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-zinc-600">Barcode height (px)</Label>
              <Input data-testid="sticker-barcode-height-input" type="number" value={s.sticker_barcode_height}
                onChange={(e) => setS({ ...s, sticker_barcode_height: e.target.value })} className={inp} />
            </div>
            <label className="mt-6 flex items-center justify-between border border-black/10 px-3 py-2 text-xs">
              Print barcode
              <Switch data-testid="sticker-barcode-switch" checked={s.sticker_show_barcode !== false}
                onCheckedChange={(c) => setS({ ...s, sticker_show_barcode: c })} />
            </label>
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-heading text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
        Sticker preview
      </h2>
      <div className="inline-block bg-zinc-100 p-6">
        <PacketLabel
          settings={s}
          packet={{ seq: 1, packet_no: "101.35-01", kapan_no: "101.35", pcs: 1, weight: 21.35 }}
        />
      </div>
    </div>
  );
}
