// Field configuration per manufacturing process.
// issue = fields captured when packet goes out; ret = fields captured on return.

export const PROCESS_LABELS = {
  sarine: "Sarine",
  marking: "Marking",
  laser: "Laser Sawing",
  shape: "Shape Cutting",
  ghat: "Ghat",
  polish: "Polish",
  table_polish: "Table Polish",
  nats: "Nats",
  filling: "Filling",
};

export const PROCESS_ORDER = [
  "sarine",
  "marking",
  "laser",
  "shape",
  "ghat",
  "polish",
  "table_polish",
  "nats",
  "filling",
];

const F = {
  hw: { key: "hw", label: "H / W", type: "text" },
  ds: { key: "ds", label: "D / S", type: "select", options: ["Double", "Single"] },
  exp: { key: "expected_return_pcs", label: "Exp. Ret Pcs", type: "number" },
  rc: { key: "rc", label: "RC", type: "number", step: "0.01" },
  nail_rc: { key: "nail_rc", label: "Nail / RC", type: "number", step: "0.01" },
  boil: { key: "return_boil", label: "Return Boil", type: "number", step: "0.01" },
  ls: { key: "ls_opening", label: "LS Opening", type: "text" },
};

export const PROCESS_CONFIG = {
  sarine: { issue: [], ret: [], showLoss: false },
  marking: { issue: [], ret: [], showLoss: false },
  laser: { issue: [F.hw, F.exp], ret: [F.boil, F.rc, F.ls], showLoss: true },
  shape: { issue: [], ret: [F.boil, F.nail_rc], showLoss: true },
  ghat: { issue: [], ret: [F.boil, F.nail_rc], showLoss: true },
  polish: { issue: [F.ds], ret: [], showLoss: true, showRetPct: true },
  table_polish: { issue: [], ret: [], showLoss: true, showRetPct: true },
  nats: { issue: [], ret: [], showLoss: true },
  filling: { issue: [], ret: [], showLoss: false, showGain: true },
};

export function computeReturn(process, issueWeight, values) {
  const w = Number(issueWeight || 0);
  const rw = Number(values.return_weight || 0);
  const boil = Number(values.return_boil || 0);
  const rc = Number(values.rc || 0);
  const nail = Number(values.nail_rc || 0);
  if (process === "filling") {
    return { loss: 0, loss_pct: 0, return_pct: w ? (rw / w) * 100 : 0, weight_gain: rw - w };
  }
  const loss = w - (rw + boil + rc + nail);
  return {
    loss,
    loss_pct: w ? (loss / w) * 100 : 0,
    return_pct: w ? (rw / w) * 100 : 0,
    weight_gain: 0,
  };
}
