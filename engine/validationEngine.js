export function buildWalkForwardReport(history = []) {
  const evaluated = history.filter((item) => ["WIN", "LOSS", "NEUTRAL"].includes(item.evaluationStatus));
  if (evaluated.length < 20) return { ready: false, training: evaluated.length, testing: 0, winRate: 0, averageReturn: 0, status: "VERİ TOPLUYOR" };
  const chronological = [...evaluated].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  const split = Math.max(10, Math.floor(chronological.length * 0.7));
  const testing = chronological.slice(split);
  const wins = testing.filter((item) => item.evaluationStatus === "WIN").length;
  const losses = testing.filter((item) => item.evaluationStatus === "LOSS").length;
  const returns = testing.map((item) => Number(item.signalReturn || 0));
  const averageReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const winRate = wins + losses ? wins / (wins + losses) * 100 : 0;
  return {
    ready: testing.length >= 6, training: split, testing: testing.length,
    winRate, averageReturn,
    status: testing.length < 6 ? "TEST ÖRNEĞİ YETERSİZ" : averageReturn > 0 && winRate >= 50 ? "İLERİ TEST BAŞARILI" : "MODELİ GÖZDEN GEÇİR",
  };
}

export function getLossStreak(history = []) {
  let count = 0;
  for (const item of history) {
    if (item.evaluationStatus === "LOSS") count += 1;
    else if (["WIN", "NEUTRAL"].includes(item.evaluationStatus)) break;
  }
  return count;
}

export function buildRegimePerformance(history = []) {
  const evaluated = history.filter((item) =>
    ["WIN", "LOSS", "NEUTRAL"].includes(item.evaluationStatus) && item.marketRegime
  );
  const grouped = evaluated.reduce((result, item) => {
    if (!result[item.marketRegime]) result[item.marketRegime] = [];
    result[item.marketRegime].push(item);
    return result;
  }, {});
  return Object.entries(grouped).map(([regime, items]) => {
    const wins = items.filter((item) => item.evaluationStatus === "WIN").length;
    const losses = items.filter((item) => item.evaluationStatus === "LOSS").length;
    const averageReturn = items.reduce((sum, item) => sum + Number(item.signalReturn || 0), 0) / items.length;
    return {
      regime, samples: items.length, averageReturn,
      winRate: wins + losses ? wins / (wins + losses) * 100 : 0,
    };
  }).sort((a, b) => b.samples - a.samples);
}
