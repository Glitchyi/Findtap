/**
 * @param {string} query
 * @param {string} text
 * @returns {number} score in [0.0, 1.0]; 0 means no match
 */
export function score(query, text) {
  if (!query) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.startsWith(q)) return 1.0;

  let qi = 0;
  let consecutiveRuns = 0;
  let wordBoundaryHits = 0;
  let lastMatchedAt = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    if (ti === lastMatchedAt + 1) {
      consecutiveRuns++;
    }

    const prev = ti > 0 ? t[ti - 1] : null;
    if (ti === 0 || prev === ' ' || prev === '-' || prev === '_' || prev === '/') {
      wordBoundaryHits++;
    }

    lastMatchedAt = ti;
    qi++;
  }

  if (qi < q.length) return 0;

  const matchRatio = qi / q.length;
  const consecutiveBonus = Math.min(consecutiveRuns / Math.max(q.length - 1, 1), 1);
  const boundaryBonus = Math.min(wordBoundaryHits / q.length, 1);

  return Math.min(matchRatio * 0.5 + consecutiveBonus * 0.3 + boundaryBonus * 0.2, 1.0);
}
