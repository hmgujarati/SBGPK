import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

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
      <div className="flex items-start justify-between leading-none">
        <span className="font-bold tabular-nums" style={{ fontSize: `${h * 0.3}in` }}>
          {packet.seq}
        </span>
        <span className="font-bold tabular-nums" style={{ fontSize: `${h * 0.3}in` }}>
          {packet.kapan_no}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        {showBarcode ? (
          <svg ref={ref} className="max-w-[55%]" />
        ) : (
          <span className="tabular-nums" style={{ fontSize: `${h * 0.11}in` }}>{packet.packet_no}</span>
        )}
        <div className="text-center leading-none">
          <div className="tabular-nums" style={{ fontSize: `${h * 0.2}in` }}>{packet.pcs}</div>
          <div className="border-t-2 border-black tabular-nums" style={{ fontSize: `${h * 0.2}in` }}>
            {Number(packet.weight || 0).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PacketLabel;
