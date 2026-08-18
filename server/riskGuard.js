const crypto = require("node:crypto");
const { readExecutionMode, executionErrors } = require("./executionMode");

<<<<<<< HEAD
function readLimits() {
  const execution = readExecutionMode();
  const configuredOrder = Number(process.env.MAX_ORDER_USDT || 10);
  const configuredLeverage = Number(process.env.MAX_LEVERAGE || 3);
  return {
    ...execution,
    maxOrderUsdt: execution.isLive
      ? Math.min(configuredOrder, Number(process.env.LIVE_MAX_ORDER_USDT || 5))
      : configuredOrder,
    maxLeverage: execution.isLive
      ? Math.min(configuredLeverage, Number(process.env.LIVE_MAX_LEVERAGE || 2))
      : configuredLeverage,
    allowedSymbols: new Set(String(process.env.ALLOWED_SYMBOLS || "BTCUSDT,ETHUSDT,SOLUSDT").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)),
=======
function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readAllowedSymbols() {
  return new Set(String(process.env.ALLOWED_SYMBOLS || "BTCUSDT,ETHUSDT,SOLUSDT")
    .split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
}

function readLimits() {
  const execution = readExecutionMode();
  return {
    ...execution,
    userManagedRisk: String(process.env.USER_MANAGED_RISK ?? "true").toLowerCase() === "true",
    // Manuel işlemde bunlar stratejik öneri değil, hatalı girişe karşı teknik tavandır.
    maxOrderUsdt: positiveNumber(process.env.MANUAL_MAX_ORDER_USDT, 100000),
    maxLeverage: Math.floor(positiveNumber(process.env.MANUAL_MAX_LEVERAGE, 125)),
    allowedSymbols: readAllowedSymbols(),
  };
}

function readAutoLimits() {
  const execution = readExecutionMode();
  const configuredOrder = positiveNumber(process.env.MAX_ORDER_USDT, 10);
  const configuredLeverage = Math.floor(positiveNumber(process.env.MAX_LEVERAGE, 3));
  return {
    ...execution,
    maxOrderUsdt: execution.isLive
      ? Math.min(configuredOrder, positiveNumber(process.env.LIVE_MAX_ORDER_USDT, 5))
      : configuredOrder,
    maxLeverage: execution.isLive
      ? Math.min(configuredLeverage, Math.floor(positiveNumber(process.env.LIVE_MAX_LEVERAGE, 2)))
      : configuredLeverage,
    allowedSymbols: readAllowedSymbols(),
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  };
}

function validateOrder(input, limits = readLimits()) {
  const errors = [];
  const order = {
    symbol: String(input?.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    direction: String(input?.direction || "").toUpperCase(),
    orderUsdt: Number(input?.orderUsdt),
    leverage: Number(input?.leverage),
    stop: Number(input?.stop),
    tp1: Number(input?.tp1),
    tp2: Number(input?.tp2),
    lifecycle: String(input?.lifecycle || ""),
    signalId: String(input?.signalId || ""),
  };
  errors.push(...executionErrors(limits));
<<<<<<< HEAD
=======
  if (input?.riskAccepted !== true) errors.push("Tutar ve kaldıraç risk onayı eksik.");
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  if (!limits.allowedSymbols.has(order.symbol)) errors.push("Coin izin listesinde değil.");
  if (!["LONG", "SHORT"].includes(order.direction)) errors.push("Yön LONG veya SHORT olmalı.");
  if (order.lifecycle !== "GİRİŞ HAZIR") errors.push("Karar motoru GİRİŞ HAZIR durumunda değil.");
  if (input?.hardBlock) errors.push("Risk motoru işlemi engelliyor.");
  if (input?.timeframeConflict) errors.push("Üst zaman yön çatışması var.");
  if (Number(input?.dataHealthScore) < 80) errors.push("Veri sağlığı 80 altında.");
<<<<<<< HEAD
  if (!(order.orderUsdt > 0) || order.orderUsdt > limits.maxOrderUsdt) errors.push(`Emir en fazla ${limits.maxOrderUsdt} USDT olabilir.`);
  if (!(order.leverage >= 1) || order.leverage > limits.maxLeverage) errors.push(`Kaldıraç 1-${limits.maxLeverage}x arasında olmalı.`);
=======
  if (!(order.orderUsdt > 0) || order.orderUsdt > limits.maxOrderUsdt) errors.push(`Emir tutarı 0-${limits.maxOrderUsdt} USDT teknik aralığında olmalı.`);
  if (!Number.isInteger(order.leverage) || order.leverage < 1 || order.leverage > limits.maxLeverage) errors.push(`Kaldıraç 1-${limits.maxLeverage}x teknik aralığında tam sayı olmalı.`);
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  if (![order.stop, order.tp1, order.tp2].every((value) => value > 0)) errors.push("Stop/TP seviyeleri geçersiz.");
  if (order.direction === "LONG" && !(order.stop < order.tp1 && order.tp1 < order.tp2)) errors.push("LONG stop/TP sıralaması geçersiz.");
  if (order.direction === "SHORT" && !(order.stop > order.tp1 && order.tp1 > order.tp2)) errors.push("SHORT stop/TP sıralaması geçersiz.");
  if (!order.signalId) errors.push("Sinyal kimliği eksik.");
  return { ok: errors.length === 0, errors, order, limits };
}

function createConfirmationId() {
  return crypto.randomBytes(24).toString("hex");
}

<<<<<<< HEAD
module.exports = { readLimits, validateOrder, createConfirmationId };
=======
module.exports = { readLimits, readAutoLimits, validateOrder, createConfirmationId };
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
