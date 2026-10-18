/**
 * Deterministic 25 × 25 QR-style pattern for previews (three finder squares + cells derived from
 * the text). It is a visual preview only - wire a QR library (for example `qrcode`) where a
 * scannable code is printed or downloaded.
 */
export function qrPattern(text: string, n = 25): { x: number; y: number }[] {
  const src = text || 'preview';
  let h = 2166136261;
  const cells: { x: number; y: number }[] = [];
  const finder = (x: number, y: number): boolean | null => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      if (x >= fx && x < fx + 7 && y >= fy && y < fy + 7) {
        const dx = x - fx;
        const dy = y - fy;
        return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      }
      if (x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7) return false;
    }
    return null;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      h ^= src.charCodeAt((x * 7 + y * 13) % src.length);
      h = Math.imul(h, 16777619) >>> 0;
      if (f === true || (f === null && (h & 7) < 3)) cells.push({ x, y });
    }
  }
  return cells;
}
