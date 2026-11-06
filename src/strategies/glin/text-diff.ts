/**
 * Extracts the spans of `original` that disappeared in `processed`, using a
 * token-level LCS. Those spans are the real text the user wrote (`written`),
 * as opposed to the canonical dictionary form that glin reports.
 *
 * Consecutive removed tokens are grouped into one span joined by single
 * spaces (e.g. `f u c k` → `****` yields the single span `f u c k`).
 */
export function extractRemovedWrites(original: string, processed: string): string[] {
  const a = original.split(/\s+/).filter((t) => t.length > 0);
  const b = processed.split(/\s+/).filter((t) => t.length > 0);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const removed: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) {
      removed.push(current.join(' '));
      current = [];
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      current.push(a[i]);
      i += 1;
    } else {
      flush();
      j += 1;
    }
  }
  while (i < n) {
    current.push(a[i]);
    i += 1;
  }
  flush();

  return removed;
}
