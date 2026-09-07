import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { PROCESS_LABELS } from "@/lib/processConfig";

/** One packet sticker, sized in inches from print settings. */
export const PacketLabel = ({ packet, settings }) => {
  const ref = useRef(null);
  const w = Number(settings?.sticker_width_in || 2);
  const h = Number(settings?.sticker_height_in || 1);
  const showBarcode = settings?.sticker_show_barcode !== false;

  useEffect(() => {
    if (!showBarcode || !ref.current) return;
    try {
      JsBarcode(ref.current, packet.packet_no, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: Number(settings?.sticker_barcode_height || 40),
        width: 1,
      });
    } catch {
      /* invalid barcode value — leave blank */
    }
  }, [packet.packet_no, showBarcode, settings?.sticker_barcode_height]);

  return (
    <div
      data-testid={`packet-label-${packet.packet_no}`}
      className="label-sticker relative flex flex-col justify-between overflow-hidden border border-black/20 bg-white"
      style={{ width: `${w}in`, height: `${h}in`, padding: `${h * 0.06}in ${w * 0.05}in` }}
    >
      <div className="flex items-baseline justify-between gap-1 leading-none">
        <span className="whitespace-nowrap font-bold tabular-nums" style={{ fontSize: `${h * 0.22}in` }}>
          {packet.seq}
        </span>
        <span className="whitespace-nowrap font-bold uppercase" style={{ fontSize: `${h * 0.22}in` }}>
          {PROCESS_LABELS[packet.process] || packet.process || ""}
        </span>
        <span className="whitespace-nowrap font-bold tabular-nums" style={{ fontSize: `${h * 0.22}in` }}>
          {packet.kapan_no}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        {showBarcode ? (
          <svg ref={ref} className="max-w-[55%]" />
        ) : (
          <span className="tabular-nums" style={{ fontSize: `${h * 0.11}in` }}>{packet.packet_no}</span>
        )}
        <span className="whitespace-nowrap text-center leading-none">
          <span className="block tabular-nums" style={{ fontSize: `${h * 0.2}in` }}>{packet.pcs}</span>
          <span className="block border-t-2 border-black tabular-nums" style={{ fontSize: `${h * 0.2}in` }}>
            {Number(packet.weight || 0).toFixed(2)}
          </span>
        </span>
      </div>
    </div>
  );
};

export default PacketLabel;
