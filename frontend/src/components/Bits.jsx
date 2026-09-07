export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
    <div>
      <h1 className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

export const Stat = ({ label, value, unit, tone = "default", testid }) => {
  const tones = {
    default: "text-zinc-900",
    warn: "text-[#DC2626]",
    good: "text-[#16A34A]",
    accent: "text-[#B4975A]",
  };
  return (
    <div
      data-testid={testid}
      className="border border-black/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform hover:-translate-y-0.5"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1.5 font-heading text-xl font-bold tabular-nums ${tones[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-zinc-400">{unit}</span>}
      </div>
    </div>
  );
};

export const Empty = ({ text, testid }) => (
  <div data-testid={testid} className="border border-dashed border-black/15 bg-white p-10 text-center text-sm text-zinc-500">
    {text}
  </div>
);


export const Pager = ({ page, limit, total, onPage, testid = "pager", label = "rows" }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const btn =
    "border border-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:border-black/15 disabled:text-zinc-300 disabled:hover:bg-transparent disabled:hover:text-zinc-300";
  return (
    <div data-testid={testid} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500">
        Showing <b className="tabular-nums">{from}–{to}</b> of <b className="tabular-nums">{total}</b> {label}
      </span>
      <div className="flex items-center gap-2">
        <button data-testid={`${testid}-prev`} className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <span className="tabular-nums text-zinc-600">Page {page} / {pages}</span>
        <button data-testid={`${testid}-next`} className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
};
