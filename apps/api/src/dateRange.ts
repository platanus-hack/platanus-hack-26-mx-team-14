/**
 * Parse a relative Spanish date phrase into an inclusive {from,to} range
 * (YYYY-MM-DD). Returns null when no date qualifier is present (→ no filter).
 *
 * Handles the phrasings a user actually says by voice:
 *   "este mes", "el mes pasado", "este año", "el año pasado", "hoy",
 *   and month names ("en marzo", "facturas de enero").
 * "now" is the server clock, so the demo's relative dates track real time.
 */
const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface DateRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

/** Shape a range as skill `input` (what mockSkillResult / the tools expect). */
export const rangeInput = (r: DateRange | null): Record<string, unknown> =>
  r ? { from: r.from, to: r.to } : {};

const month = (y: number, m: number): DateRange => ({
  from: iso(y, m, 1),
  to: iso(y, m, lastDay(y, m)),
});

const year = (y: number): DateRange => ({ from: iso(y, 0, 1), to: iso(y, 11, 31) });

export function parseDateRange(text: string, now = new Date()): DateRange | null {
  const t = strip(text);
  const y = now.getFullYear();
  const m = now.getMonth();

  if (/\bhoy\b/.test(t)) {
    const d = iso(y, m, now.getDate());
    return { from: d, to: d };
  }
  if (/mes pasado|mes anterior/.test(t)) {
    return m === 0 ? month(y - 1, 11) : month(y, m - 1);
  }
  if (/este mes|del mes|el mes\b/.test(t)) return month(y, m);
  if (/ano pasado|year pasado/.test(t)) return year(y - 1);
  if (/este ano|este year/.test(t)) return year(y);

  // Named month → most recent past occurrence (this year if already happened,
  // otherwise last year — "facturas de diciembre" in June means last December).
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      return idx <= m ? month(y, idx) : month(y - 1, idx);
    }
  }
  return null;
}
