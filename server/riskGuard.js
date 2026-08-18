const crypto = require("node:crypto");
const { readExecutionMode } = require("./executionMode");

function positiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function nonNegativeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function parseSymbols(raw) {
  if (typeof raw !== "string") return [];
  return raw.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && s.endsWith("USDT"));
}

function readLimits() {
  const mode = readExecutionMode();
  const isLive = mode.isLive;
  const prefix = isLive ? "LIVE_" : "";

  const maxOrderUsdt = positiveNumber(process.env[`${prefix}MAX_ORDER_USDT`], isLive ? 10 : 100);
  const maxLeverage = positiveNumber(process.env[`${prefix}MAX_LEVERAGE`], isLive ? 2 : 15);
  const demoOnly = String(process.env.DEMO_ONLY || "true").toLowerCase() === "true";
  const userManagedRisk = String(process.env.USER_MANAGED_RISK || "false").toLowerCase() === "true";
  const liveAutoTradingEnabled = String(process.env.LIVE_AUTO_TRADING_ENABLED || "false").toLowerCase() === "true";

  const allowedSymbols = parseSymbols(process.env.ALLOWED_SYMBOLS);
  if (!allowedSymbols.length) throw new Error("En az bir işlem sembolü tanımlanmalı (ALLOWED_SYMBOLS).");

  return {
    modeLabel: isLive ? "BITGET_LIVE" : "BITGET_DEMO",
    isLive,
    demoOnly,
    unlocked: !isLive || !demoOnly,
    liveAutoTradingEnabled,
    userManagedRisk,
    maxOrderUsdt,
    maxLeverage,
    allowedSymbols,
  };
}

function validateOrder(order) {
  const errors = [];
  const limits = readLimits();

  if (!order.symbol || !limits.allowedSymbols.includes(order.symbol)) {
    errors.push(`Geçersiz sembol: ${order.symbol}. İzin verilenler: ${limits.allowedSymbols.join(", ")}`);
  }

  const orderUsdt = Number(order.orderUsdt);
  if (!Number.isFinite(orderUsdt) || orderUsdt < 5) {
    errors.push("Emir tutarı en az 5 USDT olmalı.");
  }
  if (orderUsdt > limits.maxOrderUsdt) {
    errors.push(`Emir tutarı ${limits.maxOrderUsdt} USDT'yi aşamaz.`);
  }

  const leverage = Number(order.leverage);
  if (!Number.isFinite(leverage) || leverage < 1) {
    errors.push("Kaldıraç en az 1x olmalı.");
  }
  if (leverage > limits.maxLeverage) {
    errors.push(`Kaldıraç ${limits.maxLeverage}x'i aşamaz.`);
  }

  if (!order.signalId || order.signalId.length < 4) {
    errors.push("Geçerli bir sinyal ID gerekli.");
  }

  if (!["LONG", "SHORT"].includes(order.direction)) {
    errors.push("Yön yalnızca LONG veya SHORT olabilir.");
  }

  const stop = Number(order.stop);
  const tp1 = Number(order.tp1);
  const tp2 = Number(order.tp2);
  if (!Number.isFinite(stop) || stop <= 0) errors.push("Geçerli bir stop fiyatı gerekli.");
  if (!Number.isFinite(tp1) || tp1 <= 0) errors.push("Geçerli bir TP1 fiyatı gerekli.");
  if (!Number.isFinite(tp2) || tp2 <= 0) errors.push("Geçerli bir TP2 fiyatı gerekli.");

  return { ok: errors.length === 0, order, errors };
}

function createConfirmationId() {
  return crypto.randomBytes(8).toString("hex");
}

module.exports = {
  readLimits,
  validateOrder,
  createConfirmationId,
  positiveNumber,
  nonNegativeNumber,
  parseSymbols,
};
