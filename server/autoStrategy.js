function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return NaN;
  const multiplier = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) result = value * multiplier + result * (1 - multiplier);
  return result;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return NaN;
  let gains = 0;
  let losses = 0;
  const changes = [];
  for (let index = 1; index < values.length; index += 1) changes.push(values[index] - values[index - 1]);
  for (const change of changes.slice(0, period)) {
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (const change of changes.slice(period)) {
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return NaN;
  const ranges = candles.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - candles[index].close),
    Math.abs(candle.low - candles[index].close),
  ));
  let value = ranges.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const item of ranges.slice(period)) value = (value * (period - 1) + item) / period;
  return value;
}

function parseCandles(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      time: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
      low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    }))
    .filter((item) => [item.time, item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

function trendOf(candles) {
  const closes = candles.map((item) => item.close);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  return fast > slow ? "LONG" : fast < slow ? "SHORT" : "NEUTRAL";
}

const FRAME_WEIGHTS = { "15m": 15, "1H": 25, "4H": 30, "1D": 30 };

function classifyTimeframes(directions, primaryDirection) {
  const available = Object.entries(FRAME_WEIGHTS).filter(([key]) => directions[key] && directions[key] !== "NEUTRAL");
  const totalWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  const alignedWeight = available.reduce((sum, [key, weight]) => sum + (directions[key] === primaryDirection ? weight : 0), 0);
  const oppositeWeight = available.reduce((sum, [key, weight]) => sum + (directions[key] !== primaryDirection ? weight : 0), 0);
  const alignment = totalWeight ? Math.round(alignedWeight / totalWeight * 100) : 0;
  const higherAligned = ["4H", "1D"].filter((key) => directions[key] === primaryDirection).length;
  const higherOpposite = ["4H", "1D"].filter((key) => directions[key] !== "NEUTRAL" && directions[key] !== primaryDirection).length;
  let regime = "TRANSITION";
  if (!primaryDirection || primaryDirection === "NEUTRAL") regime = "NO_DIRECTION";
  else if (higherOpposite === 2) regime = "HARD_CONFLICT";
  else if (directions["15m"] !== primaryDirection && higherAligned >= 1) regime = "PULLBACK";
  else if (higherOpposite === 1 && alignment < 55) regime = "COUNTER_TREND";
  else if (alignment >= 85) regime = "STRONG_ALIGNMENT";
  else if (alignment >= 65) regime = "ALIGNED";
  return {
    alignment, alignedWeight, oppositeWeight, regime,
    hardConflict: ["HARD_CONFLICT", "NO_DIRECTION"].includes(regime),
    riskMultiplier: regime === "STRONG_ALIGNMENT" ? 1 : regime === "ALIGNED" ? 0.85 : regime === "PULLBACK" ? 0.65 : 0,
  };
}

function analyzeMarket(frames, options = {}) {
  const minDirectionScore = Number(options.minDirectionScore || 80);
  const minEntryScore = Number(options.minEntryScore || 75);
  const maxAtrPercent = Number(options.maxAtrPercent || 3.5);
  const primary = frames["1H"] || [];
  if (primary.length < 30 || ["15m", "4H", "1D"].some((key) => (frames[key] || []).length < 25)) {
    return { ready: false, reason: "Yetersiz mum verisi", directionScore: 0, entryScore: 0 };
  }
  const directions = { "15m": trendOf(frames["15m"]), "1H": trendOf(primary), "4H": trendOf(frames["4H"]), "1D": trendOf(frames["1D"]) };
  const direction = directions["1H"];
  const timeframe = classifyTimeframes(directions, direction);
  const closes = primary.map((item) => item.close);
  const current = closes.at(-1);
  const currentRsi = rsi(closes);
  const currentAtr = atr(primary);
  const atrPercent = currentAtr / current * 100;
  const recent = primary.slice(-21, -1);
  const recentHigh = Math.max(...recent.map((item) => item.high));
  const recentLow = Math.min(...recent.map((item) => item.low));
  const volumeAverage = recent.reduce((sum, item) => sum + item.volume, 0) / Math.max(recent.length, 1);
  const volumeConfirmed = primary.at(-1).volume >= volumeAverage * 0.9;
  const breakout = direction === "LONG" ? current >= recentHigh * 0.995 : current <= recentLow * 1.005;
  const rsiSafe = direction === "LONG" ? currentRsi >= 48 && currentRsi <= 72 : currentRsi >= 28 && currentRsi <= 52;
  const directionScore = Math.round(Math.min(100, 35 + timeframe.alignment * 0.65));
  const entryScore = Math.round(Math.min(100, 35 + timeframe.alignment * 0.35 + (rsiSafe ? 12 : 0) + (volumeConfirmed ? 10 : 0) + (breakout ? 8 : 0)));
  const volatilityLocked = !(atrPercent > 0) || atrPercent > maxAtrPercent;
  const timeframeConflict = timeframe.hardConflict;
  const ready = directionScore >= minDirectionScore && entryScore >= minEntryScore && !volatilityLocked && !timeframeConflict && rsiSafe;
  const stopDistance = currentAtr * 1.5;
  const stop = direction === "LONG" ? current - stopDistance : current + stopDistance;
  const tp1 = direction === "LONG" ? current + stopDistance * 2 : current - stopDistance * 2;
  const tp2 = direction === "LONG" ? current + stopDistance * 3 : current - stopDistance * 3;
  return {
    ready, direction, directionScore, entryScore, timeframeConflict, volatilityLocked,
    timeframeAlignment: timeframe.alignment, timeframeRegime: timeframe.regime, riskMultiplier: timeframe.riskMultiplier,
    rsi: currentRsi, atrPercent, volumeConfirmed, breakout, price: current, stop, tp1, tp2,
    candleTime: primary.at(-1).time, directions,
    reason: ready ? "Koşullar hazır" : volatilityLocked ? "Volatilite kilidi" : timeframeConflict ? "Gerçek üst zaman çatışması" : timeframe.regime === "PULLBACK" ? "Normal geri çekilme teyidi bekleniyor" : !rsiSafe ? "RSI teyidi yok" : "Skor eşiği bekleniyor",
  };
}

module.exports = { ema, rsi, atr, parseCandles, trendOf, classifyTimeframes, analyzeMarket };
