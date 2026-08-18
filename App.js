import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import AIComment from "./components/AIComment";
import MiniChart from "./components/MiniChart";
import StrengthGauge from "./components/StrengthGauge";
import DataHealthCard from "./components/DataHealthCard";
import TimeframeMatrix from "./components/TimeframeMatrix";
import SmartMoneyAnalysis from "./components/SmartMoneyAnalysis";
import ExpertAnalystReport from "./components/ExpertAnalystReport";
import MarketDataPanel from "./components/MarketDataPanel";
import TradeSummary from "./components/TradeSummary";
import { createMarketSocket } from "./api/websocketManager";
import {
  analyzeAI,
  buildCalibrationProfile,
  buildDecisionEngine,
  buildEntryPlan,
  calculateIndicators,
} from "./engine/aiEngine";
import { analyzeMarketStructure, buildTimeframeMatrix } from "./engine/structureEngine";
import { calculateDynamicRisk } from "./engine/riskEngine";
import { buildRegimePerformance, buildWalkForwardReport, getLossStreak } from "./engine/validationEngine";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const TIMEFRAME_LABELS = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1sa", "4h": "4sa", "1d": "1G" };
const BITGET_INTERVALS = {
  "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day",
};
const BITGET_FUTURES_INTERVALS = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D",
};
const DEFAULT_FAVORITES = ["BTC", "ETH", "SOL"];
const MARKET_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK"];
const LIQUIDATION_PERIODS = [
  ["1h", 60 * 60 * 1000],
  ["4h", 4 * 60 * 60 * 1000],
  ["12h", 12 * 60 * 60 * 1000],
  ["24h", 24 * 60 * 60 * 1000],
];
const LARGE_LIQUIDATION_ALERT_USD = 100_000;
const WHALE_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB"];
const WHALE_THRESHOLDS = [50_000, 100_000, 250_000];
const SIGNAL_EVALUATION_MS = {
  "1m": 15 * 60 * 1000,
  "5m": 30 * 60 * 1000,
  "15m": 60 * 60 * 1000,
  "1h": 4 * 60 * 60 * 1000,
  "4h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};
const SCANNER_TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const SCANNER_SCORE_FILTERS = [45, 55, 70];
const SCANNER_MIN_VOLUME_USD = 10_000_000;
const SCANNER_COIN_LIMIT = 24;
const TIMEFRAME_MS = {
  "1m": 60_000, "5m": 5 * 60_000, "15m": 15 * 60_000,
  "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "1d": 24 * 60 * 60_000,
};
const SCANNER_SIGNAL_TTL_MS = {
  "5m": 30 * 60_000,
  "15m": 90 * 60_000,
  "1h": 6 * 60 * 60_000,
  "4h": 24 * 60 * 60_000,
};
const PAPER_TRADING_COST_PERCENT = 0.12;
const PERFORMANCE_WINDOWS = [20, 50, 100];
const CONFIRMATION_TIMEFRAMES = {
  "1m": "15m", "5m": "1h", "15m": "1h", "1h": "4h", "4h": "1d", "1d": "1d",
};

function formatCompact(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
  return `$${number.toFixed(2)}`;
}

function formatScannerPrice(value) {
  const number = Number(value) || 0;
  if (number >= 1000) return number.toFixed(2);
  if (number >= 1) return number.toFixed(4);
  if (number >= 0.01) return number.toFixed(5);
  return number.toFixed(7);
}

function normalizeScannerCandles(rawCandles, timeframe) {
  const now = Date.now();
  const normalized = rawCandles
    .map((item) => ({
      time: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
    }))
    .filter((item) => Number.isFinite(item.close) && item.close > 0)
    .sort((first, second) => first.time - second.time);
  const closed = normalized.filter((item) => item.time + (TIMEFRAME_MS[timeframe] || 0) <= now);
  return closed.length >= 35 ? closed : normalized.slice(0, -1);
}

function buildScannerSignal(ticker, rawCandles, options = {}) {
  const {
    timeframe = "15m",
    higherTimeframe = "1h",
    rawHigherCandles = [],
    orderBookLongPercent = 50,
    orderBookSampleCount = 1,
  } = options;
  const candles = normalizeScannerCandles(rawCandles, timeframe);
  const higherCandles = normalizeScannerCandles(rawHigherCandles, higherTimeframe);

  if (candles.length < 35) return null;

  const technical = calculateIndicators(candles);
  const higherTechnical = higherCandles.length >= 35 ? calculateIndicators(higherCandles) : null;
  const currentPrice = Number(ticker.lastPr || 0) || candles.at(-1)?.close || 0;
  const lastClosed = candles.at(-1);
  const previousClosed = candles.at(-2) || lastClosed;
  const change24h = Number(ticker.change24h || 0) * 100;
  const fundingRate = Number(ticker.fundingRate || 0);
  let bias = 0;
  const reasons = [];

  if (technical.ema9 > technical.ema21) {
    bias += 22;
    reasons.push("EMA 9/21 yukarı kesişim");
  } else {
    bias -= 22;
    reasons.push("EMA 9/21 aşağı eğilim");
  }

  if (technical.candleTrend === "YUKARI") {
    bias += 14;
    reasons.push("Kısa dönem mum trendi yukarı");
  } else if (technical.candleTrend === "AŞAĞI") {
    bias -= 14;
    reasons.push("Kısa dönem mum trendi aşağı");
  }

  if (technical.macdHistogram > 0) {
    bias += 14;
    reasons.push("MACD momentumu pozitif");
  } else {
    bias -= 14;
    reasons.push("MACD momentumu negatif");
  }

  if (technical.rsi >= 52 && technical.rsi <= 68) {
    bias += 12;
    reasons.push(`RSI alıcı bölgesinde (${technical.rsi.toFixed(1)})`);
  } else if (technical.rsi >= 32 && technical.rsi <= 48) {
    bias -= 12;
    reasons.push(`RSI satıcı bölgesinde (${technical.rsi.toFixed(1)})`);
  } else if (technical.rsi > 72) {
    bias -= 8;
    reasons.push(`RSI aşırı alım riski (${technical.rsi.toFixed(1)})`);
  } else if (technical.rsi < 28) {
    bias += 8;
    reasons.push(`RSI aşırı satım tepkisi (${technical.rsi.toFixed(1)})`);
  }

  if (change24h >= 1) {
    bias += 10;
    reasons.push(`24s değişim +%${change24h.toFixed(1)}`);
  } else if (change24h <= -1) {
    bias -= 10;
    reasons.push(`24s değişim %${change24h.toFixed(1)}`);
  }

  if (fundingRate >= 0.0005) {
    bias -= 6;
    reasons.push("Pozitif fonlama kalabalık LONG riski");
  } else if (fundingRate <= -0.0005) {
    bias += 6;
    reasons.push("Negatif fonlama SHORT sıkışma potansiyeli");
  }

  const direction = Math.abs(bias) < 18 ? "NÖTR" : bias > 0 ? "LONG" : "SHORT";
  const isLong = direction === "LONG";
  const higherDirection = !higherTechnical
    ? "NÖTR"
    : higherTechnical.ema9 > higherTechnical.ema21
    ? "LONG"
    : higherTechnical.ema9 < higherTechnical.ema21
    ? "SHORT"
    : "NÖTR";
  const higherAligned = direction !== "NÖTR" && higherDirection === direction;
  const bookAligned = direction !== "NÖTR" && (isLong ? orderBookLongPercent >= 52 : orderBookLongPercent <= 48);
  const closedCandleConfirmed = direction !== "NÖTR" && (isLong
    ? lastClosed.close > lastClosed.open && lastClosed.close >= technical.ema9
    : lastClosed.close < lastClosed.open && lastClosed.close <= technical.ema9);
  const reversalRetestConfirmed = direction !== "NÖTR" && !higherAligned && technical.volumeChange >= 20 &&
    (isLong
      ? previousClosed.close <= technical.ema21 && lastClosed.close > technical.ema21 && technical.macdHistogram > 0
      : previousClosed.close >= technical.ema21 && lastClosed.close < technical.ema21 && technical.macdHistogram < 0);
  if (higherAligned) reasons.push(`${TIMEFRAME_LABELS[higherTimeframe]} üst zaman yönü uyumlu`);
  else if (reversalRetestConfirmed) reasons.push("Hacimli dönüş kırılımı kapanmış mumla teyitli");
  else if (direction !== "NÖTR") reasons.push(`${TIMEFRAME_LABELS[higherTimeframe]} üst zaman teyidi yok`);
  reasons.push(`Emir defteri ortalaması %${orderBookLongPercent.toFixed(0)} LONG (${orderBookSampleCount} örnek)`);

  let directionScore = direction === "NÖTR" ? 45 : 55 + Math.abs(bias) * 0.42;
  directionScore += higherAligned ? 10 : reversalRetestConfirmed ? -3 : -12;
  directionScore += bookAligned ? 6 : -6;
  directionScore = Math.round(Math.max(5, Math.min(96, directionScore)));
  const atrValue = technical.atr > 0 ? technical.atr : currentPrice * 0.01;
  const atrPercent = currentPrice > 0 ? atrValue / currentPrice * 100 : 99;
  const zoneCenter = Number(technical.ema21 || currentPrice);
  const distanceToEntryAtr = atrValue > 0 ? Math.abs(currentPrice - zoneCenter) / atrValue : 9;
  let entryScore = 34;
  entryScore += closedCandleConfirmed ? 22 : -12;
  entryScore += higherAligned ? 15 : reversalRetestConfirmed ? 5 : -12;
  entryScore += bookAligned ? 10 : -8;
  entryScore += technical.volumeChange >= 0 ? 8 : -6;
  entryScore += distanceToEntryAtr <= 0.65 ? 15 : distanceToEntryAtr <= 1.2 ? 7 : -12;
  entryScore = Math.round(Math.max(5, Math.min(96, entryScore)));

  let riskScore = 78;
  const volatilityLimit = ["5m", "15m"].includes(timeframe) ? 3 : 6;
  if (atrPercent > volatilityLimit) riskScore -= 35;
  else if (atrPercent > volatilityLimit * 0.65) riskScore -= 15;
  if ((isLong && fundingRate > 0.0005) || (!isLong && direction === "SHORT" && fundingRate < -0.0005)) riskScore -= 12;
  if (!higherAligned && direction !== "NÖTR") riskScore -= reversalRetestConfirmed ? 8 : 15;
  riskScore = Math.round(Math.max(5, Math.min(96, riskScore)));

  const score = Math.round(directionScore * 0.4 + entryScore * 0.35 + riskScore * 0.25);
  const stopDistance = atrValue * 1.5;
  const entry = zoneCenter;
  const stop =
    direction === "LONG"
      ? entry - stopDistance
      : direction === "SHORT"
      ? entry + stopDistance
      : entry;
  const tp1 =
    direction === "LONG"
      ? entry + stopDistance * 2
      : direction === "SHORT"
      ? entry - stopDistance * 2
      : entry;
  const tp2 =
    direction === "LONG"
      ? entry + stopDistance * 3
      : direction === "SHORT"
      ? entry - stopDistance * 3
      : entry;

  const zoneLow = zoneCenter - atrValue * 0.25;
  const zoneHigh = zoneCenter + atrValue * 0.25;
  const invalidated = direction === "LONG"
    ? currentPrice <= stop
    : direction === "SHORT"
    ? currentPrice >= stop
    : false;
  const entryReady = direction !== "NÖTR" && (higherAligned || reversalRetestConfirmed) && bookAligned && closedCandleConfirmed &&
    distanceToEntryAtr <= 0.65 && riskScore >= 60 && !invalidated;
  const lifecycle = invalidated
    ? "İPTAL"
    : direction === "NÖTR"
    ? "YÖN BELİRSİZ"
    : !higherAligned && !reversalRetestConfirmed
    ? "ÜST ZAMAN BEKLİYOR"
    : entryReady
    ? "GİRİŞ HAZIR"
    : distanceToEntryAtr <= 1.2
    ? "GİRİŞ BÖLGESİ İZLENİYOR"
    : "ADAY";

  return {
    coin: String(ticker.symbol || "").replace(/USDT$/, ""),
    symbol: ticker.symbol,
    direction,
    score,
    directionScore,
    entryScore,
    riskScore,
    lifecycle,
    price: currentPrice,
    entry,
    zoneLow,
    zoneHigh,
    stop,
    tp1,
    tp2,
    riskReward: 2,
    rsi: technical.rsi,
    volume: Number(ticker.usdtVolume || 0),
    volumeChange: technical.volumeChange,
    change24h,
    fundingRate,
    higherTimeframe,
    higherAligned,
    reversalRetestConfirmed,
    setupType: reversalRetestConfirmed ? "DÖNÜŞ KIRILIMI" : "TREND DEVAMI",
    distanceToEntryAtr,
    closedCandleConfirmed,
    orderBookLongPercent,
    orderBookSampleCount,
    reasons: reasons.slice(-5),
  };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TerminalApp />
    </SafeAreaProvider>
  );
}

function TerminalApp() {
  const insets = useSafeAreaInsets();
  const [coinInput, setCoinInput] = useState("ETH");
  const [coin, setCoin] = useState("ETH");
  const [exchange, setExchange] = useState("BINANCE");
  const [marketType, setMarketType] = useState("SPOT");
  const [timeframe, setTimeframe] = useState("5m");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Bağlanıyor");
  const [error, setError] = useState("");
  const [futuresWarning, setFuturesWarning] = useState("");
  const [lastUpdate, setLastUpdate] = useState("--:--:--");

  const [price, setPrice] = useState("0.0000");
  const [ratio, setRatio] = useState("50 / 50");
  const [signal, setSignal] = useState("NÖTR");
  const [longAvg, setLongAvg] = useState("0");
  const [shortAvg, setShortAvg] = useState("0");
  const [entry, setEntry] = useState("0");
  const [stop, setStop] = useState("0");
  const [tp1, setTp1] = useState("0");
  const [tp2, setTp2] = useState("0");
  const [entryPlan, setEntryPlan] = useState({
    status: "ADAY", support: 0, resistance: 0, zoneLow: 0, zoneHigh: 0,
    invalidation: 0, confirmationCount: 0, confirmations: [], higherTimeframe: "1h",
  });
  const [decision, setDecision] = useState({
    regime: "VERİ BEKLENİYOR",
    directionConfidence: 50,
    entryQuality: 0,
    lifecycle: "İZLEME",
    setupType: "BEKLEME",
    riskReward: 0,
    hardBlock: false,
    positives: [],
    conflicts: [],
    explanation: "Karar motoru piyasa verilerini bekliyor.",
    safetyNote: "Henüz güvenlik değerlendirmesi yapılmadı.",
    liquidityMap: { sellLiquidity: 0, buyLiquidity: 0, equalHighTests: 0, equalLowTests: 0 },
    dataCompleteness: 0,
    calibration: {
      applied: false, adjustment: 0, samples: 0, winRate: 0,
      averageReturn: 0, confidence: 0, status: "ÖRNEKLEM BEKLENİYOR",
    },
  });
  const [showDecisionWhy, setShowDecisionWhy] = useState(false);
  const [socketState, setSocketState] = useState("BAĞLANIYOR");
  const [lastStreamAt, setLastStreamAt] = useState(0);
  const [streamSource, setStreamSource] = useState("REST");
  const [healthClock, setHealthClock] = useState(Date.now());
  const [timeframeRows, setTimeframeRows] = useState([
    { timeframe: "15m", label: "15dk", trend: "NÖTR", available: false },
    { timeframe: "1h", label: "1sa", trend: "NÖTR", available: false },
    { timeframe: "4h", label: "4sa", trend: "NÖTR", available: false },
    { timeframe: "1d", label: "1G", trend: "NÖTR", available: false },
  ]);
  const [leverage, setLeverage] = useState("5x");
  const [candles, setCandles] = useState([]);
  const [indicators, setIndicators] = useState({
    rsi: 50,
    ema9: 0,
    ema21: 0,
    sma200: 0,
    macd: 0,
    macdSignal: 0,
    macdHistogram: 0,
    volumeChange: 0,
    atr: 0,
    candleTrend: "NÖTR",
  });
  const [futuresData, setFuturesData] = useState({
    fundingRate: 0,
    openInterest: 0,
    openInterestChange: 0,
    takerBuyPercent: 50,
    btcTrend: "NÖTR",
    markPrice: 0,
    longPercent: 50,
    shortPercent: 50,
    available: {
      funding: false,
      openInterest: false,
      markPrice: false,
      accountRatio: false,
      openInterestChange: false,
      takerFlow: false,
    },
  });
  const [ai, setAI] = useState({
    score: 50,
    comment: "Analiz bekleniyor.",
    factors: [],
  });
  const [favorites, setFavorites] = useState(DEFAULT_FAVORITES);
  const [scanResults, setScanResults] = useState([]);
  const [multiScanning, setMultiScanning] = useState(false);
  const [history, setHistory] = useState([]);
  const [performanceWindow, setPerformanceWindow] = useState(20);
  const [balance, setBalance] = useState("1000");
  const [riskPercent, setRiskPercent] = useState("1");
  const [alarm, setAlarm] = useState(null);
  const [completedAlarms, setCompletedAlarms] = useState([]);
  const [marketRows, setMarketRows] = useState([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [marketSort, setMarketSort] = useState("CHANGE");
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketPanel, setMarketPanel] = useState("LIST");
  const [scannerRows, setScannerRows] = useState([]);
  const [scannerTimeframe, setScannerTimeframe] = useState("15m");
  const [scannerMinScore, setScannerMinScore] = useState(45);
  const [scannerDirection, setScannerDirection] = useState("TÜMÜ");
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerUpdatedAt, setScannerUpdatedAt] = useState("--:--:--");
  const [scannerError, setScannerError] = useState("");
  const [flowCoin, setFlowCoin] = useState("BTC");
  const [fundingRows, setFundingRows] = useState([]);
  const [largeTrades, setLargeTrades] = useState([]);
  const [flowRatio, setFlowRatio] = useState({ long: 0, short: 0, available: false });
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowUpdatedAt, setFlowUpdatedAt] = useState("--:--:--");
  const [liquidations, setLiquidations] = useState([]);
  const [liquidationPeriod, setLiquidationPeriod] = useState("1h");
  const [liquidationLoading, setLiquidationLoading] = useState(false);
  const [liquidationUpdatedAt, setLiquidationUpdatedAt] = useState("--:--:--");
  const [liquidationError, setLiquidationError] = useState("");
  const [whaleTrades, setWhaleTrades] = useState([]);
  const [whaleCoin, setWhaleCoin] = useState("TÜMÜ");
  const [whaleThreshold, setWhaleThreshold] = useState(100_000);
  const [whaleLoading, setWhaleLoading] = useState(false);
  const [whaleUpdatedAt, setWhaleUpdatedAt] = useState("--:--:--");
  const [whaleError, setWhaleError] = useState("");
  const [defaultExchange, setDefaultExchange] = useState("BINANCE");
  const [defaultMarketType, setDefaultMarketType] = useState("SPOT");
  const [defaultTimeframe, setDefaultTimeframe] = useState("5m");
  const [executionUrl, setExecutionUrl] = useState("");
  const [executionToken, setExecutionToken] = useState("");
  const [demoOrderUsdt, setDemoOrderUsdt] = useState("5");
  const [executionLeverage, setExecutionLeverage] = useState("1");
  const [executionHealth, setExecutionHealth] = useState({
    connected: false,
    armed: false,
    mode: "BİLİNMİYOR",
    isLive: false,
    demoOnly: true,
    maxLeverage: 3,
    auto: {
      running: false,
      envAllowed: false,
      scanning: false,
      reconciling: false,
      lastScanAt: null,
      nextScanAt: null,
      emergencyLocked: false,
      lockReason: null,
      dailyOrders: 0,
      dailyLossUsdt: 0,
      consecutiveLosses: 0,
      lastDecision: {}
    }
  });
  const [executionLoading, setExecutionLoading] = useState(false);
  const [lastDemoOrder, setLastDemoOrder] = useState(null);
  const [activeTab, setActiveTab] = useState("terminal");
  const alarmRef = useRef(null);
  const lastSignalRef = useRef("");
  const lastLiquidationTsRef = useRef(0);
  const lastWhaleTsRef = useRef(0);
  const oiSnapshotRef = useRef({});
  const lastDecisionNoticeRef = useRef("");
  const timeframeConflictRef = useRef(false);
  const activeMarketRef = useRef("");
  const scannerBookHistoryRef = useRef({});
  const scannerSignalStateRef = useRef({});
  activeMarketRef.current = `${exchange}:${marketType}:${coin}`;
  const calibrationProfile = useMemo(() => buildCalibrationProfile(history), [history]);

  const executionRequest = async (path, options = {}) => {
    const baseUrl = executionUrl.trim().replace(/\/$/, "");
    if (!/^https:\/\//i.test(baseUrl)) throw new Error("İşlem sunucusu HTTPS adresi geçersiz.");
    if (executionToken.trim().length < 24) throw new Error("Kontrol anahtarı en az 24 karakter olmalı.");
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${executionToken.trim()}` },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || json.errors?.join("\n") || "İşlem sunucusu isteği başarısız.");
    return json;
  };

  useEffect(() => {
    async function restoreSavedData() {
      try {
        const [savedFavorites, savedHistory, savedAlarm, savedCompleted, savedSettings, savedExecution] = await Promise.all([
          AsyncStorage.getItem("beyzatech_favorites"),
          AsyncStorage.getItem("beyzatech_signal_history"),
          AsyncStorage.getItem("beyzatech_active_alarm"),
          AsyncStorage.getItem("beyzatech_completed_alarms"),
          AsyncStorage.getItem("beyzatech_settings"),
          AsyncStorage.getItem("beyzatech_execution_settings"),
        ]);
        if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
        if (savedHistory) setHistory(JSON.parse(savedHistory));
        if (savedAlarm) setAlarm(JSON.parse(savedAlarm));
        if (savedCompleted) setCompletedAlarms(JSON.parse(savedCompleted));
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          if (settings.exchange) {
            setDefaultExchange(settings.exchange);
            setExchange(settings.exchange);
          }
          if (settings.marketType) {
            setDefaultMarketType(settings.marketType);
            setMarketType(settings.marketType);
          }
          if (settings.timeframe) {
            setDefaultTimeframe(settings.timeframe);
            setTimeframe(settings.timeframe);
          }
        }
        if (savedExecution) {
          const execution = JSON.parse(savedExecution);
          setExecutionUrl(String(execution.url || ""));
          setDemoOrderUsdt(String(execution.orderUsdt || "5"));
          setExecutionLeverage(String(execution.leverage || "1"));
          
          // --- YENİ EKLEME: Ayarlar yüklendikten sonra sunucu durumunu sorgula ---
          if (execution.url && executionToken) {
            try {
              const health = await executionRequest("/health");
              setExecutionHealth({ connected: true, ...health });
            } catch (healthError) {
              setExecutionHealth({ connected: false, armed: false, mode: "BİLİNMİYOR", isLive: false, demoOnly: true, maxLeverage: 3, auto: { running: false, envAllowed: false } });
            }
          }
          // ------------------------------------------------------------------
        }
      } catch (storageError) {
        console.log("Kayıtlar yüklenemedi:", storageError);
      }
    }
    restoreSavedData();
  }, []);

  useEffect(() => {
    alarmRef.current = alarm;
    if (alarm) {
      AsyncStorage.setItem("beyzatech_active_alarm", JSON.stringify(alarm));
    } else {
      AsyncStorage.removeItem("beyzatech_active_alarm");
    }
  }, [alarm]);

  const fetchMarketData = useCallback(async () => {
    const requestKey = `${exchange}:${marketType}:${coin}`;
    setLoading(true);
    setError("");
    setFuturesWarning("");
    setStatus("Veri alınıyor");

    try {
      const symbol = `${coin}USDT`;
      let depthUrl;
      let candlesUrl;
      let confirmationUrl;
      let flowUrl;
      let btcUrl;
      let futuresUrls = [];
      const confirmationTimeframe = CONFIRMATION_TIMEFRAMES[timeframe] || "1h";

      if (marketType === "FUTURES" && exchange === "BITGET") {
        depthUrl =
          `https://api.bitget.com/api/v2/mix/market/orderbook?symbol=${symbol}` +
          `&productType=USDT-FUTURES&limit=100`;
        candlesUrl =
          `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}` +
          `&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[timeframe]}&limit=220`;
        confirmationUrl =
          `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}` +
          `&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[confirmationTimeframe]}&limit=80`;
        flowUrl = `https://api.bitget.com/api/v3/market/fills?category=USDT-FUTURES&symbol=${symbol}&limit=100`;
        btcUrl = `https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[confirmationTimeframe]}&limit=80`;
        futuresUrls = [
          `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`,
          `https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${symbol}&productType=USDT-FUTURES`,
          `https://api.bitget.com/api/v2/mix/market/account-long-short?symbol=${symbol}&productType=USDT-FUTURES&period=5m`,
          `https://api.bitget.com/api/v2/mix/market/symbol-price?symbol=${symbol}&productType=USDT-FUTURES`,
        ];
      } else if (marketType === "FUTURES") {
        depthUrl = `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=100`;
        candlesUrl =
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=220`;
        confirmationUrl =
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${confirmationTimeframe}&limit=80`;
        flowUrl = `https://fapi.binance.com/fapi/v1/trades?symbol=${symbol}&limit=100`;
        btcUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${confirmationTimeframe}&limit=80`;
        futuresUrls = [
          `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
          `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
          `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
        ];
      } else if (exchange === "BITGET") {
        depthUrl =
          `https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${symbol}&type=step0&limit=100`;
        candlesUrl =
          `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}` +
          `&granularity=${BITGET_INTERVALS[timeframe]}&limit=220`;
        confirmationUrl =
          `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}` +
          `&granularity=${BITGET_INTERVALS[confirmationTimeframe]}&limit=80`;
      } else {
        depthUrl = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=100`;
        candlesUrl =
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=220`;
        confirmationUrl =
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${confirmationTimeframe}&limit=80`;
      }

      const [depthResponse, candlesResponse, confirmationResponse, flowResponse, btcResponse] = await Promise.all([
        fetch(depthUrl),
        fetch(candlesUrl),
        fetch(confirmationUrl).catch(() => null),
        flowUrl ? fetch(flowUrl).catch(() => null) : Promise.resolve(null),
        btcUrl ? fetch(btcUrl).catch(() => null) : Promise.resolve(null),
      ]);
      const [depthResult, candlesResult, confirmationResult, flowResult, btcResult] = await Promise.all([
        depthResponse.json(),
        candlesResponse.json(),
        confirmationResponse?.json().catch(() => null) || null,
        flowResponse?.json().catch(() => null) || null,
        btcResponse?.json().catch(() => null) || null,
      ]);
      const futuresSettled =
        marketType === "FUTURES"
          ? await Promise.allSettled(
              futuresUrls.map(async (url) => {
                const response = await fetch(url);
                const json = await response.json();
                if (
                  !response.ok ||
                  (exchange === "BITGET" && json?.code && json.code !== "00000")
                ) {
                  throw new Error(json?.msg || "Ek Futures verisi alınamadı.");
                }
                return json;
              })
            )
          : [];
      const futuresResults = futuresSettled.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      if (futuresSettled.some((result) => result.status === "rejected")) {
        setFuturesWarning(
          "Bazı ek Futures metrikleri bu coin için sunulmuyor; ana analiz çalışmaya devam ediyor."
        );
      }

      if (!depthResponse.ok || !candlesResponse.ok) {
        throw new Error(
          depthResult?.msg ||
            candlesResult?.msg ||
            depthResult?.message ||
            candlesResult?.message ||
            "Piyasa verisi alınamadı."
        );
      }

      if (
        exchange === "BITGET" &&
        (depthResult?.code !== "00000" || candlesResult?.code !== "00000")
      ) {
        throw new Error(depthResult?.msg || candlesResult?.msg || "Bitget API hatası.");
      }

      const orderBook = exchange === "BITGET" ? depthResult.data : depthResult;
      const rawCandles = exchange === "BITGET" ? candlesResult.data : candlesResult;

      if (!orderBook?.bids?.length || !orderBook?.asks?.length || !rawCandles?.length) {
        throw new Error("Bu coin için yeterli piyasa verisi bulunamadı.");
      }

      const normalizedCandles = rawCandles
        .map((item) => ({
          time: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
        }))
        .sort((a, b) => a.time - b.time);
      // Borsaların son satırı genellikle hâlâ oluşan mumdur. Sinyal ve giriş
      // teyitleri yalnızca kapanmış mumlardan hesaplanır.
      const closedCandles = normalizedCandles.length > 2
        ? normalizedCandles.slice(0, -1)
        : normalizedCandles;
      const rawConfirmation = exchange === "BITGET" ? confirmationResult?.data : confirmationResult;
      const normalizedConfirmation = Array.isArray(rawConfirmation)
        ? rawConfirmation
            .map((item) => ({
              time: Number(item[0]), open: Number(item[1]), high: Number(item[2]),
              low: Number(item[3]), close: Number(item[4]), volume: Number(item[5]),
            }))
            .filter((item) => Number.isFinite(item.close) && item.close > 0)
            .sort((a, b) => a.time - b.time)
        : [];
      const closedConfirmation = normalizedConfirmation.length > 2
        ? normalizedConfirmation.slice(0, -1)
        : normalizedConfirmation;
      const rawBtcCandles = exchange === "BITGET" ? btcResult?.data : btcResult;
      const normalizedBtc = Array.isArray(rawBtcCandles)
        ? rawBtcCandles.map((item) => ({
            time: Number(item[0]), open: Number(item[1]), high: Number(item[2]),
            low: Number(item[3]), close: Number(item[4]), volume: Number(item[5]),
          })).filter((item) => Number.isFinite(item.close) && item.close > 0)
            .sort((a, b) => a.time - b.time).slice(0, -1)
        : [];

      let bidVolume = 0;
      let askVolume = 0;
      let bidValue = 0;
      let askValue = 0;

      orderBook.bids.forEach(([itemPrice, itemAmount]) => {
        const p = Number(itemPrice);
        const amount = Number(itemAmount);
        bidVolume += amount;
        bidValue += p * amount;
      });
      orderBook.asks.forEach(([itemPrice, itemAmount]) => {
        const p = Number(itemPrice);
        const amount = Number(itemAmount);
        askVolume += amount;
        askValue += p * amount;
      });

      const current =
        (Number(orderBook.bids[0][0]) + Number(orderBook.asks[0][0])) / 2;
      const longAverage = bidValue / bidVolume;
      const shortAverage = askValue / askVolume;
      const longPercent = Math.round((bidVolume / (bidVolume + askVolume)) * 100);
      const nextIndicators = calculateIndicators(closedCandles);
      let nextFuturesData = {
        fundingRate: 0,
        openInterest: 0,
        openInterestChange: 0,
        takerBuyPercent: 50,
        btcTrend: normalizedBtc.length ? calculateIndicators(normalizedBtc).candleTrend : "NÖTR",
        markPrice: current,
        longPercent: longPercent,
        shortPercent: 100 - longPercent,
        available: {
          funding: false,
          openInterest: false,
          markPrice: false,
          accountRatio: false,
          openInterestChange: false,
          takerFlow: false,
        },
      };

      const flowRows = exchange === "BITGET"
        ? (Array.isArray(flowResult?.data) ? flowResult.data : flowResult?.data?.list || [])
        : (Array.isArray(flowResult) ? flowResult : []);
      let takerBuyValue = 0;
      let takerSellValue = 0;
      flowRows.forEach((trade) => {
        const value = Number(trade.price || trade.p || 0) * Number(trade.size || trade.qty || trade.q || 0);
        const isBuy = exchange === "BITGET"
          ? String(trade.side || "").toLowerCase() === "buy"
          : !Boolean(trade.isBuyerMaker);
        if (isBuy) takerBuyValue += value;
        else takerSellValue += value;
      });
      const takerTotal = takerBuyValue + takerSellValue;
      const takerBuyPercent = takerTotal > 0 ? (takerBuyValue / takerTotal) * 100 : 50;

      if (marketType === "FUTURES" && exchange === "BINANCE") {
        const [premium, openInterestResult, ratioResult] = futuresResults;
        const ratioItem = ratioResult?.[0] || {};
        nextFuturesData = {
          fundingRate: Number(premium?.lastFundingRate || 0),
          openInterest: Number(openInterestResult?.openInterest || 0),
          openInterestChange: 0,
          takerBuyPercent,
          btcTrend: normalizedBtc.length ? calculateIndicators(normalizedBtc).candleTrend : "NÖTR",
          markPrice: Number(premium?.markPrice || current),
          longPercent: Number(ratioItem?.longAccount || 0.5) * 100,
          shortPercent: Number(ratioItem?.shortAccount || 0.5) * 100,
          available: {
            funding: Boolean(premium?.lastFundingRate),
            openInterest: Boolean(openInterestResult?.openInterest),
            markPrice: Boolean(premium?.markPrice),
            accountRatio: Boolean(ratioItem?.longAccount),
            openInterestChange: false,
            takerFlow: takerTotal > 0,
          },
        };
      } else if (marketType === "FUTURES" && exchange === "BITGET") {
        const [fundingResult, openInterestResult, ratioResult, priceResult] = futuresResults;
        const fundingItem = Array.isArray(fundingResult?.data) ? fundingResult.data[0] : fundingResult?.data;
        const oiItem = openInterestResult?.data?.openInterestList?.[0] || openInterestResult?.data?.[0] || {};
        const ratioItem = ratioResult?.data?.[0] || {};
        const priceItem = Array.isArray(priceResult?.data) ? priceResult.data[0] : priceResult?.data;
        const bitgetLongRatio = Number(ratioItem?.longAccountRatio ?? ratioItem?.longAccount);
        const bitgetShortRatio = Number(ratioItem?.shortAccountRatio ?? ratioItem?.shortAccount);
        const bitgetRatioAvailable =
          Number.isFinite(bitgetLongRatio) &&
          Number.isFinite(bitgetShortRatio) &&
          bitgetLongRatio + bitgetShortRatio > 0;
        nextFuturesData = {
          fundingRate: Number(fundingItem?.fundingRate || 0),
          openInterest: Number(oiItem?.size || oiItem?.openInterest || 0),
          openInterestChange: 0,
          takerBuyPercent,
          btcTrend: normalizedBtc.length ? calculateIndicators(normalizedBtc).candleTrend : "NÖTR",
          markPrice: Number(priceItem?.markPrice || priceItem?.price || current),
          longPercent: bitgetRatioAvailable
            ? (bitgetLongRatio <= 1 ? bitgetLongRatio * 100 : bitgetLongRatio)
            : 0,
          shortPercent: bitgetRatioAvailable
            ? (bitgetShortRatio <= 1 ? bitgetShortRatio * 100 : bitgetShortRatio)
            : 0,
          available: {
            funding: Boolean(fundingItem?.fundingRate),
            openInterest: Boolean(oiItem?.size || oiItem?.openInterest),
            markPrice: Boolean(priceItem?.markPrice || priceItem?.price),
            accountRatio: bitgetRatioAvailable,
            openInterestChange: false,
            takerFlow: takerTotal > 0,
          },
        };
      }
      if (marketType === "FUTURES" && nextFuturesData.openInterest > 0) {
        const oiKey = `${exchange}-${symbol}`;
        const previousOi = Number(oiSnapshotRef.current[oiKey] || 0);
        if (previousOi > 0) {
          nextFuturesData.openInterestChange =
            ((nextFuturesData.openInterest - previousOi) / previousOi) * 100;
          nextFuturesData.available.openInterestChange = true;
        }
        oiSnapshotRef.current[oiKey] = nextFuturesData.openInterest;
      }
      const analysis = analyzeAI({
        longPercent,
        price: current,
        marketType,
        fundingRate: nextFuturesData.fundingRate,
        futuresLongPercent: nextFuturesData.available.accountRatio
          ? nextFuturesData.longPercent
          : null,
        ...nextIndicators,
      });
      const higherTrend = closedConfirmation.length
        ? calculateIndicators(closedConfirmation).candleTrend
        : "NÖTR";
      const plan = buildEntryPlan({
        candles: closedCandles,
        currentPrice: current,
        direction: analysis.direction,
        score: analysis.score,
        indicators: nextIndicators,
        higherTrend,
        orderBookLongPercent: longPercent,
        btcTrend: nextFuturesData.btcTrend,
        oiChangePercent: nextFuturesData.openInterestChange,
        oiChangeAvailable: nextFuturesData.available.openInterestChange,
        takerBuyPercent: nextFuturesData.takerBuyPercent,
        takerFlowAvailable: nextFuturesData.available.takerFlow,
        timeframe,
      });
      plan.higherTimeframe = confirmationTimeframe;
      const nextDecision = buildDecisionEngine({
        candles: closedCandles,
        currentPrice: current,
        analysis,
        plan,
        indicators: nextIndicators,
        higherTrend,
        timeframe,
        marketType,
        fundingRate: nextFuturesData.fundingRate,
        openInterestChange: nextFuturesData.openInterestChange,
        openInterestAvailable: nextFuturesData.available.openInterestChange,
        takerBuyPercent: nextFuturesData.takerBuyPercent,
        takerFlowAvailable: nextFuturesData.available.takerFlow,
        orderBookLongPercent: longPercent,
        calibrationProfile,
      });
      const entryPrice = plan.entry;
      const stopPrice = plan.stop;
      const firstTarget = plan.tp1;
      const secondTarget = plan.tp2;

      // Ignore a REST response that belongs to the previously selected coin.
      if (activeMarketRef.current !== requestKey) return;

      const activeAlarm = alarmRef.current;
      if (
        activeAlarm?.active &&
        activeAlarm.coin === coin &&
        ((activeAlarm.direction === "LONG" && current <= activeAlarm.target) ||
          (activeAlarm.direction === "SHORT" && current >= activeAlarm.target))
      ) {
        Alert.alert(
          "⚡ Fiyat alarmı",
          `${coin}/USDT ${current.toFixed(4)} seviyesine ulaştı.`
        );
        setCompletedAlarms((previous) => {
          const completed = {
            ...activeAlarm,
            id: `${Date.now()}-${coin}`,
            reachedPrice: current,
            completedAt: new Date().toLocaleString("tr-TR"),
          };
          const next = [completed, ...previous].slice(0, 30);
          AsyncStorage.setItem("beyzatech_completed_alarms", JSON.stringify(next));
          return next;
        });
        setAlarm(null);
      }

      setCandles(normalizedCandles);
      setIndicators(nextIndicators);
      setFuturesData(nextFuturesData);
      setPrice(current.toFixed(4));
      setRatio(`${longPercent} / ${100 - longPercent}`);
      setLongAvg(longAverage.toFixed(4));
      setShortAvg(shortAverage.toFixed(4));
      setSignal(analysis.direction);
      setEntry(entryPrice.toFixed(4));
      setStop(Math.max(0, stopPrice).toFixed(4));
      setTp1(Math.max(0, firstTarget).toFixed(4));
      setTp2(Math.max(0, secondTarget).toFixed(4));
      setEntryPlan(plan);
      setDecision(nextDecision);
      setLeverage(
        nextDecision.hardBlock || nextDecision.entryQuality < 55
          ? "İŞLEM YOK"
          : nextDecision.entryQuality >= 82 && nextDecision.directionConfidence >= 82
          ? "7x"
          : "5x"
      );
      setAI(analysis);
      const signalKey = `${coin}-${exchange}-${marketType}-${timeframe}-${analysis.direction}`;
      if (
        nextDecision.lifecycle === "GİRİŞ HAZIR" &&
        !nextDecision.hardBlock &&
        !timeframeConflictRef.current &&
        lastSignalRef.current !== signalKey
      ) {
        lastSignalRef.current = signalKey;
        setHistory((previous) => {
          const record = {
            id: `${Date.now()}-${coin}`,
            coin,
            exchange,
            marketType,
            timeframe,
            direction: analysis.direction,
            score: analysis.score,
            directionConfidence: nextDecision.directionConfidence,
            entryQuality: nextDecision.entryQuality,
            marketRegime: nextDecision.regime,
            setupType: nextDecision.setupType,
            lifecycle: nextDecision.lifecycle,
            price: current.toFixed(4),
            entry: entryPrice,
            stop: Math.max(0, stopPrice),
            tp1: Math.max(0, firstTarget),
            tp2: Math.max(0, secondTarget),
            support: plan.support,
            resistance: plan.resistance,
            entryStatus: plan.status,
            time: new Date().toLocaleTimeString("tr-TR"),
            createdAt: Date.now(),
            evaluationStatus: "PENDING",
            resultStage: "GİRİŞ AKTİF",
            entryActivatedAt: Date.now(),
            tp1HitAt: null,
          };
          const next = [record, ...previous].slice(0, 120);
          AsyncStorage.setItem("beyzatech_signal_history", JSON.stringify(next));
          return next;
        });
      }
      setLastUpdate(new Date().toLocaleTimeString("tr-TR"));
      setStatus("CANLI");
    } catch (requestError) {
      setStatus("BAĞLANTI HATASI");
      setError(requestError?.message || "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [coin, exchange, timeframe, marketType, calibrationProfile]);

  const fetchTimeframeMatrix = useCallback(async () => {
    const symbol = `${coin}USDT`;
    const frames = ["15m", "1h", "4h", "1d"];
    const labels = { "15m": "15dk", "1h": "1sa", "4h": "4sa", "1d": "1G" };
    const urls = frames.map((frame) => {
      if (exchange === "BITGET" && marketType === "FUTURES") {
        return `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[frame]}&limit=80`;
      }
      if (exchange === "BITGET") {
        return `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${BITGET_INTERVALS[frame]}&limit=80`;
      }
      if (marketType === "FUTURES") {
        return `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${frame}&limit=80`;
      }
      return `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${frame}&limit=80`;
    });
    const settled = await Promise.allSettled(urls.map(async (url) => {
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) throw new Error("Zaman verisi alınamadı");
      return exchange === "BITGET" ? json.data : json;
    }));
    setTimeframeRows(frames.map((frame, index) => {
      const result = settled[index];
      if (result.status !== "fulfilled" || !Array.isArray(result.value)) {
        return { timeframe: frame, label: labels[frame], trend: "NÖTR", available: false, indicators: null };
      }
      const normalized = result.value.map((item) => ({
        time: Number(item[0]), open: Number(item[1]), high: Number(item[2]),
        low: Number(item[3]), close: Number(item[4]), volume: Number(item[5]),
      })).filter((item) => Number.isFinite(item.close)).sort((a, b) => a.time - b.time);
      const frameIndicators = normalized.length >= 30
        ? calculateIndicators(normalized.slice(0, -1))
        : null;
      return {
        timeframe: frame, label: labels[frame], available: normalized.length >= 30,
        trend: frameIndicators?.candleTrend || "NÖTR",
        indicators: frameIndicators,
      };
    }));
  }, [coin, exchange, marketType]);

  useEffect(() => {
    fetchMarketData();
    const timer = setInterval(fetchMarketData, 15000);
    return () => clearInterval(timer);
  }, [fetchMarketData]);

  useEffect(() => {
    fetchTimeframeMatrix();
    const timer = setInterval(fetchTimeframeMatrix, 60000);
    return () => clearInterval(timer);
  }, [fetchTimeframeMatrix]);

  useEffect(() => {
    // Do not display the previous coin's price while the new subscription is
    // waiting for its first verified tick.
    setPrice("----");
    setLastStreamAt(0);
    setStreamSource("BEKLENİYOR");
    setSocketState("BAĞLANIYOR");
  }, [coin, exchange, marketType]);

  useEffect(() => createMarketSocket({
    exchange,
    marketType,
    coin,
    onTick: (tick) => {
      if (tick.subscriptionKey !== activeMarketRef.current) return;
      setPrice(Number(tick.price).toFixed(4));
      setLastStreamAt(tick.receivedAt);
      setStreamSource(tick.source);
    },
    onState: (next) => setSocketState(next.state),
  }), [coin, exchange, marketType]);

  useEffect(() => {
    const timer = setInterval(() => setHealthClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const noticeKey = `${coin}-${timeframe}-${decision.lifecycle}`;
    if (
      decision.lifecycle === "GİRİŞ HAZIR" &&
      !decision.hardBlock &&
      !timeframeConflictRef.current &&
      lastDecisionNoticeRef.current !== noticeKey
    ) {
      lastDecisionNoticeRef.current = noticeKey;
      Alert.alert(
        "⚡ Giriş teyidi oluştu",
        `${coin}/USDT ${decision.setupType} • Yön %${decision.directionConfidence} • Giriş %${decision.entryQuality}`
      );
    }
  }, [coin, timeframe, decision.lifecycle, decision.setupType, decision.directionConfidence, decision.entryQuality]);

  useEffect(() => {
    timeframeConflictRef.current = buildTimeframeMatrix(timeframeRows, signal).hardConflict;
  }, [timeframeRows, signal]);

  useEffect(() => {
    let cancelled = false;

    async function evaluatePendingSignals() {
      const now = Date.now();
      const candidates = history
        .filter(
          (item) =>
            item.evaluationStatus === "PENDING" &&
            Number(item.createdAt) > 0
        )
        .slice(0, 10);
      if (!candidates.length) return;

      const results = await Promise.allSettled(
        candidates.map(async (item) => {
          const symbol = `${item.coin}USDT`;
          let url;
          if (item.exchange === "BITGET" && item.marketType === "FUTURES") {
            url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[item.timeframe] || "5m"}&limit=100`;
          } else if (item.exchange === "BITGET") {
            url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${BITGET_INTERVALS[item.timeframe] || "5min"}&limit=100`;
          } else if (item.marketType === "FUTURES") {
            url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${item.timeframe}&limit=100`;
          } else {
            url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${item.timeframe}&limit=100`;
          }

          const response = await fetch(url);
          const json = await response.json();
          if (!response.ok) throw new Error(`${item.coin} değerlendirme fiyatı alınamadı.`);
          const rows = item.exchange === "BITGET" ? json?.data : json;
          const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
            time: Number(row[0]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
          })).filter((row) => row.time >= Number(item.createdAt)).sort((a, b) => a.time - b.time);
          if (!normalized.length) throw new Error(`${item.coin} değerlendirme mumu bulunamadı.`);
          const evaluatedPrice = Number(normalized.at(-1).close);
          if (!Number.isFinite(evaluatedPrice) || evaluatedPrice <= 0) {
            throw new Error(`${item.coin} değerlendirme fiyatı geçersiz.`);
          }
          const entryPrice = Number(item.entry || item.price);
          const stopLevel = Number(item.stop);
          const tp1Level = Number(item.tp1);
          const tp2Level = Number(item.tp2);
          const favorableMoves = normalized.map((candle) => item.direction === "LONG"
            ? ((candle.high - entryPrice) / entryPrice) * 100
            : ((entryPrice - candle.low) / entryPrice) * 100);
          const adverseMoves = normalized.map((candle) => item.direction === "LONG"
            ? ((entryPrice - candle.low) / entryPrice) * 100
            : ((candle.high - entryPrice) / entryPrice) * 100);
          const maxFavorableExcursion = Math.max(0, ...favorableMoves);
          const maxAdverseExcursion = Math.max(0, ...adverseMoves);
          let hit = null;
          let tp1HitAt = Number(item.tp1HitAt) || 0;
          const evaluationCandles = tp1HitAt
            ? normalized.filter((candle) => candle.time >= tp1HitAt)
            : normalized;
          for (const candle of evaluationCandles) {
            const stopHit = item.direction === "LONG" ? candle.low <= stopLevel : candle.high >= stopLevel;
            const tp2Hit = item.direction === "LONG" ? candle.high >= tp2Level : candle.low <= tp2Level;
            const tp1Hit = item.direction === "LONG" ? candle.high >= tp1Level : candle.low <= tp1Level;
            // Aynı mumda iki seviye görünürse muhafazakâr olarak stop önce kabul edilir.
            if (stopHit) { hit = { label: "STOP", price: stopLevel }; break; }
            if (tp2Hit) {
              if (!tp1HitAt) tp1HitAt = candle.time || Date.now();
              hit = { label: "TP2", price: tp2Level };
              break;
            }
            if (tp1Hit && !tp1HitAt) {
              tp1HitAt = candle.time || Date.now();
              continue;
            }
          }
          const expired = now - Number(item.createdAt) >=
            (SIGNAL_EVALUATION_MS[item.timeframe] || SIGNAL_EVALUATION_MS["5m"]);
          if (!hit && !expired) {
            return {
              id: item.id,
              pending: true,
              tp1HitAt: tp1HitAt || null,
              resultStage: tp1HitAt ? "TP1 GÖRÜLDÜ • TP2 İZLENİYOR" : "GİRİŞ AKTİF",
              maxFavorableExcursion,
              maxAdverseExcursion,
            };
          }
          const exitPrice = hit?.price || evaluatedPrice;
          const marketReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
          const remainingReturn = item.direction === "SHORT" ? -marketReturn : marketReturn;
          const tp1MarketReturn = ((tp1Level - entryPrice) / entryPrice) * 100;
          const tp1DirectionReturn = item.direction === "SHORT" ? -tp1MarketReturn : tp1MarketReturn;
          // TP1 sonrası pozisyonun yarısının realize edildiği muhafazakâr kâğıt işlem modeli.
          const grossReturn = tp1HitAt
            ? tp1DirectionReturn * 0.5 + remainingReturn * 0.5
            : remainingReturn;
          const signalReturn = grossReturn - PAPER_TRADING_COST_PERCENT;
          const evaluationStatus =
            signalReturn > 0.05 ? "WIN" : signalReturn < -0.05 ? "LOSS" : "NEUTRAL";
          return {
            id: item.id,
            evaluatedPrice: exitPrice,
            exitReason: hit?.label === "STOP" && tp1HitAt
              ? "TP1 SONRASI STOP"
              : hit?.label || (tp1HitAt ? "TP1 SONRASI SÜRE SONU" : "SÜRE SONU"),
            grossReturn,
            estimatedCost: PAPER_TRADING_COST_PERCENT,
            signalReturn,
            evaluationStatus,
            evaluatedAt: Date.now(),
            tp1HitAt: tp1HitAt || null,
            resultStage: hit?.label === "TP2"
              ? "TP2 TAMAMLANDI"
              : hit?.label === "STOP" && tp1HitAt
              ? "TP1 SONRASI STOP"
              : hit?.label === "STOP"
              ? "STOP"
              : tp1HitAt
              ? "TP1 + SÜRE SONU"
              : "SÜRE SONU",
            maxFavorableExcursion,
            maxAdverseExcursion,
          };
        })
      );

      if (cancelled) return;
      const updates = new Map(
        results
          .filter((item) => item.status === "fulfilled" && item.value?.id)
          .map((item) => [item.value.id, item.value])
      );
      if (!updates.size) return;
      setHistory((previous) => {
        const next = previous.map((item) =>
          updates.has(item.id)
            ? (() => {
                const update = { ...updates.get(item.id) };
                delete update.pending;
                return { ...item, ...update };
              })()
            : item
        );
        AsyncStorage.setItem("beyzatech_signal_history", JSON.stringify(next));
        return next;
      });
    }

    evaluatePendingSignals();
    const timer = setInterval(evaluatePendingSignals, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [history]);

  const fetchMarkets = useCallback(async () => {
    setMarketsLoading(true);
    try {
      let url;
      if (exchange === "BITGET" && marketType === "FUTURES") {
        url = "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES";
      } else if (exchange === "BITGET") {
        url = "https://api.bitget.com/api/v2/spot/market/tickers";
      } else if (marketType === "FUTURES") {
        url = "https://fapi.binance.com/fapi/v1/ticker/24hr";
      } else {
        url = "https://api.binance.com/api/v3/ticker/24hr";
      }

      const response = await fetch(url);
      const result = await response.json();
      if (!response.ok) throw new Error("Piyasa listesi alınamadı.");
      const raw = exchange === "BITGET" ? result?.data || [] : result;
      const wanted = new Set(MARKET_COINS.map((item) => `${item}USDT`));
      const rows = raw
        .filter((item) => wanted.has(item.symbol))
        .map((item) => {
          const isBitget = exchange === "BITGET";
          const lastPrice = Number(isBitget ? item.lastPr : item.lastPrice);
          const changePercent = Number(
            isBitget ? Number(item.change24h || 0) * 100 : item.priceChangePercent
          );
          const changeValue = isBitget
            ? lastPrice * (Number(item.change24h || 0) / (1 + Number(item.change24h || 0)))
            : Number(item.priceChange || 0);
          return {
            coin: item.symbol.replace(/USDT$/, ""),
            symbol: item.symbol,
            price: lastPrice,
            changePercent,
            changeValue,
            volume: Number(isBitget ? item.usdtVolume || item.quoteVolume : item.quoteVolume),
          };
        });
      setMarketRows(rows);
    } catch (marketError) {
      setError(marketError?.message || "Piyasa listesi alınamadı.");
    } finally {
      setMarketsLoading(false);
    }
  }, [exchange, marketType]);

  useEffect(() => {
    if (activeTab !== "markets") return undefined;
    fetchMarkets();
    const timer = setInterval(fetchMarkets, 30000);
    return () => clearInterval(timer);
  }, [activeTab, fetchMarkets]);

  const fetchSignalScanner = useCallback(async () => {
    setScannerLoading(true);
    setScannerError("");
    try {
      const tickerResponse = await fetch(
        "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES"
      );
      const tickerJson = await tickerResponse.json();
      if (!tickerResponse.ok || tickerJson?.code !== "00000") {
        throw new Error(tickerJson?.msg || "Bitget Futures listesi alınamadı.");
      }

      const liquidTickers = (tickerJson?.data || [])
        .filter((item) => {
          const symbol = String(item.symbol || "");
          const volume = Number(item.usdtVolume || 0);
          return (
            symbol.endsWith("USDT") &&
            Number(item.lastPr || 0) > 0 &&
            volume >= SCANNER_MIN_VOLUME_USD
          );
        })
        .sort(
          (first, second) =>
            Number(second.usdtVolume || 0) - Number(first.usdtVolume || 0)
        )
        .slice(0, SCANNER_COIN_LIMIT);

      const results = [];
      const higherTimeframe = CONFIRMATION_TIMEFRAMES[scannerTimeframe] || "1h";
      for (let offset = 0; offset < liquidTickers.length; offset += 6) {
        const batch = liquidTickers.slice(offset, offset + 6);
        const settled = await Promise.allSettled(
          batch.map(async (ticker) => {
            const [candleResponse, higherResponse, bookResponse] = await Promise.all([
              fetch(
                `https://api.bitget.com/api/v2/mix/market/candles?symbol=${ticker.symbol}` +
                  `&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[scannerTimeframe]}&limit=100`
              ),
              fetch(
                `https://api.bitget.com/api/v2/mix/market/candles?symbol=${ticker.symbol}` +
                  `&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[higherTimeframe]}&limit=100`
              ),
              fetch(
                `https://api.bitget.com/api/v2/mix/market/orderbook?symbol=${ticker.symbol}` +
                  `&productType=USDT-FUTURES&limit=50`
              ),
            ]);
            const [candleJson, higherJson, bookJson] = await Promise.all([
              candleResponse.json(), higherResponse.json(), bookResponse.json(),
            ]);
            if (
              !candleResponse.ok ||
              candleJson?.code !== "00000" ||
              !Array.isArray(candleJson?.data)
            ) {
              throw new Error(candleJson?.msg || `${ticker.symbol} mum verisi alınamadı.`);
            }
            const bids = Array.isArray(bookJson?.data?.bids) ? bookJson.data.bids : [];
            const asks = Array.isArray(bookJson?.data?.asks) ? bookJson.data.asks : [];
            const bidVolume = bids.reduce((sum, item) => sum + Number(item[1] || 0), 0);
            const askVolume = asks.reduce((sum, item) => sum + Number(item[1] || 0), 0);
            const snapshot = bidVolume + askVolume > 0 ? bidVolume / (bidVolume + askVolume) * 100 : 50;
            const previousSamples = scannerBookHistoryRef.current[ticker.symbol] || [];
            const samples = [...previousSamples, snapshot].slice(-5);
            scannerBookHistoryRef.current[ticker.symbol] = samples;
            const averagedBook = samples.reduce((sum, value) => sum + value, 0) / samples.length;
            return buildScannerSignal(ticker, candleJson.data, {
              timeframe: scannerTimeframe,
              higherTimeframe,
              rawHigherCandles: higherResponse.ok && higherJson?.code === "00000" ? higherJson.data : [],
              orderBookLongPercent: averagedBook,
              orderBookSampleCount: samples.length,
            });
          })
        );
        settled.forEach((item) => {
          if (item.status === "fulfilled" && item.value) results.push(item.value);
        });
      }

      if (!results.length) {
        throw new Error("Tarama için yeterli mum verisi bulunamadı.");
      }

      const now = Date.now();
      const nextSignalState = { ...scannerSignalStateRef.current };
      const agedResults = results.map((item) => {
        const stateKey = `${scannerTimeframe}:${item.symbol}`;
        const previous = nextSignalState[stateKey];
        const firstSeenAt = previous?.direction === item.direction ? previous.firstSeenAt : now;
        const expiresAt = firstSeenAt + (SCANNER_SIGNAL_TTL_MS[scannerTimeframe] || 60 * 60_000);
        const expired = item.direction !== "NÖTR" && now >= expiresAt;
        nextSignalState[stateKey] = { direction: item.direction, firstSeenAt };
        const qualityTier = item.lifecycle === "GİRİŞ HAZIR"
          ? "GİRİŞ HAZIR"
          : item.score >= 70
          ? "GÜÇLÜ ADAY"
          : item.score >= 55
          ? "İZLEME"
          : "ZAYIF ADAY";
        return {
          ...item,
          firstSeenAt,
          expiresAt,
          ageMinutes: Math.max(0, Math.floor((now - firstSeenAt) / 60_000)),
          expired,
          qualityTier: expired ? "SÜRESİ DOLDU" : qualityTier,
          lifecycle: expired ? "SÜRESİ DOLDU" : item.lifecycle,
          score: expired ? Math.min(item.score, 49) : item.score,
        };
      });
      scannerSignalStateRef.current = nextSignalState;

      setScannerRows(
        agedResults.sort((first, second) => {
          if (first.expired !== second.expired) return first.expired ? 1 : -1;
          if (first.lifecycle === "GİRİŞ HAZIR" && second.lifecycle !== "GİRİŞ HAZIR") return -1;
          if (second.lifecycle === "GİRİŞ HAZIR" && first.lifecycle !== "GİRİŞ HAZIR") return 1;
          if (first.direction === "NÖTR" && second.direction !== "NÖTR") return 1;
          if (second.direction === "NÖTR" && first.direction !== "NÖTR") return -1;
          return second.score - first.score;
        })
      );
      setScannerUpdatedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (scannerFetchError) {
      setScannerError(scannerFetchError?.message || "Sinyal taraması tamamlanamadı.");
    } finally {
      setScannerLoading(false);
    }
  }, [scannerTimeframe]);

  useEffect(() => {
    if (activeTab !== "markets" || marketPanel !== "SIGNAL") return undefined;
    fetchSignalScanner();
    const timer = setInterval(fetchSignalScanner, 60000);
    return () => clearInterval(timer);
  }, [activeTab, marketPanel, fetchSignalScanner]);

  const fetchFlowData = useCallback(async () => {
    setFlowLoading(true);
    try {
      const symbol = `${flowCoin}USDT`;
      let fundingData = [];
      let tradesData = [];
      let ratioData = null;

      if (exchange === "BITGET") {
        const fundingRequests = MARKET_COINS.slice(0, 6).map(async (item) => {
          const response = await fetch(
            `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${item}USDT&productType=USDT-FUTURES`
          );
          const json = await response.json();
          if (!response.ok || json?.code !== "00000") return null;
          const row = Array.isArray(json.data) ? json.data[0] : json.data;
          return {
            coin: item,
            rate: Number(row?.fundingRate || 0),
            nextFundingTime: Number(row?.nextUpdate || row?.nextFundingTime || 0),
          };
        });
        const [fundingSettled, tradesResponse, ratioResponse] = await Promise.all([
          Promise.allSettled(fundingRequests),
          fetch(
            `https://api.bitget.com/api/v2/mix/market/fills?symbol=${symbol}&productType=USDT-FUTURES&limit=100`
          ),
          fetch(
            `https://api.bitget.com/api/v2/mix/market/account-long-short?symbol=${symbol}&productType=USDT-FUTURES&period=5m`
          ),
        ]);
        fundingData = fundingSettled
          .filter((item) => item.status === "fulfilled" && item.value)
          .map((item) => item.value);
        const tradesJson = await tradesResponse.json();
        const ratioJson = await ratioResponse.json();
        tradesData = tradesJson?.data || [];
        ratioData = ratioJson?.data?.[0] || null;
      } else {
        const [fundingResponse, tradesResponse, ratioResponse] = await Promise.all([
          fetch("https://fapi.binance.com/fapi/v1/premiumIndex"),
          fetch(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&limit=100`),
          fetch(
            `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`
          ),
        ]);
        const [fundingJson, tradesJson, ratioJson] = await Promise.all([
          fundingResponse.json(),
          tradesResponse.json(),
          ratioResponse.json(),
        ]);
        const wanted = new Set(MARKET_COINS.map((item) => `${item}USDT`));
        fundingData = (Array.isArray(fundingJson) ? fundingJson : [])
          .filter((item) => wanted.has(item.symbol))
          .map((item) => ({
            coin: item.symbol.replace(/USDT$/, ""),
            rate: Number(item.lastFundingRate || 0),
            nextFundingTime: Number(item.nextFundingTime || 0),
          }));
        tradesData = Array.isArray(tradesJson) ? tradesJson : [];
        ratioData = ratioJson?.[0] || null;
      }

      const normalizedTrades = tradesData
        .map((item, index) => {
          const priceValue = Number(item.price || item.p || 0);
          const quantity = Number(item.size || item.q || 0);
          const side = exchange === "BITGET"
            ? String(item.side || "").toUpperCase()
            : item.m
            ? "SELL"
            : "BUY";
          return {
            id: String(item.tradeId || item.a || `${Date.now()}-${index}`),
            price: priceValue,
            quantity,
            value: priceValue * quantity,
            side,
            time: Number(item.ts || item.T || Date.now()),
          };
        })
        .filter((item) => item.value > 0)
        .sort((first, second) => second.value - first.value)
        .slice(0, 12);

      const longRaw = ratioData?.longAccountRatio ?? ratioData?.longAccount;
      const shortRaw = ratioData?.shortAccountRatio ?? ratioData?.shortAccount;
      const longValue = Number(longRaw);
      const shortValue = Number(shortRaw);
      const ratioAvailable =
        longRaw !== undefined &&
        longRaw !== null &&
        shortRaw !== undefined &&
        shortRaw !== null &&
        Number.isFinite(longValue) &&
        Number.isFinite(shortValue) &&
        longValue + shortValue > 0;
      setFundingRows(fundingData.sort((first, second) => Math.abs(second.rate) - Math.abs(first.rate)));
      setLargeTrades(normalizedTrades);
      setFlowRatio({
        long: ratioAvailable ? (longValue <= 1 ? longValue * 100 : longValue) : 0,
        short: ratioAvailable ? (shortValue <= 1 ? shortValue * 100 : shortValue) : 0,
        available: ratioAvailable,
      });
      setFlowUpdatedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (flowError) {
      setError(flowError?.message || "Piyasa akışı alınamadı.");
    } finally {
      setFlowLoading(false);
    }
  }, [exchange, flowCoin]);

  useEffect(() => {
    if (activeTab !== "markets" || marketPanel !== "FLOW") return undefined;
    fetchFlowData();
    const timer = setInterval(fetchFlowData, 20000);
    return () => clearInterval(timer);
  }, [activeTab, marketPanel, fetchFlowData]);

  const fetchLiquidations = useCallback(async () => {
    setLiquidationLoading(true);
    setLiquidationError("");
    try {
      const response = await fetch(
        "https://api.bitget.com/api/v3/market/liquidations?category=USDT-FUTURES&limit=100"
      );
      const json = await response.json();
      if (!response.ok || json?.code !== "00000") {
        throw new Error(json?.msg || "Likidasyon verisi alınamadı.");
      }

      const rows = (json?.data?.list || [])
        .map((item, index) => {
          const priceValue = Number(item.price || 0);
          const amountValue = Number(item.amount || 0);
          return {
            id: `${item.symbol}-${item.ts}-${index}`,
            symbol: String(item.symbol || ""),
            coin: String(item.symbol || "").replace(/USDT$/, ""),
            side: String(item.side || "").toLowerCase(),
            price: priceValue,
            amount: amountValue,
            value: priceValue * amountValue,
            time: Number(item.ts || 0),
          };
        })
        .filter((item) => item.symbol && item.time > 0 && item.value > 0)
        .sort((first, second) => second.time - first.time);

      const newestTimestamp = rows[0]?.time || 0;
      if (lastLiquidationTsRef.current > 0) {
        const largestNewLiquidation = rows
          .filter(
            (item) =>
              item.time > lastLiquidationTsRef.current &&
              item.value >= LARGE_LIQUIDATION_ALERT_USD
          )
          .sort((first, second) => second.value - first.value)[0];
        if (largestNewLiquidation) {
          Alert.alert(
            "⚠️ Ani likidasyon",
            `${largestNewLiquidation.coin}/USDT • ${
              largestNewLiquidation.side === "buy" ? "LONG" : "SHORT"
            } tasfiye • yaklaşık ${formatCompact(largestNewLiquidation.value)}`
          );
        }
      }
      lastLiquidationTsRef.current = Math.max(lastLiquidationTsRef.current, newestTimestamp);
      setLiquidations(rows);
      setLiquidationUpdatedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (liquidationFetchError) {
      setLiquidationError(
        liquidationFetchError?.message || "Likidasyon verisi alınamadı."
      );
    } finally {
      setLiquidationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "markets" || marketPanel !== "LIQUIDATION") return undefined;
    fetchLiquidations();
    const timer = setInterval(fetchLiquidations, 20000);
    return () => clearInterval(timer);
  }, [activeTab, marketPanel, fetchLiquidations]);

  const fetchWhaleTrades = useCallback(async () => {
    setWhaleLoading(true);
    setWhaleError("");
    try {
      const requests = WHALE_COINS.map(async (selectedCoin) => {
        const response = await fetch(
          `https://api.bitget.com/api/v3/market/fills?category=USDT-FUTURES&symbol=${selectedCoin}USDT&limit=100`
        );
        const json = await response.json();
        if (!response.ok || json?.code !== "00000") return [];
        return (json?.data || []).map((item, index) => {
          const priceValue = Number(item.price || 0);
          const sizeValue = Number(item.size || 0);
          return {
            id: `${selectedCoin}-${item.execId || item.ts}-${index}`,
            coin: selectedCoin,
            symbol: `${selectedCoin}USDT`,
            side: String(item.side || "").toUpperCase(),
            price: priceValue,
            size: sizeValue,
            value: priceValue * sizeValue,
            time: Number(item.ts || 0),
            isRPI: item.isRPI === "yes",
          };
        });
      });
      const settled = await Promise.allSettled(requests);
      const rows = settled
        .filter((item) => item.status === "fulfilled")
        .flatMap((item) => item.value)
        .filter((item) => item.time > 0 && item.value >= 50_000)
        .sort((first, second) => second.time - first.time);

      const newestTimestamp = rows[0]?.time || 0;
      if (lastWhaleTsRef.current > 0) {
        const largestNewTrade = rows
          .filter(
            (item) =>
              item.time > lastWhaleTsRef.current &&
              item.value >= whaleThreshold
          )
          .sort((first, second) => second.value - first.value)[0];
        if (largestNewTrade) {
          Alert.alert(
            "🐋 Balina işlemi",
            `${largestNewTrade.coin}/USDT • ${
              largestNewTrade.side === "BUY" ? "ALIM" : "SATIM"
            } • ${formatCompact(largestNewTrade.value)}`
          );
        }
      }
      lastWhaleTsRef.current = Math.max(lastWhaleTsRef.current, newestTimestamp);
      setWhaleTrades(rows);
      setWhaleUpdatedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (whaleFetchError) {
      setWhaleError(whaleFetchError?.message || "Balina işlem akışı alınamadı.");
    } finally {
      setWhaleLoading(false);
    }
  }, [whaleThreshold]);

  useEffect(() => {
    if (activeTab !== "markets" || marketPanel !== "WHALE") return undefined;
    fetchWhaleTrades();
    const timer = setInterval(fetchWhaleTrades, 15000);
    return () => clearInterval(timer);
  }, [activeTab, marketPanel, fetchWhaleTrades]);

  const saveSettings = async (nextExchange, nextMarketType, nextTimeframe) => {
    const settings = {
      exchange: nextExchange,
      marketType: nextMarketType,
      timeframe: nextTimeframe,
    };
    setDefaultExchange(nextExchange);
    setDefaultMarketType(nextMarketType);
    setDefaultTimeframe(nextTimeframe);
    setExchange(nextExchange);
    setMarketType(nextMarketType);
    setTimeframe(nextTimeframe);
    await AsyncStorage.setItem("beyzatech_settings", JSON.stringify(settings));
  };

  const openMarketCoin = (selectedCoin) => {
    setCoinInput(selectedCoin);
    setCoin(selectedCoin);
    setActiveTab("terminal");
  };

  const openScannerSignal = (item) => {
    setCoinInput(item.coin);
    setCoin(item.coin);
    setExchange("BITGET");
    setMarketType("FUTURES");
    setTimeframe(scannerTimeframe);
    setActiveTab("terminal");
  };

  const handleScan = () => {
    const normalized = coinInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) {
      setError("Lütfen geçerli bir coin adı girin.");
      return;
    }
    setCoinInput(normalized);
    normalized === coin ? fetchMarketData() : setCoin(normalized);
  };

  const addFavorite = async () => {
    if (favorites.includes(coin)) return;
    const next = [...favorites, coin].slice(0, 8);
    setFavorites(next);
    await AsyncStorage.setItem("beyzatech_favorites", JSON.stringify(next));
  };

  const removeFavorite = async (favorite) => {
    const next = favorites.filter((item) => item !== favorite);
    setFavorites(next);
    setScanResults((previous) => previous.filter((item) => item.coin !== favorite));
    await AsyncStorage.setItem("beyzatech_favorites", JSON.stringify(next));
  };

  const toggleFavorite = async (favorite) => {
    const next = favorites.includes(favorite)
      ? favorites.filter((item) => item !== favorite)
      : [...favorites, favorite].slice(0, 12);
    setFavorites(next);
    await AsyncStorage.setItem("beyzatech_favorites", JSON.stringify(next));
  };

  const scanFavoriteCoin = async (favorite) => {
    const symbol = `${favorite}USDT`;
    const depthUrl =
      marketType === "FUTURES" && exchange === "BITGET"
        ? `https://api.bitget.com/api/v2/mix/market/orderbook?symbol=${symbol}&productType=USDT-FUTURES&limit=50`
        : marketType === "FUTURES"
        ? `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=50`
        : exchange === "BITGET"
        ? `https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${symbol}&type=step0&limit=50`
        : `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=50`;
    const candlesUrl =
      marketType === "FUTURES" && exchange === "BITGET"
        ? `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${BITGET_FUTURES_INTERVALS[timeframe]}&limit=60`
        : marketType === "FUTURES"
        ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=60`
        : exchange === "BITGET"
        ? `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${BITGET_INTERVALS[timeframe]}&limit=60`
        : `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=60`;
    const [depthResponse, candleResponse] = await Promise.all([fetch(depthUrl), fetch(candlesUrl)]);
    const [depthJson, candleJson] = await Promise.all([depthResponse.json(), candleResponse.json()]);
    if (!depthResponse.ok || !candleResponse.ok) throw new Error(`${favorite} verisi alınamadı.`);
    const book = exchange === "BITGET" ? depthJson.data : depthJson;
    const raw = exchange === "BITGET" ? candleJson.data : candleJson;
    const normalized = raw
      .map((item) => ({
        time: Number(item[0]), open: Number(item[1]), high: Number(item[2]),
        low: Number(item[3]), close: Number(item[4]), volume: Number(item[5]),
      }))
      .sort((a, b) => a.time - b.time);
    const bidVolume = book.bids.reduce((sum, item) => sum + Number(item[1]), 0);
    const askVolume = book.asks.reduce((sum, item) => sum + Number(item[1]), 0);
    const longPercent = Math.round((bidVolume / (bidVolume + askVolume)) * 100);
    const nextIndicators = calculateIndicators(normalized);
    const analysis = analyzeAI({ longPercent, ...nextIndicators });
    const current = (Number(book.bids[0][0]) + Number(book.asks[0][0])) / 2;
    return { coin: favorite, price: current.toFixed(4), direction: analysis.direction, score: analysis.score };
  };

  const scanAllFavorites = async () => {
    if (!favorites.length) return;
    setMultiScanning(true);
    try {
      const results = await Promise.allSettled(favorites.map(scanFavoriteCoin));
      setScanResults(
        results
          .filter((item) => item.status === "fulfilled")
          .map((item) => item.value)
          .sort((a, b) => b.score - a.score)
      );
    } finally {
      setMultiScanning(false);
    }
  };

  const armAlarm = () => {
    const nextAlarm = {
      id: `${Date.now()}-${coin}`,
      active: true,
      coin,
      target: Number(entry),
      direction: signal,
      timeframe,
      exchange,
      marketType,
      createdAt: new Date().toLocaleString("tr-TR"),
    };
    setAlarm(nextAlarm);
    Alert.alert("Alarm kuruldu", `${coin}/USDT için ${entry} seviyesi izleniyor.`);
  };

  const timeframeMatrix = buildTimeframeMatrix(timeframeRows, signal);
  const marketStructure = analyzeMarketStructure({
    candles,
    currentPrice: Number(price),
    support: Number(entryPlan.support),
    resistance: Number(entryPlan.resistance),
    atr: indicators.atr,
  });
  const streamAgeSeconds = lastStreamAt ? Math.max(0, Math.round((healthClock - lastStreamAt) / 1000)) : 999;
  const dataHealth = {
    socketState,
    ageSeconds: streamAgeSeconds,
    source: streamAgeSeconds <= 10 ? streamSource : "REST YEDEK",
    blocked: streamAgeSeconds > 45 && status !== "CANLI",
    score: Math.max(0, Math.min(100,
      (socketState === "CANLI" ? 55 : 20) +
      (streamAgeSeconds <= 5 ? 30 : streamAgeSeconds <= 15 ? 18 : streamAgeSeconds <= 45 ? 8 : 0) +
      (status === "CANLI" ? 15 : 0)
    )),
  };
  const walkForward = buildWalkForwardReport(history);
  const regimePerformance = buildRegimePerformance(history);
  const lossStreak = getLossStreak(history);
  const todayLabel = new Date().toLocaleDateString("tr-TR");
  const dailyLossPercent = Math.abs(history
    .filter((item) => item.evaluationStatus === "LOSS" && new Date(item.createdAt).toLocaleDateString("tr-TR") === todayLabel)
    .reduce((sum, item) => sum + Math.min(0, Number(item.signalReturn || 0)), 0));
  const dynamicRisk = calculateDynamicRisk({
    balance: Number(balance) || 0,
    baseRiskPercent: Number(riskPercent) || 0,
    entry: Number(entry),
    stop: Number(stop),
    entryQuality: decision.entryQuality,
    directionConfidence: decision.directionConfidence,
    volatilityBlocked: entryPlan.volatilityBlock || marketStructure.trapRisk || dataHealth.blocked,
    consecutiveLosses: lossStreak,
    dailyLossPercent,
    timeframeConflict: timeframeMatrix.hardConflict,
    timeframeRiskMultiplier: timeframeMatrix.riskMultiplier,
  });
  const exportSignalJournal = async () => {
    const header = "coin,timeframe,direction,regime,setup,directionScore,entryScore,result,netReturn,mfe,mae,exitReason";
    const rows = history.map((item) => [
      item.coin, item.timeframe, item.direction, item.marketRegime || "", item.setupType || "",
      item.directionConfidence ?? item.score ?? "", item.entryQuality ?? "", item.evaluationStatus || "",
      item.signalReturn ?? "", item.maxFavorableExcursion ?? "", item.maxAdverseExcursion ?? "", item.exitReason || "",
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    await Share.share({ title: "Beyzatech Terminal Sinyal Günlüğü", message: [header, ...rows].join("\n") });
  };

  const riskAmount = (Number(balance) || 0) * ((Number(riskPercent) || 0) / 100);
  const stopDistancePercent =
    Number(entry) > 0 ? (Math.abs(Number(entry) - Number(stop)) / Number(entry)) * 100 : 0;
  const positionValue =
    stopDistancePercent > 0 ? riskAmount / (stopDistancePercent / 100) : 0;
  const positionUnits = Number(entry) > 0 ? positionValue / Number(entry) : 0;
  const expectedLoss = positionUnits * Math.abs(Number(entry) - Number(stop));
  const expectedTp1Profit = positionUnits * Math.abs(Number(tp1) - Number(entry));
  const expectedTp2Profit = positionUnits * Math.abs(Number(tp2) - Number(entry));
  const tp1RiskReward = expectedLoss > 0 ? expectedTp1Profit / expectedLoss : 0;
  const tp2RiskReward = expectedLoss > 0 ? expectedTp2Profit / expectedLoss : 0;

  const signalColor = signal === "LONG" ? "#10B981" : signal === "SHORT" ? "#EF4444" : "#64748B";
  const decisionColor = decision.hardBlock
    ? "#F87171"
    : decision.entryQuality >= 72
    ? "#10B981"
    : decision.entryQuality >= 55
    ? "#FBBF24"
    : "#94A3B8";
  const entryStatusColor =
    entryPlan.status === "GİRİŞ HAZIR"
      ? "#10B981"
      : entryPlan.status === "İPTAL"
      ? "#EF4444"
      : entryPlan.status === "İŞLEM YOK"
      ? "#F97316"
      : entryPlan.status === "TEYİT BEKLİYOR"
      ? "#FBBF24"
      : "#38BDF8";
  const decisionStatusLabel = dynamicRisk.hardBlock
    ? entryPlan.volatilityBlock || marketStructure.trapRisk
      ? "VOLATİLİTE KİLİDİ"
      : dataHealth.blocked
      ? "VERİ KİLİDİ"
      : timeframeMatrix.hardConflict
      ? "ZAMAN UYUMSUZ"
      : "İŞLEM ENGELLENDİ"
    : entryPlan.status;
  const decisionStatusColor = dynamicRisk.hardBlock ? "#F87171" : entryStatusColor;
  const demoEntryReady =
    exchange === "BITGET" && marketType === "FUTURES" && entryPlan.status === "GİRİŞ HAZIR" &&
    !dynamicRisk.hardBlock && !timeframeMatrix.hardConflict && dataHealth.score >= 80;
  const executionIsLive = executionHealth.isLive === true || executionHealth.mode === "BITGET_LIVE";
  const executionModeText = executionIsLive ? "CANLI" : "DEMO";
  const executionMaxLeverage = Math.max(1, Number(executionHealth.maxLeverage) || (executionIsLive ? 2 : 3));
  const selectedExecutionLeverage = Math.min(
    executionMaxLeverage,
    Math.max(1, Number.parseInt(executionLeverage, 10) || 1)
  );

  const checkExecutionHealth = async () => {
    setExecutionLoading(true);
    try {
      const health = await executionRequest("/health");
      // Sunucudan gelen tüm detayları state'e aktar
      setExecutionHealth({ 
        connected: true, 
        armed: health.armed, 
        mode: health.mode, 
        isLive: health.isLive, 
        demoOnly: health.demoOnly, 
        maxLeverage: health.maxLeverage,
        auto: health.auto || { running: false }
      });
      Alert.alert("Sunucu Durumu", 
        `Mod: ${health.mode}\nOtomatik Pilot: ${health.auto?.running ? "✅ ÇALIŞIYOR" : "⛔ DURDU"}\nSilahlı: ${health.armed ? "✅ EVET" : "❌ HAYIR"}\nAcil Kilit: ${health.auto?.emergencyLocked ? "⚠️ AKTİF" : "✅ YOK"}\nSon Tarama: ${health.auto?.lastScanAt ? new Date(health.auto.lastScanAt).toLocaleTimeString('tr-TR') : "---"}`);
    } catch (healthError) {
      setExecutionHealth({ connected: false, armed: false, mode: "BİLİNMİYOR", isLive: false, demoOnly: true, maxLeverage: 3, auto: { running: false, envAllowed: false } });
      Alert.alert("Bağlantı kurulamadı", healthError.message);
    } finally { setExecutionLoading(false); }
  };

  const saveExecutionSettings = async () => {
    await AsyncStorage.setItem("beyzatech_execution_settings", JSON.stringify({
      url: executionUrl.trim(), orderUsdt: demoOrderUsdt,
      leverage: String(selectedExecutionLeverage),
    }));
    Alert.alert("Kaydedildi", "Sunucu adresi, emir tutarı ve kaldıraç kaydedildi. Kontrol anahtarı güvenlik için kaydedilmez ve her açılışta yeniden girilir.");
  };

  const performArmExecution = async () => {
    setExecutionLoading(true);
    try {
      const result = await executionRequest("/v1/control/arm", { method: "POST", body: executionIsLive ? { confirmLive: "ARM_LIVE_TRADING" } : {} });
      setExecutionHealth((previous) => ({ ...previous, connected: true, armed: result.armed, mode: result.mode, isLive: result.isLive }));
      Alert.alert(`${executionModeText} işlem etkin`, `Bitget ${executionModeText.toLowerCase()} emirleri son kullanıcı onayıyla gönderilebilir.`);
    } catch (armError) { Alert.alert("Etkinleştirilemedi", armError.message); }
    finally { setExecutionLoading(false); }
  };

  const armDemoExecution = () => {
    if (!executionIsLive) return performArmExecution();
    Alert.alert(
      "⚠️ GERÇEK PARA MODU",
      "Bu işlem gerçek Bitget hesabınızda para kaybına yol açabilir. Köprüyü yalnızca küçük limitlerle ve ayarları doğruladıysanız etkinleştirin.",
      [{ text: "Vazgeç", style: "cancel" }, { text: "RİSKİ KABUL EDİYORUM", style: "destructive", onPress: performArmExecution }]
    );
  };

  const emergencyStop = async () => {
    setExecutionLoading(true);
    try {
      const result = await executionRequest("/v1/control/stop", { method: "POST", body: {} });
      setExecutionHealth((previous) => ({ ...previous, connected: true, armed: false, auto: { ...(previous.auto || {}), running: false } }));
      Alert.alert("Yeni emirler durduruldu", result.note);
    } catch (stopError) { Alert.alert("Durdurulamadı", stopError.message); }
    finally { setExecutionLoading(false); }
  };

  const performAutoTrading = async (action) => {
    setExecutionLoading(true);
    try {
      const result = await executionRequest(`/v1/auto/${action}`, { method: "POST", body: executionIsLive && action === "start" ? { confirmLive: "START_LIVE_AUTO_TRADING" } : {} });
      setExecutionHealth((previous) => ({ ...previous, connected: true, auto: result.auto }));
      Alert.alert(
        "Sunucu otomatik pilotu",
        action === "start"
          ? `${executionModeText} otomatik pilot bağlı işlem sunucusunda çalışıyor. Telefon kapalı olsa da güvenlik koşulları oluştuğunda tarama devam eder.`
          : "Otomatik pilot durduruldu; yeni otomatik emir gönderilmeyecek."
      );
    } catch (autoError) { Alert.alert("Otomatik pilot", autoError.message); }
    finally { setExecutionLoading(false); }
  };

  const controlAutoTrading = (action) => {
    if (!executionIsLive || action !== "start") return performAutoTrading(action);
    Alert.alert(
      "⚠️ CANLI OTOMATİK İŞLEM",
      "Telefon kapalıyken bile gerçek emir gönderilebilir. Günlük emir ve zarar limitlerini kontrol ettiniz mi?",
      [{ text: "Vazgeç", style: "cancel" }, { text: "CANLI OTOMATİĞİ BAŞLAT", style: "destructive", onPress: () => performAutoTrading(action) }]
    );
  };

  const executeDemoOrder = async (confirmationId) => {
    setExecutionLoading(true);
    try {
      const result = await executionRequest("/v1/orders/execute", { method: "POST", body: { confirmationId } });
      setLastDemoOrder({ ...result, at: new Date().toLocaleTimeString("tr-TR") });
      Alert.alert(`${executionModeText} emir gönderildi`, `Bitget ${executionModeText} • ${result.clientOid}`);
    } catch (orderError) { Alert.alert(`${executionModeText} emir gönderilemedi`, orderError.message); }
    finally { setExecutionLoading(false); }
  };

  const previewDemoOrder = async () => {
    if (!demoEntryReady) {
      return Alert.alert("Emir hazır değil", "GİRİŞ HAZIR, veri sağlığı, üst zaman uyumu ve risk güvenlik koşullarının tamamı oluşmalı.");
    }
    setExecutionLoading(true);
    try {
      const signalId = `${coin}-${timeframe}-${signal}-${candles[candles.length - 1]?.time || Date.now()}`;
      const result = await executionRequest("/v1/orders/preview", { method: "POST", body: {
        symbol: `${coin}USDT`, direction: signal, orderUsdt: Number(demoOrderUsdt),
        leverage: selectedExecutionLeverage,
        stop: Number(stop), tp1: Number(tp1), tp2: Number(tp2), lifecycle: entryPlan.status,
        hardBlock: dynamicRisk.hardBlock, timeframeConflict: timeframeMatrix.hardConflict,
        dataHealthScore: dataHealth.score, signalId,
      }});
      const order = result.order;
      Alert.alert(
        executionIsLive ? "⚠️ GERÇEK PARA EMİR ONAYI" : "🧪 Bitget Demo emir onayı",
        `${order.symbol} • ${order.direction}\n${order.orderUsdt} USDT • ${order.leverage}x\nStop ${order.stop} • TP1 ${order.tp1}\n\n${executionIsLive ? "BU EMİR GERÇEK BİTGET HESABINIZDA GERÇEK PARA KULLANIR." : "Bu emir gerçek para kullanmaz."}`,
        [{ text: "Vazgeç", style: "cancel" }, { text: executionIsLive ? "CANLI EMRİ GÖNDER" : "DEMO EMRİ GÖNDER", style: executionIsLive ? "destructive" : "default", onPress: () => executeDemoOrder(result.confirmationId) }]
      );
    } catch (previewError) { Alert.alert("Önizleme reddedildi", previewError.message); }
    finally { setExecutionLoading(false); }
  };
  const marketText = signal === "LONG" ? "YUKARI TREND" : signal === "SHORT" ? "AŞAĞI TREND" : "NÖTR";
  const formattedVolume = `${indicators.volumeChange >= 0 ? "+" : ""}${indicators.volumeChange.toFixed(1)}%`;
  const formattedFunding = `${futuresData.fundingRate >= 0 ? "+" : ""}${(futuresData.fundingRate * 100).toFixed(4)}%`;
  const formattedOpenInterest =
    futuresData.openInterest >= 1000000
      ? `${(futuresData.openInterest / 1000000).toFixed(2)}M`
      : futuresData.openInterest >= 1000
      ? `${(futuresData.openInterest / 1000).toFixed(2)}K`
      : futuresData.openInterest.toFixed(2);
  const chartCandles = useMemo(() => candles.slice(-80), [candles]);
  const filteredMarketRows = useMemo(() => {
    const query = marketSearch.trim().toUpperCase();
    return marketRows
      .filter((item) => !query || item.coin.includes(query))
      .sort((first, second) => {
        if (marketSort === "PRICE") return second.price - first.price;
        if (marketSort === "VOLUME") return second.volume - first.volume;
        return second.changePercent - first.changePercent;
      });
  }, [marketRows, marketSearch, marketSort]);
  const filteredScannerRows = useMemo(
    () =>
      scannerRows.filter(
        (item) =>
          !item.expired &&
          item.score >= scannerMinScore &&
          (scannerDirection === "TÜMÜ" || item.direction === scannerDirection)
      ),
    [scannerRows, scannerMinScore, scannerDirection]
  );
  const scannerSummary = useMemo(
    () => ({
      long: scannerRows.filter((item) => item.direction === "LONG").length,
      short: scannerRows.filter((item) => item.direction === "SHORT").length,
      neutral: scannerRows.filter((item) => item.direction === "NÖTR").length,
      strongest: scannerRows[0] || null,
    }),
    [scannerRows]
  );
  const momentumRows = useMemo(
    () =>
      [...marketRows]
        .sort(
          (first, second) =>
            Math.abs(second.changePercent) * Math.log10(Math.max(second.volume, 10)) -
            Math.abs(first.changePercent) * Math.log10(Math.max(first.volume, 10))
        )
        .slice(0, 6),
    [marketRows]
  );
  const liquidationSummary = useMemo(() => {
    const periodDuration =
      LIQUIDATION_PERIODS.find(([key]) => key === liquidationPeriod)?.[1] ||
      LIQUIDATION_PERIODS[0][1];
    const cutoff = Date.now() - periodDuration;
    const periodRows = liquidations.filter((item) => item.time >= cutoff);
    const longTotal = periodRows
      .filter((item) => item.side === "buy")
      .reduce((sum, item) => sum + item.value, 0);
    const shortTotal = periodRows
      .filter((item) => item.side === "sell")
      .reduce((sum, item) => sum + item.value, 0);
    const byCoin = periodRows.reduce((accumulator, item) => {
      const current = accumulator[item.coin] || {
        coin: item.coin,
        long: 0,
        short: 0,
        total: 0,
      };
      if (item.side === "buy") current.long += item.value;
      if (item.side === "sell") current.short += item.value;
      current.total += item.value;
      accumulator[item.coin] = current;
      return accumulator;
    }, {});
    return {
      rows: periodRows,
      longTotal,
      shortTotal,
      total: longTotal + shortTotal,
      coins: Object.values(byCoin)
        .sort((first, second) => second.total - first.total)
        .slice(0, 10),
    };
  }, [liquidations, liquidationPeriod]);
  const whaleSummary = useMemo(() => {
    const rows = whaleTrades
      .filter((item) => whaleCoin === "TÜMÜ" || item.coin === whaleCoin)
      .filter((item) => item.value >= whaleThreshold);
    const buyTotal = rows
      .filter((item) => item.side === "BUY")
      .reduce((sum, item) => sum + item.value, 0);
    const sellTotal = rows
      .filter((item) => item.side === "SELL")
      .reduce((sum, item) => sum + item.value, 0);
    return {
      rows,
      buyTotal,
      sellTotal,
      net: buyTotal - sellTotal,
    };
  }, [whaleTrades, whaleCoin, whaleThreshold]);
  const performanceSummary = useMemo(() => {
    const evaluated = history
      .filter((item) => ["WIN", "LOSS", "NEUTRAL"].includes(item.evaluationStatus))
      .slice(0, performanceWindow);
    const wins = evaluated.filter((item) => item.evaluationStatus === "WIN");
    const losses = evaluated.filter((item) => item.evaluationStatus === "LOSS");
    const neutrals = evaluated.filter((item) => item.evaluationStatus === "NEUTRAL");
    const decisiveCount = wins.length + losses.length;
    const averageReturn = evaluated.length
      ? evaluated.reduce((sum, item) => sum + Number(item.signalReturn || 0), 0) /
        evaluated.length
      : 0;
    const longEvaluated = evaluated.filter((item) => item.direction === "LONG");
    const shortEvaluated = evaluated.filter((item) => item.direction === "SHORT");
    const returns = evaluated.map((item) => Number(item.signalReturn || 0));
    const grossProfit = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(
      returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0)
    );
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    [...returns].reverse().forEach((value) => {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    });
    const sampleConfidence = Math.min(100, (evaluated.length / 30) * 100);
    const tp1Reached = evaluated.filter((item) => Number(item.tp1HitAt) > 0).length;
    const tp2Reached = evaluated.filter((item) => item.exitReason === "TP2").length;
    const directStops = evaluated.filter((item) => item.exitReason === "STOP").length;
    const protectedStops = evaluated.filter((item) => item.exitReason === "TP1 SONRASI STOP").length;
    return {
      evaluated: evaluated.length,
      pending: history.filter((item) => item.evaluationStatus === "PENDING").length,
      wins: wins.length,
      losses: losses.length,
      neutrals: neutrals.length,
      winRate: decisiveCount ? (wins.length / decisiveCount) * 100 : 0,
      averageReturn,
      netReturn: returns.reduce((sum, value) => sum + value, 0),
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
      maxDrawdown,
      sampleConfidence,
      tp1Reached,
      tp2Reached,
      directStops,
      protectedStops,
      qualityLabel:
        evaluated.length < 30
          ? "ÖRNEKLEM YETERSİZ"
          : averageReturn > 0 && grossProfit > grossLoss
          ? "DOĞRULANMIŞ"
          : "GÖZDEN GEÇİR",
      longWinRate: longEvaluated.length
        ? (longEvaluated.filter((item) => item.evaluationStatus === "WIN").length /
            longEvaluated.length) *
          100
        : 0,
      shortWinRate: shortEvaluated.length
        ? (shortEvaluated.filter((item) => item.evaluationStatus === "WIN").length /
            shortEvaluated.length) *
          100
        : 0,
    };
  }, [history, performanceWindow]);

  const performanceBreakdowns = useMemo(() => {
    const evaluated = history
      .filter((item) => ["WIN", "LOSS", "NEUTRAL"].includes(item.evaluationStatus))
      .slice(0, performanceWindow);
    const summarize = (keyGetter) => {
      const groups = evaluated.reduce((result, item) => {
        const key = keyGetter(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
        return result;
      }, {});
      return Object.entries(groups).map(([key, items]) => {
        const wins = items.filter((item) => item.evaluationStatus === "WIN").length;
        const losses = items.filter((item) => item.evaluationStatus === "LOSS").length;
        const decisive = wins + losses;
        const averageReturn = items.reduce((sum, item) => sum + Number(item.signalReturn || 0), 0) / items.length;
        return {
          key,
          samples: items.length,
          winRate: decisive ? wins / decisive * 100 : 0,
          averageReturn,
        };
      }).sort((first, second) => second.samples - first.samples || second.averageReturn - first.averageReturn);
    };
    return {
      coins: summarize((item) => item.coin).slice(0, 6),
      timeframes: summarize((item) => TIMEFRAME_LABELS[item.timeframe] || item.timeframe),
    };
  }, [history, performanceWindow]);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}> 
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.title}>⚡ Beyzatech Terminal <Text style={styles.version}>v24.2</Text></Text>
      <Text style={styles.sub}>Gerçek Zamanlı Kripto Karar Destek Terminali</Text>

      {["terminal", "graph"].includes(activeTab) && (
      <>
      <View style={styles.searchRow}>
        <View style={styles.coinInputContainer}>
          <TextInput
            style={styles.coinInput}
            value={coinInput}
            onChangeText={setCoinInput}
            placeholder="BTC, ETH, SOL"
            placeholderTextColor="#64748B"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleScan}
          />
          <Text style={styles.coinSuffix}>/USDT</Text>
        </View>
        <TouchableOpacity
          style={[styles.scanButton, loading && styles.disabled]}
          onPress={handleScan}
          disabled={loading}
        >
          <Text style={styles.scanIcon}>{loading ? "⏳" : "⚡"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <Text style={[styles.status, status !== "CANLI" && styles.statusError]}>
          ● {status}
        </Text>
        <Text style={styles.meta}>{coin}/USDT • {exchange} {marketType} • {lastUpdate}</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.smallAction} onPress={addFavorite}>
          <Text style={styles.smallActionText}>☆ FAVORİYE EKLE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallAction, alarm?.active && styles.alarmActive]}
          onPress={alarm?.active ? () => setAlarm(null) : armAlarm}
        >
          <Text style={styles.smallActionText}>{alarm?.active ? "🔔 ALARM AÇIK" : "🔕 ALARM KUR"}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.errorBox}>⚠ {error}</Text>}
      {!!futuresWarning && <Text style={styles.warningBox}>ℹ {futuresWarning}</Text>}

      <View style={[styles.card, styles.livePriceCard]}>
        <Text style={styles.label}>CANLI FİYAT</Text>
        <Text style={styles.price}>${price}</Text>
      </View>

      <View style={styles.row}>
        {["BINANCE", "BITGET"].map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.option, exchange === item && styles.activeOption]}
            onPress={() => setExchange(item)}
          >
            <Text style={[styles.optionText, exchange === item && styles.activeOptionText]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.marketTypeRow}>
        {["SPOT", "FUTURES"].map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.marketTypeButton, marketType === item && styles.activeMarketType]}
            onPress={() => setMarketType(item)}
          >
            <Text style={[styles.marketTypeText, marketType === item && styles.activeMarketTypeText]}>
              {item === "SPOT" ? "SPOT" : "FUTURES • USDT-M"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.timeRow}>
        {TIMEFRAMES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.timeButton, timeframe === item && styles.activeTime]}
            onPress={() => setTimeframe(item)}
          >
            <Text style={[styles.timeText, timeframe === item && styles.activeTimeText]}>
              {TIMEFRAME_LABELS[item]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      </>
      )}

      {activeTab === "markets" && (
        <>
          <View style={styles.screenHeader}>
            <View>
              <Text style={styles.screenTitle}>
                {marketPanel === "SIGNAL"
                  ? "🎯 SİNYAL TARAYICI"
                  : marketPanel === "LIST"
                  ? "📊 PİYASALAR"
                  : marketPanel === "FLOW"
                  ? "🌊 PİYASA AKIŞI"
                  : marketPanel === "LIQUIDATION"
                  ? "🔥 LİKİDASYONLAR"
                  : "🐋 BALİNA AKIŞI"}
              </Text>
              <Text style={styles.screenSub}>
                {marketPanel === "SIGNAL"
                  ? `BITGET • USDT-M • ${TIMEFRAME_LABELS[scannerTimeframe]} • ${scannerUpdatedAt}`
                  : marketPanel === "LIQUIDATION"
                  ? `BITGET • FUTURES • ${liquidationUpdatedAt}`
                  : marketPanel === "WHALE"
                  ? `BITGET • FUTURES • ${whaleUpdatedAt}`
                  : `${exchange} • ${
                      marketPanel === "LIST"
                        ? `${marketType} • 24 saat`
                        : `FUTURES • ${flowUpdatedAt}`
                    }`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={
                marketPanel === "SIGNAL"
                  ? fetchSignalScanner
                  : marketPanel === "LIST"
                  ? fetchMarkets
                  : marketPanel === "FLOW"
                  ? fetchFlowData
                  : marketPanel === "LIQUIDATION"
                  ? fetchLiquidations
                  : fetchWhaleTrades
              }
            >
              <Text style={styles.refreshText}>
                {scannerLoading || marketsLoading || flowLoading || liquidationLoading || whaleLoading ? "…" : "↻"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.flowTabs}>
            <TouchableOpacity
              style={[styles.flowTab, marketPanel === "SIGNAL" && styles.flowTabActive]}
              onPress={() => setMarketPanel("SIGNAL")}
            >
              <Text style={[styles.flowTabText, marketPanel === "SIGNAL" && styles.flowTabTextActive]}>SİNYAL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.flowTab, marketPanel === "LIST" && styles.flowTabActive]}
              onPress={() => setMarketPanel("LIST")}
            >
              <Text style={[styles.flowTabText, marketPanel === "LIST" && styles.flowTabTextActive]}>LİSTE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.flowTab, marketPanel === "FLOW" && styles.flowTabActive]}
              onPress={() => setMarketPanel("FLOW")}
            >
              <Text style={[styles.flowTabText, marketPanel === "FLOW" && styles.flowTabTextActive]}>AKIŞ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.flowTab, marketPanel === "LIQUIDATION" && styles.flowTabActive]}
              onPress={() => setMarketPanel("LIQUIDATION")}
            >
              <Text style={[styles.flowTabText, marketPanel === "LIQUIDATION" && styles.flowTabTextActive]}>LİKİD.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.flowTab, marketPanel === "WHALE" && styles.flowTabActive]}
              onPress={() => setMarketPanel("WHALE")}
            >
              <Text style={[styles.flowTabText, marketPanel === "WHALE" && styles.flowTabTextActive]}>BALİNA</Text>
            </TouchableOpacity>
          </View>

          {marketPanel === "SIGNAL" ? (
            <>
              <View style={styles.scannerControlCard}>
                <Text style={styles.scannerControlTitle}>ZAMAN DİLİMİ</Text>
                <View style={styles.scannerChoiceRow}>
                  {SCANNER_TIMEFRAMES.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.scannerChoiceButton,
                        scannerTimeframe === item && styles.scannerChoiceActive,
                      ]}
                      onPress={() => setScannerTimeframe(item)}
                    >
                      <Text
                        style={[
                          styles.scannerChoiceText,
                          scannerTimeframe === item && styles.scannerChoiceTextActive,
                        ]}
                      >
                        {TIMEFRAME_LABELS[item]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.scannerControlTitle}>YÖN</Text>
                <View style={styles.scannerChoiceRow}>
                  {["TÜMÜ", "LONG", "SHORT"].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.scannerChoiceButton,
                        scannerDirection === item && styles.scannerChoiceActive,
                      ]}
                      onPress={() => setScannerDirection(item)}
                    >
                      <Text
                        style={[
                          styles.scannerChoiceText,
                          scannerDirection === item && styles.scannerChoiceTextActive,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.scannerControlTitle}>MİNİMUM GÜVEN</Text>
                <View style={styles.scannerChoiceRow}>
                  {SCANNER_SCORE_FILTERS.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.scannerChoiceButton,
                        scannerMinScore === item && styles.scannerChoiceActive,
                      ]}
                      onPress={() => setScannerMinScore(item)}
                    >
                      <Text
                        style={[
                          styles.scannerChoiceText,
                          scannerMinScore === item && styles.scannerChoiceTextActive,
                        ]}
                      >
                        %{item}+
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.scannerSummaryRow}>
                <View style={[styles.scannerSummaryBox, styles.scannerLongBorder]}>
                  <Text style={styles.scannerSummaryLabel}>LONG</Text>
                  <Text style={styles.scannerLongValue}>{scannerSummary.long}</Text>
                </View>
                <View style={[styles.scannerSummaryBox, styles.scannerShortBorder]}>
                  <Text style={styles.scannerSummaryLabel}>SHORT</Text>
                  <Text style={styles.scannerShortValue}>{scannerSummary.short}</Text>
                </View>
                <View style={styles.scannerSummaryBox}>
                  <Text style={styles.scannerSummaryLabel}>TARANAN</Text>
                  <Text style={styles.scannerNeutralValue}>{scannerRows.length}</Text>
                </View>
              </View>

              <Text style={styles.scannerUniverseNote}>
                Günlük hacmi {formatCompact(SCANNER_MIN_VOLUME_USD)} üzerindeki en likit {SCANNER_COIN_LIMIT} Bitget
                USDT-M paritesi kapanmış mum, üst zaman ve 5 örneklik emir defteri ortalamasıyla taranır.
                Nihai puan: yön %40 + giriş %35 + risk %25. Sonuçlar yatırım tavsiyesi değildir.
              </Text>

              {scannerError ? <Text style={styles.errorBox}>{scannerError}</Text> : null}
              {!filteredScannerRows.length && (
                <Text style={styles.muted}>
                  {scannerLoading
                    ? "Piyasa taranıyor; mumlar ve hacim verileri analiz ediliyor…"
                    : "Seçilen filtrelerde güçlü sinyal bulunamadı."}
                </Text>
              )}

              {filteredScannerRows.map((item) => {
                const isLong = item.direction === "LONG";
                const signalStyle = isLong ? styles.scannerLongBadge : styles.scannerShortBadge;
                const valueStyle = isLong ? styles.scannerLongValue : styles.scannerShortValue;
                return (
                  <TouchableOpacity
                    key={item.symbol}
                    style={[
                      styles.scannerSignalCard,
                      isLong ? styles.scannerLongBorder : styles.scannerShortBorder,
                    ]}
                    onPress={() => openScannerSignal(item)}
                  >
                    <View style={styles.scannerSignalHeader}>
                      <View>
                        <Text style={styles.scannerCoin}>{item.coin}/USDT</Text>
                        <Text style={styles.scannerSignalMeta}>
                          Hacim {formatCompact(item.volume)} • 24s {item.change24h >= 0 ? "+" : ""}
                          {item.change24h.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={styles.scannerBadgeGroup}>
                        <View style={[styles.scannerDirectionBadge, signalStyle]}>
                          <Text style={styles.scannerDirectionText}>{item.direction}</Text>
                        </View>
                        <Text style={valueStyle}>%{item.score}</Text>
                      </View>
                    </View>

                    <View style={styles.scannerBadgeRow}>
                      <View style={[
                        styles.scannerLifecycleBadge,
                        item.qualityTier === "GİRİŞ HAZIR"
                          ? styles.scannerLifecycleReady
                          : item.qualityTier === "GÜÇLÜ ADAY"
                          ? styles.scannerQualityStrong
                          : item.qualityTier === "İZLEME"
                          ? styles.scannerLifecycleWatch
                          : styles.scannerQualityWeak,
                      ]}>
                        <Text style={styles.scannerLifecycleText}>{item.qualityTier}</Text>
                      </View>
                      {item.lifecycle !== item.qualityTier && (
                        <View style={[styles.scannerLifecycleBadge, styles.scannerLifecycleWatch]}>
                          <Text style={styles.scannerLifecycleText}>{item.lifecycle}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.scannerScoreRow}>
                      <View style={styles.scannerScoreBox}><Text style={styles.scannerScoreLabel}>YÖN</Text><Text style={styles.scannerScoreValue}>%{item.directionScore}</Text></View>
                      <View style={styles.scannerScoreBox}><Text style={styles.scannerScoreLabel}>GİRİŞ</Text><Text style={styles.scannerScoreValue}>%{item.entryScore}</Text></View>
                      <View style={styles.scannerScoreBox}><Text style={styles.scannerScoreLabel}>RİSK</Text><Text style={styles.scannerScoreValue}>%{item.riskScore}</Text></View>
                    </View>

                    <View style={styles.scannerLevels}>
                      <View style={styles.scannerLevelBox}>
                        <Text style={styles.scannerLevelLabel}>GİRİŞ BÖLGESİ</Text>
                        <Text style={styles.scannerLevelValue}>${formatScannerPrice(item.zoneLow)}–${formatScannerPrice(item.zoneHigh)}</Text>
                      </View>
                      <View style={styles.scannerLevelBox}>
                        <Text style={styles.scannerLevelLabel}>STOP</Text>
                        <Text style={styles.scannerStopValue}>${formatScannerPrice(item.stop)}</Text>
                      </View>
                      <View style={styles.scannerLevelBox}>
                        <Text style={styles.scannerLevelLabel}>TP1</Text>
                        <Text style={styles.scannerTpValue}>${formatScannerPrice(item.tp1)}</Text>
                      </View>
                    </View>

                    <View style={styles.scannerDetailsRow}>
                      <Text style={styles.scannerDetail}>{item.reversalRetestConfirmed ? "↺ Dönüş" : item.higherAligned ? "✓ Üst zaman" : "⚠ Üst zaman"}</Text>
                      <Text style={styles.scannerDetail}>Uzaklık {item.distanceToEntryAtr.toFixed(1)} ATR</Text>
                      <Text style={styles.scannerDetail}>Yaş {item.ageMinutes} dk</Text>
                    </View>

                    <View style={styles.scannerReasons}>
                      {item.reasons.map((reason) => (
                        <Text style={styles.scannerReason} key={reason}>• {reason}</Text>
                      ))}
                    </View>
                    <Text style={styles.scannerOpenText}>Detaylı terminal analizini aç ›</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : marketPanel === "LIST" ? (
            <>
              <View style={styles.marketToolbar}>
                <TextInput
                  style={styles.marketSearch}
                  value={marketSearch}
                  onChangeText={setMarketSearch}
                  placeholder="Coin ara…"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                />
                <View style={styles.sortRow}>
                  {[
                    ["CHANGE", "Değişim"],
                    ["PRICE", "Fiyat"],
                    ["VOLUME", "Hacim"],
                  ].map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.sortButton, marketSort === key && styles.sortActive]}
                      onPress={() => setMarketSort(key)}
                    >
                      <Text style={[styles.sortText, marketSort === key && styles.sortTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.gaugeCard}>
                <View style={styles.gaugeCopy}>
                  <Text style={styles.sectionTitle}>TEKNİK GÜÇ</Text>
                  <Text style={styles.gaugeCoin}>{coin}/USDT</Text>
                  <Text style={styles.gaugeNote}>RSI, EMA, hacim, order book ve trend uyumu</Text>
                </View>
                <StrengthGauge score={ai.score} direction={signal} />
              </View>

              {!filteredMarketRows.length && (
                <Text style={styles.muted}>{marketsLoading ? "Piyasalar yükleniyor…" : "Coin bulunamadı."}</Text>
              )}
              {filteredMarketRows.map((item) => {
                const positive = item.changePercent >= 0;
                const favorite = favorites.includes(item.coin);
                return (
                  <TouchableOpacity
                    key={item.symbol}
                    style={styles.marketRow}
                    onPress={() => openMarketCoin(item.coin)}
                  >
                    <View style={styles.coinBadge}>
                      <Text style={styles.coinBadgeText}>{item.coin.slice(0, 2)}</Text>
                    </View>
                    <View style={styles.marketNameWrap}>
                      <Text style={styles.marketName}>{item.coin}/USDT</Text>
                      <Text style={styles.marketMeta}>{exchange} {marketType}</Text>
                    </View>
                    <View style={styles.marketPriceWrap}>
                      <Text style={styles.marketPrice}>${item.price >= 1 ? item.price.toFixed(2) : item.price.toFixed(5)}</Text>
                      <Text style={{ color: positive ? "#10B981" : "#F87171", fontWeight: "800", fontSize: 12 }}>
                        {positive ? "▲" : "▼"} {item.changePercent.toFixed(2)}%
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleFavorite(item.coin)} hitSlop={10}>
                      <Text style={[styles.favoriteStar, favorite && styles.favoriteStarActive]}>
                        {favorite ? "★" : "☆"}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : marketPanel === "FLOW" ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.flowCoinRow}>
                  {["BTC", "ETH", "SOL", "XRP", "BNB"].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[styles.flowCoinButton, flowCoin === item && styles.flowCoinActive]}
                      onPress={() => setFlowCoin(item)}
                    >
                      <Text style={[styles.flowCoinText, flowCoin === item && styles.flowCoinTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.flowRatioRow}>
                <View style={[styles.flowRatioCard, styles.longFlowCard]}>
                  <Text style={styles.flowCardLabel}>5DK LONG HESAP</Text>
                  <Text style={flowRatio.available ? styles.longFlowValue : styles.noDataValue}>
                    {flowRatio.available ? `%${flowRatio.long.toFixed(1)}` : "VERİ YOK"}
                  </Text>
                  <View style={styles.ratioTrack}>
                    <View style={[styles.longTrack, { width: `${flowRatio.available ? Math.min(flowRatio.long, 100) : 0}%` }]} />
                  </View>
                </View>
                <View style={[styles.flowRatioCard, styles.shortFlowCard]}>
                  <Text style={styles.flowCardLabel}>5DK SHORT HESAP</Text>
                  <Text style={flowRatio.available ? styles.shortFlowValue : styles.noDataValue}>
                    {flowRatio.available ? `%${flowRatio.short.toFixed(1)}` : "VERİ YOK"}
                  </Text>
                  <View style={styles.ratioTrack}>
                    <View style={[styles.shortTrack, { width: `${flowRatio.available ? Math.min(flowRatio.short, 100) : 0}%` }]} />
                  </View>
                </View>
              </View>
              <Text style={styles.flowUpdateText}>Son başarılı akış güncellemesi: {flowUpdatedAt}</Text>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>💸 FONLAMA ORANLARI</Text>
                <Text style={styles.flowDisclaimer}>
                  Pozitif oranlarda long taraf short tarafa; negatif oranlarda short taraf long tarafa ödeme yapar.
                </Text>
                {!fundingRows.length && <Text style={styles.muted}>Fonlama verisi bekleniyor…</Text>}
                {fundingRows.map((item) => {
                  const ratePercent = item.rate * 100;
                  return (
                    <View style={styles.flowDataRow} key={item.coin}>
                      <Text style={styles.historyCoin}>{item.coin}/USDT</Text>
                      <Text style={{ color: ratePercent <= 0 ? "#10B981" : "#F87171", fontWeight: "900" }}>
                        {ratePercent >= 0 ? "+" : ""}{ratePercent.toFixed(4)}%
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>🚀 MOMENTUM TARAYICI</Text>
                {momentumRows.map((item) => {
                  const positive = item.changePercent >= 0;
                  return (
                    <TouchableOpacity style={styles.flowDataRow} key={item.symbol} onPress={() => openMarketCoin(item.coin)}>
                      <View>
                        <Text style={styles.historyCoin}>{item.coin}/USDT</Text>
                        <Text style={styles.historyMeta}>Hacim {formatCompact(item.volume)}</Text>
                      </View>
                      <Text style={{ color: positive ? "#10B981" : "#F87171", fontWeight: "900" }}>
                        {positive ? "▲" : "▼"} {Math.abs(item.changePercent).toFixed(2)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>🐋 BÜYÜK İŞLEM AKIŞI • {flowCoin}</Text>
                <Text style={styles.flowDisclaimer}>Son işlemler parasal büyüklüğüne göre sıralanır.</Text>
                {!largeTrades.length && <Text style={styles.muted}>İşlem akışı bekleniyor…</Text>}
                {largeTrades.map((item) => (
                  <View style={styles.tradeRow} key={item.id}>
                    <View style={[styles.tradeSide, item.side === "BUY" ? styles.buySide : styles.sellSide]}>
                      <Text style={styles.tradeSideText}>{item.side === "BUY" ? "ALIM" : "SATIM"}</Text>
                    </View