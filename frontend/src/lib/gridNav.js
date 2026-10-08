// Arrow-key navigation for data-entry grids.
// Put data-nav-grid + onKeyDown={navKeyDown} on the container and
// data-nav-row / data-nav-col on every input inside it.
const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];

const focus = (el) => {
  el.focus();
  if (typeof el.select === "function" && el.type !== "date") {
    try {
      el.select();
    } catch {
      /* date / number inputs can refuse select */
    }
  }
};

export const navKeyDown = (e) => {
  if (!KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = e.target;
  const grid = el.closest?.("[data-nav-grid]");
  if (!grid || el.dataset.navRow === undefined) return;

  // sideways keys keep editing the text until the caret reaches the edge
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const caret = el.selectionStart;
    if (caret !== null && caret !== undefined) {
      if (e.key === "ArrowLeft" && caret !== 0) return;
      if (e.key === "ArrowRight" && caret !== (el.value || "").length) return;
    }
  }

  const cells = [...grid.querySelectorAll("[data-nav-row][data-nav-col]")].filter((x) => !x.disabled);
  const row = Number(el.dataset.navRow);
  const col = Number(el.dataset.navCol);
  const at = (r, c) => cells.find((x) => Number(x.dataset.navRow) === r && Number(x.dataset.navCol) === c);

  let next = null;
  if (e.key === "ArrowUp") next = at(row - 1, col) || at(row - 1, col - 1);
  else if (e.key === "ArrowDown" || e.key === "Enter") next = at(row + 1, col) || at(row + 1, 0);
  else if (e.key === "ArrowLeft") next = at(row, col - 1) || at(row - 1, 99) || null;
  else if (e.key === "ArrowRight") next = at(row, col + 1) || at(row + 1, 0);

  if (!next && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const i = cells.indexOf(el);
    next = cells[e.key === "ArrowRight" ? i + 1 : i - 1];
  }
  if (!next) return;
  e.preventDefault();
  focus(next);
};
