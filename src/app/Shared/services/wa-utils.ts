

/** Page routes, used by the buttons that jump between the two pages. */
export const VERIFY_PATH = '/app/whatsapp/check-number';
export const MESSAGES_PATH = '/app/whatsapp/wati';

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The rows of a list answer, whatever its shape: a plain array, or a PagedResponse ({ items }, { data },
 * { results } …). This is what stops "r.map is not a function" - never call .map on a paged answer directly.
 */
export function rowsOf<T>(r: unknown, depth = 0): T[] {
  if (Array.isArray(r)) return r as T[];
  if (!isBag(r) || depth > 2) return [];
  for (const k of ['items', 'data', 'results', 'rows', 'records', 'value']) {
    if (r[k] === undefined) continue;
    const found = rowsOf<T>(r[k], depth + 1);
    if (found.length || Array.isArray(r[k])) return found;
  }
  return [];
}

/** The total count of a paged answer (falls back to the rows on this page). */
export function totalOf(r: unknown): number {
  if (isBag(r)) {
    for (const k of ['totalCount', 'total', 'totalItems', 'totalRecords', 'count']) {
      const n = Number(r[k]);
      if (r[k] !== undefined && isFinite(n)) return n;
    }
  }
  return rowsOf(r).length;
}

/** "26 Oct 2026, 14:05" in the viewer's own time zone, or a dash. */
export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(+d) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** An amount in the given currency code (USD, INR …); falls back to "<code> 1.23". */
export function money(n: number | null | undefined, currency = 'USD'): string {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

/** Hand a file to the browser's download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One CSV cell. */
export const csv = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
