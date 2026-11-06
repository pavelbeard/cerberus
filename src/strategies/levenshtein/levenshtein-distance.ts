/**
 * Levenshtein distance with two rows (O(min(m,n)) memory) and early cut:
 * when the minimum of the current row exceeds `maxDistance` the distance is
 * already greater than allowed, so `Infinity` is returned. That `Infinity` is
 * part of the contract with `findProhibitedMatches` (`distance > maxDistance`
 * → skip candidate).
 */
export function levenshteinDistance(a: string, b: string, maxDistance: number): number {
  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i += 1) prev[i] = i;
  for (let j = 1; j <= b.length; j += 1) {
    curr[0] = j;
    let rowMin = curr[0];

    const bChar = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i += 1) {
      const aChar = a.charCodeAt(i - 1);
      const cost = aChar === bChar ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
      if (curr[i] < rowMin) rowMin = curr[i];
    }

    if (rowMin > maxDistance) return Infinity;

    [prev, curr] = [curr, prev];
  }

  return prev[a.length];
}
