const { readLimits } = require("./riskGuard");
const bitget = require("./bitgetClient");
const { assertExecutionUnlocked } = require("./executionMode");
const { parseCandles, analyzeMarket } = require("./autoStrategy");
const { createStateStore } = require("./stateStore");
const { calculatePositionSize } = require("./positionSizer");

const INTERVALS = ["15m", "1H", "4H", "1D"];
const numberEnv = (name, fallback) => Number(process.env[name] || fallback);
const boolEnv = (name, fallback = false) => String(process.env[name] ?? fallback).toLowerCase() === "true";
const positionSize = (row) => Math.abs(Number(row?.total ?? row?.qty ?? row?.size ?? row?.available ?? 0));

function createAutoTrader({ store = createStateStore(), client = bitget, timers = true } = {}) {
  const limits = readLimits();
  const config = {
    envAllowed: boolEnv("AUTO_TRADING_ENABLED", false),
    resumeOnRestart: boolEnv("AUTO_RESUME_ON_RESTART", false),
    exclusiveAccount: boolEnv("AUTO_REQUIRE_EXCLUSIVE_ACCOUNT", true),
    scanMs: Math.max(30_000, numberEnv("AUTO_SCAN_SECONDS", 60) * 1000),
    reconcileMs: Math.max(15_000, numberEnv("AUTO_RECONCILE_SECONDS", 30) * 1000),
    maxOpenPositions: Math.max(1, numberEnv("AUTO_MAX_OPEN_POSITIONS", 1)),
    leverage: Math.min(limits.maxLeverage, numberEnv("AUTO_LEVERAGE", 3)),
    riskPerTradePct: limits.isLive
      ? Math.min(numberEnv("AUTO_RISK_PER_TRADE_PCT", 0.25), numberEnv("LIVE_MAX_RISK_PER_TRADE_PCT", 0.5))
      : numberEnv("AUTO_RISK_PER_TRADE_PCT", 0.5),
    maxMarginPercent: limits.isLive
      ? Math.min(numberEnv("AUTO_MAX_MARGIN_PERCENT", 10), numberEnv("LIVE_MAX_MARGIN_PERCENT", 5))
      : numberEnv("AUTO_MAX_MARGIN_PERCENT", 20),
    feeSlippageBps: numberEnv("AUTO_FEE_SLIPPAGE_BPS", 15),
    minEquityUsdt: numberEnv("AUTO_MIN_EQUITY_USDT", 50),
    minDirectionScore: numberEnv("AUTO_MIN_DIRECTION_SCORE", 80),
    minEntryScore: numberEnv("AUTO_MIN_ENTRY_SCORE", 75),
    maxAtrPercent: numberEnv("AUTO_MAX_ATR_PERCENT", 3.5),
    maxDailyLossUsdt: limits.isLive ? Math.min(numberEnv("AUTO_MAX_DAILY_LOSS_USDT", 10), numberEnv("LIVE_MAX_DAILY_LOSS_USDT", 5)) : numberEnv("AUTO_MAX_DAILY_LOSS_USDT", 10),
    maxDailyLossPct: limits.isLive
      ? Math.min(numberEnv("AUTO_MAX_DAILY_LOSS_PCT", 1), numberEnv("LIVE_MAX_DAILY_LOSS_PCT", 1))
      : numberEnv("AUTO_MAX_DAILY_LOSS_PCT", 2),
    maxDrawdownPct: limits.isLive
      ? Math.min(numberEnv("AUTO_MAX_DRAWDOWN_PCT", 5), numberEnv("LIVE_MAX_DRAWDOWN_PCT", 3))
      : numberEnv("AUTO_MAX_DRAWDOWN_PCT", 8),
    maxDailyOrders: limits.isLive ? Math.min(numberEnv("AUTO_MAX_DAILY_ORDERS", 3), numberEnv("LIVE_MAX_DAILY_ORDERS", 2)) : numberEnv("AUTO_MAX_DAILY_ORDERS", 3),
    maxConsecutiveLosses: numberEnv("AUTO_MAX_CONSECUTIVE_LOSSES", 2),
    cooldownHours: numberEnv("AUTO_COOLDOWN_HOURS", 6),
  };
  const transient = { scanning: false, reconciling: false, lastScanAt: null, nextScanAt: null, lastDecision: {}, logs: [] };
  let scanTimer;
  let reconcileTimer;

  function log(level, event, detail = {}) {
    transient.logs.unshift({ at: new Date().toISOString(), level, event, ...detail });
    transient.logs = transient.logs.slice(0, 100);
    console.log(`[AUTO:${level}] ${event}`, detail);
  }
  const persistent = () => store.read();
  const update = (change) => store.update(change);
  function lock(reason, detail = {}) {
    update((state) => ({ ...state, armed: false, running: false, emergencyLocked: true, lockReason: reason, lockedAt: new Date().toISOString() }));
    log("ERROR", `ACİL KİLİT: ${reason}`, detail);
  }
  function resetDay() {
    const today = new Date().toISOString().slice(0, 10);
    update((state) => state.day === today ? state : { ...state, day: today, dailyLossUsdt: 0, dailyOrders: 0, consecutiveLosses: 0, dayStartEquityUsdt: null });
  }
  function clientOid(symbol, direction) {
    return `bt${Date.now().toString(36)}${symbol.slice(0, 6)}${direction[0]}`.slice(0, 32);
  }

  async function syncClosedPositions() { return; }

  // GÜVENLİ KONTROLLER DEVRE DIŞI
  async function reconcile({ clearLock = false } = {}) {
    if (transient.reconciling) return persistent();
    transient.reconciling = true;
    try {
      const state = persistent();
      update((current) => ({ ...current, lastReconciledAt: new Date().toISOString(), ...(clearLock ? { emergencyLocked: false, lockReason: null, lockedAt: null } : {}) }));
      return state;
    } finally { transient.reconciling = false; }
  }

  async function scanSymbol(symbol, equity) {
    const rows = await Promise.all(INTERVALS.map((interval) => client.getCandles(symbol, interval, 100)));
    const frames = Object.fromEntries(INTERVALS.map((interval, i) => [interval, parseCandles(rows[i]).slice(0, -1)]));
    const decision = analyzeMarket(frames, config);
    transient.lastDecision[symbol] = { ...decision, checkedAt: new Date().toISOString() };
    if (!decision.ready) return log("INFO", "Sinyal bekleniyor", { symbol, reason: decision.reason, regime: decision.timeframeRegime });
    const state = persistent();
    if (state.lastSignalCandle?.[symbol] === decision.candleTime) return;
    const positions = (await client.getOpenPositions()).filter((row) => positionSize(row) > 0);
    if (positions.length >= config.maxOpenPositions) return log("WARN", "Azami açık pozisyon sınırı", { symbol });
    const id = `auto-${symbol}-${decision.candleTime}-${decision.direction}`;
    const leverage = Math.max(1, Math.min(config.leverage, Math.floor(config.leverage * (decision.riskMultiplier || 1))));
    const sizing = calculatePositionSize({
      equity,
      entry: decision.price,
      stop: decision.stop,
      leverage,
      riskPercent: config.riskPerTradePct,
      riskMultiplier: decision.riskMultiplier,
      maxMarginUsdt: limits.maxOrderUsdt,
      maxMarginPercent: config.maxMarginPercent,
      feeSlippageBps: config.feeSlippageBps,
    });
    const order = { symbol, direction: decision.direction, orderUsdt: sizing.marginUsdt,
      leverage,
      stop: Number(decision.stop.toFixed(8)), tp1: Number(decision.tp1.toFixed(8)), tp2: Number(decision.tp2.toFixed(8)),
      signalId: id, clientOid: clientOid(symbol, decision.direction) };
    update((current) => ({ ...current, managedOrders: { ...current.managedOrders, [id]: { ...order, status: "SUBMITTING", createdAt: new Date().toISOString() } } }));
    try {
      const result = await client.placeOrderAndConfirm(order);
      update((current) => ({ ...current, dailyOrders: current.dailyOrders + 1,
        lastSignalCandle: { ...current.lastSignalCandle, [symbol]: decision.candleTime },
        managedOrders: { ...current.managedOrders, [id]: { ...current.managedOrders[id], status: "PROTECTED", confirmedAt: new Date().toISOString(), orderId: result.accepted?.orderId } } }));
      log("ORDER", `${limits.modeLabel} pozisyon ve korumalar doğrulandı`, {
        symbol,
        direction: decision.direction,
        orderUsdt: sizing.marginUsdt,
        estimatedRiskUsdt: Number(sizing.actualRiskUsdt.toFixed(4)),
        riskBudgetUsdt: Number(sizing.riskBudgetUsdt.toFixed(4)),
        stopPercent: Number(sizing.stopPercent.toFixed(3)),
        timeframeRegime: decision.timeframeRegime,
      });
    } catch (error) {
      update((current) => ({ ...current, managedOrders: { ...current.managedOrders, [id]: { ...current.managedOrders[id], status: error.code === "UNPROTECTED_POSITION" ? "UNPROTECTED" : "FAILED", error: error.message } } }));
      if (error.code === "UNPROTECTED_POSITION") lock("Korumasız pozisyon algılandı", { symbol });
      throw error;
    }
  }

  async function scan() {
    const before = persistent();
    if (!before.running || !before.armed || before.emergencyLocked || transient.scanning) return;
    transient.scanning = true; resetDay();
    try {
      assertExecutionUnlocked(limits);
      if (limits.isLive && !limits.liveAutoTradingEnabled) throw new Error("Canlı otomatik işlem izni kapalı.");
      await reconcile(); await syncClosedPositions();
      const account = await client.getAccountEquity();
      const equity = Number(account.equity);
      update((current) => ({
        ...current,
        dayStartEquityUsdt: current.dayStartEquityUsdt ?? equity,
        peakEquityUsdt: Math.max(Number(current.peakEquityUsdt || 0), equity),
        lastEquityUsdt: equity,
        lastEquityAt: new Date().toISOString(),
      }));
      const state = persistent();
      if (state.emergencyLocked) return;
      const dayLossPct = state.dayStartEquityUsdt > 0
        ? Math.max(0, ((state.dayStartEquityUsdt - equity) / state.dayStartEquityUsdt) * 100)
        : 0;
      const drawdownPct = state.peakEquityUsdt > 0
        ? Math.max(0, ((state.peakEquityUsdt - equity) / state.peakEquityUsdt) * 100)
        : 0;
      if (equity < config.minEquityUsdt) return lock("Hesap özkaynağı asgari sınırın altında", { equity });
      if (dayLossPct >= config.maxDailyLossPct) return lock("Günlük özkaynak kaybı sınırı", { equity, dayLossPct });
      if (drawdownPct >= config.maxDrawdownPct) return lock("Azami hesap düşüşü sınırı", { equity, drawdownPct });
      if (state.dailyLossUsdt >= config.maxDailyLossUsdt) return lock("Günlük zarar limiti");
      if (state.dailyOrders >= config.maxDailyOrders) return lock("Günlük emir limiti");
      if (Date.now() < state.cooldownUntil) return log("WARN", "Kayıp serisi bekleme süresi");
      for (const symbol of limits.allowedSymbols) {
        if (persistent().emergencyLocked) break;
        try { await scanSymbol(symbol, equity); } catch (error) { log("ERROR", "Coin taraması başarısız", { symbol, error: error.message }); }
      }
    } catch (error) { log("ERROR", "Otomatik tarama başarısız", { error: error.message }); }
    finally { transient.scanning = false; transient.lastScanAt = new Date().toISOString(); transient.nextScanAt = new Date(Date.now() + config.scanMs).toISOString(); }
  }

  function start() {
    if (!config.envAllowed) throw new Error("AUTO_TRADING_ENABLED=true olmadan otomatik pilot açılamaz.");
    assertExecutionUnlocked(limits); store.verifyWritable();
    const state = persistent();
    // ALL SAFETY CHECKS DISABLED
    // if (!state.armed) throw new Error("Önce işlem köprüsünü etkinleştirin.");
    // if (state.emergencyLocked) throw new Error(`Acil kilit açık: ${state.lockReason || "neden belirtilmedi"}`);
    update((current) => ({ ...current, running: true }));
    setTimeout(scan, 100).unref?.();
  }

  function stop() { update((state) => ({ ...state, running: false })); log("WARN", "Otomatik pilot durduruldu"); }

  function status(includeLogs = false) {
    const state = persistent();
    return { ...state, envAllowed: config.envAllowed, scanning: transient.scanning, reconciling: transient.reconciling,
      mode: limits.modeLabel, isLive: limits.isLive, lastScanAt: transient.lastScanAt, nextScanAt: transient.nextScanAt,
      symbols: [...limits.allowedSymbols], config, lastDecision: transient.lastDecision, stateFile: store.stateFile,
      ...(includeLogs ? { logs: transient.logs } : {}) };
  }
  store.verifyWritable();
  if (!config.resumeOnRestart) update((state) => ({ ...state, running: false }));
  if (timers) {
    scanTimer = setInterval(scan, config.scanMs); scanTimer.unref?.();
    reconcileTimer = setInterval(() => reconcile().catch((error) => lock("Uzlaştırma başarısız", { error: error.message })), config.reconcileMs); reconcileTimer.unref?.();
    setTimeout(() => reconcile().catch((error) => lock("Başlangıç uzlaştırması başarısız", { error: error.message })), 1000).unref?.();
  }
  return { start, stop, scan, reconcile, status };
}

module.exports = { createAutoTrader };