import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { PROCESS_LABELS } from "@/lib/processConfig";

/** One packet sticker, sized in inches from print settings. All text one size. */
export const PacketLabel = ({ packet, settings }) => {
  const ref = useRef(null);
  const w = Number(settings?.sticker_width_in || 2);
  const h = Number(settings?.sticker_height_in || 1);
  const showBarcode = settings?.sticker_show_barcode !== false;
  const fs = `${h * 0.15}in`;

  useEffect(() => {
    if (!showBarcode || !ref.current) return;
    try {
      JsBarcode(ref.current, packet.packet_no, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: Number(settings?.sticker_barcode_height || 40),
        width: 1.4,
      });
    } catch {
      /* invalid barcode value — leave blank */
    }
  }, [packet.packet_no, showBarcode, settings?.sticker_barcode_height]);

  return (
    <div
      data-testid={`packet-label-${packet.packet_no}`}
      className="label-sticker flex flex-col justify-between overflow-hidden border border-black/20 bg-white leading-tight"
      style={{ width: `${w}in`, height: `${h}in`, padding: `${h * 0.05}in ${w * 0.04}in`, fontSize: fs }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">{packet.seq}</span>
        <span className="font-semibold tabular-nums">{packet.kapan_no}</span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate uppercase tracking-wide">
          {PROCESS_LABELS[packet.process] || packet.process || ""}
        </span>
        <span className="whitespace-nowrap tabular-nums">
          {packet.pcs} / {Number(packet.weight || 0).toFixed(2)}
        </span>
      </div>

      {showBarcode ? (
        <svg ref={ref} className="h-auto w-full" preserveAspectRatio="none" />
      ) : (
        <span className="tabular-nums">{packet.packet_no}</span>
      )}
    </div>
  );
};

export default PacketLabel;
