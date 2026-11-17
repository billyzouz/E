import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5", className)}>{children}</div>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-medium text-zinc-300">{children}</h2>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between text-zinc-400">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </Card>
  );
}

const BADGE: Record<string, string> = {
  listed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  shipped: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  ready: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  ordered_cj: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  running: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  draft: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  new: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  paused: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  manual: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  skipped: "bg-zinc-700/30 text-zinc-500 ring-zinc-700/40",
  error: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export const STATUS_LABEL: Record<string, string> = {
  listed: "En ligne",
  ready: "Prête",
  draft: "Brouillon",
  paused: "En pause",
  skipped: "Écartée",
  error: "Erreur",
  new: "Nouvelle",
  ordered_cj: "Commandée CJ",
  shipped: "Expédiée",
  manual: "À traiter",
  running: "En cours",
  done: "Terminé",
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE[status] ?? BADGE.draft)}>
      {children ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-zinc-600">{icon}</div>}
      <p className="font-medium text-zinc-300">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-900/30 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700/70 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50",
};

export const inputClass =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

/** Drapeau emoji d'un pays (code ISO à 2 lettres). */
export function flag(country: string) {
  return country
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function money(value: number | string | null | undefined, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "–";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value));
}
