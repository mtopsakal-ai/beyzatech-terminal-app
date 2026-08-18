const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function ema(values, period) {
  if (!values.length) return 0;
  const multiplier = 2 / (period + 1);
  return values.slice(1).reduce(
    (previous, value) => value * multiplier + previous * (1 - multiplier),
    values[0]
  );
}

function sma(values, period) {
  if (!values.length) return 0;
  const recent = values.slice(-Math.min(period, values.length));
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

function emaSeries(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  }
  return output;
}

function macd(values) {
  if (!values.length) return { macd: 0, signal: 0, histogram: 0 };
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = values.map((_, index) => fast[index] - slow[index]);
  const signalLine = emaSeries(line, 9);
  const currentMacd = line.at(-1) || 0;
  const currentSignal = signalLine.at(-1) || 0;
  return {
    macd: currentMacd,
    signal: currentSignal,
    histogram: currentMacd - currentSignal,
  };
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  const recent = values.slice(-(period + 1));
  for (let i = 1; i < recent.length; i += 1) {
    const change = recent[i] - recent[i - 1];
    change >= 0 ? (gains += change) : (losses += Math.abs(change));
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function atr(candles, period = 14) {
  if (candles.length < 2) return 0;
  const recent = candles.slice(-(period + 1));
  const ranges = recent.slice(1).map((candle, index) => {
    const previousClose = recent[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

export function calculateIndicators(candles) {
  const closes = candles.map((item) => item.close);
  const volumes = candles.map((item) => item.volume);
  const currentVolume = volumes.at(-1) || 0;
  const previousVolumes = volumes.slice(-21, -1);
  const averageVolume = previousVolumes.length
    ? previousVolumes.reduce((sum, value) => sum + value, 0) / previousVolumes.length
    : currentVolume;
  const recentCloses = closes.slice(-8);
  const firstClose = recentCloses[0] || 0;
  const lastClose = recentCloses.at(-1) || 0;
  const macdResult = macd(closes);

  return {
    rsi: rsi(closes),
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    sma200: sma(closes, 200),
    macd: macdResult.macd,
    macdSignal: macdResult.signal,
    macdHistogram: macdResult.histogram,
    volumeChange: averageVolume ? ((currentVolume - averageVolume) / averageVolume) * 100 : 0,
    atr: atr(candles),
    candleTrend: lastClose > firstClose ? "YUKARI" : lastClose < firstClose ? "AŞAĞI" : "NÖTR",
  };
}

export function calculateSupportResistance(candles, currentPrice) {
  const recent = candles.slice(-120);
  const pivotHighs = [];
  const pivotLows = [];
  for (let index = 2; index < recent.length - 2; index += 1) {
    const candle = recent[index];
    const neighbors = recent.slice(index - 2, index + 3);
    if (neighbors.every((item) => candle.high >= item.high)) pivotHighs.push(candle.high);
    if (neighbors.every((item) => candle.low <= item.low)) pivotLows.push(candle.low);
  }
  const fallbackLow = Math.min(...recent.map((item) => item.low));
  const fallbackHigh = Math.max(...recent.map((item) => item.high));
  const supportCandidates = pivotLows.filter((value) => value < currentPrice).sort((a, b) => b - a);
  const resistanceCandidates = pivotHighs.filter((value) => value > currentPrice).sort((a, b) => a - b);
  return {
    support: supportCandidates[0] || fallbackLow,
    resistance: resistanceCandidates[0] || fallbackHigh,
  };
}

export function buildEntryPlan({
  candles,
  currentPrice,
  direction,
  score,
  indicators,
  higherTrend = "NÖTR",
  orderBookLongPercent = 50,
  btcTrend = "NÖTR",
  oiChangePercent = 0,
  oiChangeAvailable = false,
  takerBuyPercent = 50,
  takerFlowAvailable = false,
  timeframe = "5m",
}) {
  // Bu fonksiyon yalnızca kapanmış mumlarla çağrılmalıdır. Son iki kapanmış mum
  // teyit için ayrılır; seviyeler daha eski piyasa yapısından hesaplanır.
  const closedCandles = candles.filter((item) => Number.isFinite(item?.close));
  const lastClosed = closedCandles.at(-1) || { close: currentPrice, high: currentPrice, low: currentPrice };
  const previousClosed = closedCandles.at(-2) || lastClosed;
  const structureCandles = closedCandles.length > 8 ? closedCandles.slice(0, -2) : closedCandles.slice(0, -1);
  const structureReference = previousClosed.close || currentPrice;
  const { support, resistance } = calculateSupportResistance(
    structureCandles.length ? structureCandles : closedCandles,
    structureReference
  );
  const atrValue = indicators.atr || currentPrice * 0.01;
  const isLong = direction === "LONG";
  const trendAligned = isLong
    ? indicators.ema9 > indicators.ema21 && indicators.candleTrend === "YUKARI"
    : indicators.ema9 < indicators.ema21 && indicators.candleTrend === "AŞAĞI";
  const higherAligned = higherTrend === (isLong ? "YUKARI" : "AŞAĞI");
  const rsiSafe = isLong
    ? indicators.rsi >= 42 && indicators.rsi <= 68
    : indicators.rsi >= 32 && indicators.rsi <= 58;
  const bookAligned = isLong ? orderBookLongPercent >= 52 : orderBookLongPercent <= 48;
  const volumeConfirmed = indicators.volumeChange >= 0;
  const btcAligned = btcTrend === (isLong ? "YUKARI" : "AŞAĞI");
  const oiAligned = oiChangeAvailable ? oiChangePercent >= 0.03 : false;
  const takerAligned = takerFlowAvailable
    ? isLong ? takerBuyPercent >= 54 : takerBuyPercent <= 46
    : false;
  const reference = isLong ? support : resistance;
  const confirmationPrice = lastClosed.close;
  const distanceToReference = Math.abs(confirmationPrice - reference);
  const pullbackReady = distanceToReference <= atrValue * 0.9;
  const directBreakout = isLong
    ? previousClosed.close <= resistance && lastClosed.close > resistance
    : previousClosed.close >= support && lastClosed.close < support;
  const breakoutWindow = closedCandles.slice(-5, -1);
  const recentBreakout = breakoutWindow.some((candle, index) => {
    const prior = closedCandles.at(-(breakoutWindow.length - index + 1)) || previousClosed;
    return isLong
      ? prior.close <= resistance && candle.close > resistance
      : prior.close >= support && candle.close < support;
  });
  const retestReady = recentBreakout && (isLong
    ? lastClosed.low <= resistance + atrValue * 0.35 && lastClosed.close >= resistance
    : lastClosed.high >= support - atrValue * 0.35 && lastClosed.close <= support);
  const patternReady = pullbackReady || directBreakout || retestReady;
  const emaPullbackReady = Math.abs(confirmationPrice - indicators.ema21) <= atrValue * 0.45 && trendAligned;
  const liquiditySweep = isLong
    ? lastClosed.low < support && lastClosed.close > support
    : lastClosed.high > resistance && lastClosed.close < resistance;
  const recentRanges = closedCandles.slice(-8, -1).map((item) => item.high - item.low);
  const averageRecentRange = recentRanges.length
    ? recentRanges.reduce((sum, value) => sum + value, 0) / recentRanges.length
    : atrValue;
  const compressionReady = averageRecentRange <= atrValue * 0.78 && directBreakout;
  const structuralPatternReady = patternReady || emaPullbackReady || liquiditySweep || compressionReady;
  const notChasing = Math.abs(confirmationPrice - indicators.ema21) <= atrValue * 1.6;
  const invalidated = isLong
    ? confirmationPrice < support - atrValue * 0.35
    : confirmationPrice > resistance + atrValue * 0.35;
  const atrPercent = confirmationPrice > 0 ? (atrValue / confirmationPrice) * 100 : 0;
  const shortFrame = ["1m", "5m", "15m"].includes(timeframe);
  const oversizedCandle = Math.abs(lastClosed.close - lastClosed.open) > atrValue * 2.2;
  const volatilityBlock = atrPercent > (shortFrame ? 3 : 6) || indicators.volumeChange > 250 || oversizedCandle;
  const confirmations = [trendAligned, higherAligned, btcAligned, rsiSafe, bookAligned, volumeConfirmed, oiAligned, takerAligned];
  const confirmationCount = confirmations.filter(Boolean).length;

  let status = "TEYİT BEKLİYOR";
  if (invalidated) status = "İPTAL";
  else if (volatilityBlock) status = "İŞLEM YOK";
  else if (score < 65 || !notChasing) status = "ADAY";
  else if (confirmationCount >= 6 && structuralPatternReady) status = "GİRİŞ HAZIR";

  const zoneCenter = pullbackReady ? reference : confirmationPrice;
  const zoneLow = zoneCenter - atrValue * 0.2;
  const zoneHigh = zoneCenter + atrValue * 0.2;
  const stop = isLong ? support - atrValue * 0.55 : resistance + atrValue * 0.55;
  const risk = Math.max(Math.abs(zoneCenter - stop), atrValue * 0.5);
  const naturalTarget = isLong ? resistance : support;
  const tp1 = isLong
    ? Math.max(naturalTarget, zoneCenter + risk * 2)
    : Math.min(naturalTarget, zoneCenter - risk * 2);
  const tp2 = isLong ? zoneCenter + risk * 3 : zoneCenter - risk * 3;

  return {
    status,
    support,
    resistance,
    zoneLow,
    zoneHigh,
    entry: zoneCenter,
    stop: Math.max(0, stop),
    tp1: Math.max(0, tp1),
    tp2: Math.max(0, tp2),
    invalidation: isLong ? support - atrValue * 0.35 : resistance + atrValue * 0.35,
    confirmationCount,
    confirmationTotal: confirmations.length,
    confirmationPrice,
    volatilityBlock,
    setupType: liquiditySweep
      ? "LİKİDİTE SÜPÜRMESİ"
      : compressionReady
      ? "SIKIŞMA KIRILIMI"
      : retestReady
      ? "KIRILIM + RETEST"
      : directBreakout
      ? "KIRILIM"
      : emaPullbackReady
      ? "EMA21 GERİ ÇEKİLMESİ"
      : pullbackReady
      ? isLong ? "DESTEK TEPKİSİ" : "DİRENÇ REDDİ"
      : "BEKLEME",
    confirmations: [
      { label: "Ana trend", ok: trendAligned },
      { label: "Üst zaman", ok: higherAligned },
      { label: "BTC trendi", ok: btcAligned },
      { label: "RSI güvenli", ok: rsiSafe },
      { label: "Emir defteri", ok: bookAligned },
      { label: "Hacim", ok: volumeConfirmed },
      { label: "OI artışı", ok: oiAligned, available: oiChangeAvailable },
      { label: "Aktif alım/satım", ok: takerAligned, available: takerFlowAvailable },
      { label: liquiditySweep ? "Likidite süpürmesi" : retestReady ? "Kırılım + retest" : "Yapı teyidi", ok: structuralPatternReady },
    ],
  };
}

export function buildCalibrationProfile(history = []) {
  const evaluated = history.filter((item) =>
    ["WIN", "LOSS", "NEUTRAL"].includes(item?.evaluationStatus) && item?.setupType
  );
  const grouped = evaluated.reduce((result, item) => {
    const key = item.setupType;
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {});

  const scenarios = Object.entries(grouped).reduce((result, [setupType, items]) => {
    const decisive = items.filter((item) => ["WIN", "LOSS"].includes(item.evaluationStatus));
    const wins = decisive.filter((item) => item.evaluationStatus === "WIN").length;
    const returns = items.map((item) => Number(item.signalReturn || 0));
    const averageReturn = returns.length
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : 0;
    const winRate = decisive.length ? (wins / decisive.length) * 100 : 50;
    const sampleConfidence = clamp(items.length / 30, 0, 1);
    const rawEdge = clamp((winRate - 50) * 0.16 + averageReturn * 1.5, -8, 8);
    const adjustment = items.length >= 8 ? Math.round(rawEdge * sampleConfidence) : 0;
    result[setupType] = {
      setupType,
      samples: items.length,
      decisiveSamples: decisive.length,
      wins,
      winRate,
      averageReturn,
      sampleConfidence: Math.round(sampleConfidence * 100),
      adjustment,
      status: items.length < 8
        ? "ÖRNEKLEM BEKLENİYOR"
        : items.length < 30
        ? "ÖN KALİBRASYON"
        : averageReturn > 0 && winRate >= 52
        ? "DOĞRULANMIŞ"
        : "ZAYIF SENARYO",
    };
    return result;
  }, {});

  return {
    totalEvaluated: evaluated.length,
    scenarios,
    ranked: Object.values(scenarios).sort((first, second) => {
      if (second.adjustment !== first.adjustment) return second.adjustment - first.adjustment;
      return second.samples - first.samples;
    }),
    ready: evaluated.length >= 20,
  };
}

export function buildDecisionEngine({
  candles = [],
  currentPrice = 0,
  analysis,
  plan,
  indicators,
  higherTrend = "NÖTR",
  timeframe = "5m",
  marketType = "SPOT",
  fundingRate = 0,
  openInterestChange = 0,
  openInterestAvailable = false,
  takerBuyPercent = 50,
  takerFlowAvailable = false,
  orderBookLongPercent = 50,
  calibrationProfile = null,
}) {
  const direction = analysis?.direction || "NÖTR";
  const isLong = direction === "LONG";
  const atrValue = Number(indicators?.atr || currentPrice * 0.01);
  const atrPercent = currentPrice > 0 ? (atrValue / currentPrice) * 100 : 0;
  const emaGapPercent = currentPrice > 0
    ? (Math.abs(Number(indicators?.ema9 || 0) - Number(indicators?.ema21 || 0)) / currentPrice) * 100
    : 0;
  const trendAligned = isLong
    ? indicators.ema9 > indicators.ema21
    : indicators.ema9 < indicators.ema21;
  const higherAligned = higherTrend === (isLong ? "YUKARI" : "AŞAĞI");
  const directionalVolume = Number(indicators?.volumeChange || 0) >= 0;

  let regime = "YATAY / DENGELİ";
  if (atrPercent >= (["1m", "5m", "15m"].includes(timeframe) ? 2.5 : 5)) {
    regime = "YÜKSEK VOLATİLİTE";
  } else if (emaGapPercent < 0.12 && Math.abs(Number(indicators?.macdHistogram || 0)) < atrValue * 0.04) {
    regime = "SIKIŞMA";
  } else if (trendAligned && higherAligned && directionalVolume) {
    regime = isLong ? "GÜÇLÜ YUKARI TREND" : "GÜÇLÜ AŞAĞI TREND";
  } else if (trendAligned) {
    regime = isLong ? "YUKARI EĞİLİM" : "AŞAĞI EĞİLİM";
  }

  let directionConfidence = Number(analysis?.score || 50);
  directionConfidence += higherAligned ? 6 : -8;
  directionConfidence += trendAligned ? 4 : -6;
  if (openInterestAvailable) directionConfidence += openInterestChange >= 0.03 ? 4 : -3;
  if (takerFlowAvailable) {
    const takerAligned = isLong ? takerBuyPercent >= 52 : takerBuyPercent <= 48;
    directionConfidence += takerAligned ? 4 : -4;
  }
  const bookAligned = isLong ? orderBookLongPercent >= 52 : orderBookLongPercent <= 48;
  directionConfidence += bookAligned ? 3 : -3;
  directionConfidence = Math.round(clamp(directionConfidence, 35, 97));

  const risk = Math.abs(Number(plan?.entry || 0) - Number(plan?.stop || 0));
  const reward = Math.abs(Number(plan?.tp1 || 0) - Number(plan?.entry || 0));
  const riskReward = risk > 0 ? reward / risk : 0;
  const confirmationRatio = Number(plan?.confirmationCount || 0) / Math.max(1, Number(plan?.confirmationTotal || 8));
  const setupBonus = {
    "KIRILIM + RETEST": 18,
    "LİKİDİTE SÜPÜRMESİ": 17,
    "SIKIŞMA KIRILIMI": 16,
    "DESTEK TEPKİSİ": 14,
    "DİRENÇ REDDİ": 14,
    "EMA21 GERİ ÇEKİLMESİ": 12,
    KIRILIM: 9,
    BEKLEME: 0,
  }[plan?.setupType || "BEKLEME"] || 0;
  const distanceToEntryAtr = atrValue > 0
    ? Math.abs(currentPrice - Number(plan?.entry || currentPrice)) / atrValue
    : 9;
  let entryQuality = 28 + confirmationRatio * 36 + setupBonus;
  entryQuality += riskReward >= 2 ? 12 : riskReward >= 1.5 ? 6 : -12;
  entryQuality += distanceToEntryAtr <= 0.55 ? 8 : distanceToEntryAtr <= 1 ? 2 : -10;
  if (plan?.volatilityBlock) entryQuality -= 30;
  if (plan?.status === "İPTAL") entryQuality = Math.min(entryQuality, 20);
  const scenarioCalibration = calibrationProfile?.scenarios?.[plan?.setupType] || null;
  const calibrationAdjustment = Number(scenarioCalibration?.adjustment || 0);
  entryQuality += calibrationAdjustment;
  entryQuality = Math.round(clamp(entryQuality, 5, 96));

  const fundingPercent = Number(fundingRate || 0) * 100;
  const crowdingRisk = isLong ? fundingPercent > 0.04 : fundingPercent < -0.04;
  const rsiExtreme = isLong ? indicators.rsi > 72 : indicators.rsi < 28;
  const conflicts = [];
  if (!higherAligned) conflicts.push("Üst zaman yönü sinyalle uyuşmuyor");
  if (!bookAligned) conflicts.push("Emir defteri karşı yönde baskı gösteriyor");
  if (crowdingRisk) conflicts.push("Fonlama kalabalık pozisyon riskine işaret ediyor");
  if (rsiExtreme) conflicts.push("RSI giriş yönünde aşırı bölgeye ulaştı");
  if (riskReward < 1.5) conflicts.push("TP1 risk/ödül oranı 1:1.5 altında");
  if (plan?.volatilityBlock) conflicts.push("Olağan dışı volatilite güvenlik kilidini açtı");

  const hardBlock = plan?.volatilityBlock || plan?.status === "İPTAL" || riskReward < 1.2;
  let lifecycle = "İZLEME";
  if (hardBlock) lifecycle = "İŞLEM YOK";
  else if (directionConfidence < 62) lifecycle = "YÖN BELİRSİZ";
  else if (entryQuality < 55) lifecycle = "KURULUM BEKLENİYOR";
  else if (entryQuality < 72) lifecycle = "TEYİT BEKLENİYOR";
  else if (plan?.status === "GİRİŞ HAZIR") lifecycle = "GİRİŞ HAZIR";
  else lifecycle = "GİRİŞ BÖLGESİ İZLENİYOR";

  const positives = [
    higherAligned && "Üst zaman trendi aynı yönde",
    trendAligned && "EMA 9/21 yön yapısı uyumlu",
    bookAligned && "Emir defteri yönü destekliyor",
    directionalVolume && "Hacim teyidi mevcut",
    openInterestAvailable && openInterestChange >= 0.03 && "Fiyat hareketi OI artışıyla destekleniyor",
    takerFlowAvailable && (isLong ? takerBuyPercent >= 52 : takerBuyPercent <= 48) && "Aktif alım/satım akışı yönle uyumlu",
    plan?.setupType !== "BEKLEME" && `${plan.setupType} senaryosu algılandı`,
    riskReward >= 1.5 && `TP1 risk/ödül 1:${riskReward.toFixed(2)}`,
  ].filter(Boolean);

  const recent = candles.slice(-60);
  const equalHighs = recent.filter((item) => Math.abs(item.high - Number(plan?.resistance || 0)) <= atrValue * 0.2).length;
  const equalLows = recent.filter((item) => Math.abs(item.low - Number(plan?.support || 0)) <= atrValue * 0.2).length;

  return {
    regime,
    directionConfidence,
    entryQuality,
    lifecycle,
    setupType: plan?.setupType || "BEKLEME",
    riskReward,
    hardBlock,
    positives,
    conflicts,
    explanation: positives.length
      ? `${direction} yönü ${positives.slice(0, 2).join(" ve ").toLowerCase()} nedeniyle öne çıkıyor.`
      : "Veriler ortak bir yönü yeterince desteklemiyor.",
    safetyNote: hardBlock
      ? "Güvenlik motoru yeni işlem açılmasını engelliyor."
      : conflicts.length
      ? "Çelişkiler giderilmeden pozisyon boyutu artırılmamalıdır."
      : "Belirgin güvenlik engeli yok; stop ve pozisyon riski yine zorunludur.",
    liquidityMap: {
      sellLiquidity: Number(plan?.resistance || 0),
      buyLiquidity: Number(plan?.support || 0),
      equalHighTests: equalHighs,
      equalLowTests: equalLows,
    },
    dataCompleteness: Math.round(
      (5 + Number(openInterestAvailable) + Number(takerFlowAvailable) + Number(marketType === "FUTURES")) / 8 * 100
    ),
    calibration: scenarioCalibration
      ? {
          applied: scenarioCalibration.samples >= 8,
          adjustment: calibrationAdjustment,
          samples: scenarioCalibration.samples,
          winRate: scenarioCalibration.winRate,
          averageReturn: scenarioCalibration.averageReturn,
          confidence: scenarioCalibration.sampleConfidence,
          status: scenarioCalibration.status,
        }
      : {
          applied: false,
          adjustment: 0,
          samples: 0,
          winRate: 0,
          averageReturn: 0,
          confidence: 0,
          status: "ÖRNEKLEM BEKLENİYOR",
        },
  };
}

export function analyzeAI({
  longPercent,
  rsi: rsiValue,
  ema9,
  ema21,
  volumeChange,
  candleTrend,
  marketType = "SPOT",
  fundingRate = 0,
  futuresLongPercent = null,
}) {
  let bias = 0;
  const factors = [];

  const bookPositive = longPercent >= 50;
  bias += clamp((longPercent - 50) * 0.8, -20, 20);
  factors.push({ label: "Order Book", value: `%${longPercent} LONG`, positive: bookPositive });

  const emaPositive = ema9 >= ema21;
  bias += emaPositive ? 18 : -18;
  factors.push({ label: "EMA 9/21", value: emaPositive ? "YUKARI" : "AŞAĞI", positive: emaPositive });

  const rsiPositive = rsiValue >= 50;
  if (rsiValue > 70) bias -= 5;
  else if (rsiValue < 30) bias += 5;
  else bias += rsiPositive ? 12 : -12;
  factors.push({ label: "RSI", value: rsiValue.toFixed(1), positive: rsiPositive && rsiValue <= 70 });

  const trendPositive = candleTrend === "YUKARI";
  bias += trendPositive ? 15 : candleTrend === "AŞAĞI" ? -15 : 0;
  factors.push({ label: "Mum trendi", value: candleTrend, positive: trendPositive });

  const volumePositive = volumeChange >= 0;
  const volumeWeight = clamp(Math.abs(volumeChange) / 5, 0, 10);
  bias += volumePositive ? volumeWeight : -volumeWeight;
  factors.push({
    label: "Hacim",
    value: `${volumeChange >= 0 ? "+" : ""}${volumeChange.toFixed(1)}%`,
    positive: volumePositive,
  });

  if (marketType === "FUTURES") {
    if (Number.isFinite(futuresLongPercent)) {
      const futuresCrowdPositive = futuresLongPercent >= 50;
      bias += clamp((futuresLongPercent - 50) * 0.35, -10, 10);
      factors.push({
        label: "Futures hesap oranı",
        value: `%${futuresLongPercent.toFixed(1)} LONG`,
        positive: futuresCrowdPositive,
      });
    }

    const fundingPercent = fundingRate * 100;
    if (fundingPercent > 0.03) bias -= 5;
    else if (fundingPercent < -0.03) bias += 5;
    factors.push({
      label: "Funding",
      value: `${fundingPercent >= 0 ? "+" : ""}${fundingPercent.toFixed(4)}%`,
      positive: fundingPercent <= 0.03,
    });
  }

  const direction = bias >= 0 ? "LONG" : "SHORT";
  const score = Math.round(clamp(55 + Math.abs(bias) * 0.75, 50, 95));
  const agreement = factors.filter((factor) =>
    direction === "LONG" ? factor.positive : !factor.positive
  ).length;

  let comment;
  if (score >= 80 && agreement >= 4) {
    comment = `${direction} yönünde güçlü teyit var. Yine de giriş bölgesi ve stop seviyesi korunmalıdır.`;
  } else if (score >= 65) {
    comment = `${direction} eğilimi öne çıkıyor; göstergelerin tamamı aynı yönde değil. Kontrollü işlem ve ek teyit gerekir.`;
  } else {
    comment = "Göstergeler karışık. Net bir yön oluşana kadar beklemek daha temkinli olabilir.";
  }

  return { direction, score, comment, factors };
}
