const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function analyzeMarketStructure({ candles = [], currentPrice, support, resistance, atr = 0 }) {
  const recent = candles.slice(-120);
  const atrValue = atr || currentPrice * 0.01;
  const supportTests = recent.filter((item) => Math.abs(item.low - support) <= atrValue * 0.3).length;
  const resistanceTests = recent.filter((item) => Math.abs(item.high - resistance) <= atrValue * 0.3).length;
  const supportReaction = recent.reduce((best, item) => item.low <= support + atrValue * 0.3
    ? Math.max(best, (item.close - item.low) / Math.max(atrValue, 1e-9)) : best, 0);
  const resistanceReaction = recent.reduce((best, item) => item.high >= resistance - atrValue * 0.3
    ? Math.max(best, (item.high - item.close) / Math.max(atrValue, 1e-9)) : best, 0);
  const agePenalty = recent.length < 40 ? 10 : 0;
  const supportStrength = Math.round(clamp(35 + supportTests * 9 + supportReaction * 8 - agePenalty, 10, 96));
  const resistanceStrength = Math.round(clamp(35 + resistanceTests * 9 + resistanceReaction * 8 - agePenalty, 10, 96));

  const last = recent.at(-1) || {};
  const previous = recent.at(-2) || last;
  const bullishFalseBreakout = previous.close > resistance && last.close < resistance && last.high > resistance;
  const bearishFalseBreakout = previous.close < support && last.close > support && last.low < support;
  const body = Math.abs((last.close || 0) - (last.open || 0));
  const range = Math.max((last.high || 0) - (last.low || 0), 1e-9);
  const wickDominance = 1 - body / range;

  return {
    supportStrength,
    resistanceStrength,
    supportTests,
    resistanceTests,
    falseBreakout: bullishFalseBreakout ? "YUKARI SAHTE KIRILIM" : bearishFalseBreakout ? "AŞAĞI SAHTE KIRILIM" : "YOK",
    trapRisk: (bullishFalseBreakout || bearishFalseBreakout) && wickDominance > 0.45,
    wickDominance: Math.round(wickDominance * 100),
  };
}

export function buildTimeframeMatrix(rows = [], direction = "NÖTR") {
  const expected = direction === "LONG" ? "YUKARI" : direction === "SHORT" ? "AŞAĞI" : "NÖTR";
  const weights = { "15m": 15, "1h": 25, "4h": 30, "1d": 30 };
  const available = rows.filter((item) => item?.available !== false && item?.trend);
  const aligned = available.filter((item) => item.trend === expected).length;
  const opposed = available.filter((item) => item.trend !== "NÖTR" && item.trend !== expected).length;
  const directional = available.filter((item) => item.trend !== "NÖTR");
  const availableWeight = directional.reduce((sum, item) => sum + (weights[item.timeframe] || 0), 0);
  const alignedWeight = directional.reduce((sum, item) => sum + (item.trend === expected ? weights[item.timeframe] || 0 : 0), 0);
  const opposedWeight = Math.max(0, availableWeight - alignedWeight);
  const score = availableWeight ? Math.round((alignedWeight / availableWeight) * 100) : 0;
  const upper = directional.filter((item) => ["4h", "1d"].includes(item.timeframe));
  const execution = directional.filter((item) => ["15m", "1h"].includes(item.timeframe));
  const layerDirection = (items) => {
    const signed = items.reduce((sum, item) => sum + (item.trend === "YUKARI" ? 1 : -1) * (weights[item.timeframe] || 0), 0);
    return signed > 0 ? "YUKARI" : signed < 0 ? "AŞAĞI" : "NÖTR";
  };
  const higherDirection = layerDirection(upper);
  const executionDirection = layerDirection(execution);
  const bothUpperOpposed = upper.length >= 2 && upper.every((item) => item.trend !== expected);
  const hardConflict = expected === "NÖTR" || bothUpperOpposed || (directional.length >= 3 && score < 35);

  let regime = "TRANSITION";
  let state = "YATAY / GEÇİŞ";
  let riskMultiplier = 0.65;
  let warning = "Zaman dilimleri karışık; pozisyon riski azaltıldı.";
  if (!directional.length || expected === "NÖTR") {
    regime = "NO_DATA"; state = "YÖN BEKLENİYOR"; riskMultiplier = 0; warning = "İşlem yönü için yeterli veri bekleniyor.";
  } else if (hardConflict) {
    regime = "HARD_CONFLICT"; state = "GERÇEK YÖN ÇATIŞMASI"; riskMultiplier = 0; warning = "4 saat ve günlük yapı birlikte sinyalin karşısında; işlem engellendi.";
  } else if (higherDirection === expected && executionDirection !== expected) {
    regime = "PULLBACK"; state = "TREND İÇİ GERİ ÇEKİLME"; riskMultiplier = 0.75; warning = "Ana trend korunuyor; kısa zaman teyidi bekleniyor.";
  } else if (higherDirection !== "NÖTR" && higherDirection !== expected && executionDirection === expected) {
    regime = "COUNTER_TREND"; state = "KARŞI TREND DÜZELTMESİ"; riskMultiplier = 0.5; warning = "Kısa vade sinyali üst zamanın tersinde; ek teyit ve düşük risk gerekir.";
  } else if (score >= 75) {
    regime = "STRONG_ALIGNMENT"; state = "GÜÇLÜ UYUM"; riskMultiplier = 1; warning = "Ana ve işlem zamanları aynı yönü destekliyor.";
  } else if (score >= 55) {
    regime = "ALIGNED"; state = "UYUMLU"; riskMultiplier = 0.9; warning = "Çoğunluk aynı yönde; küçük zaman sapması normal kabul edildi.";
  }
  return {
    rows,
    aligned,
    opposed,
    score,
    hardConflict,
    regime,
    state,
    riskMultiplier,
    warning,
    higherDirection,
    executionDirection,
    availableWeight,
    alignedWeight,
    opposedWeight,
  };
}
