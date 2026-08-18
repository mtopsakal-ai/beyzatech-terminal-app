const LIVE_CONFIRMATION = "I_UNDERSTAND_REAL_MONEY";

const boolValue = (value, fallback = false) =>
  String(value ?? fallback).trim().toLowerCase() === "true";

function readExecutionMode(env = process.env) {
  const requested = String(env.EXECUTION_MODE || "DEMO").trim().toUpperCase();
  const mode = requested === "LIVE" ? "LIVE" : "DEMO";
  const demoOnly = boolValue(env.DEMO_ONLY, true);
  const liveTradingEnabled = boolValue(env.LIVE_TRADING_ENABLED, false);
  const liveConfirmed = String(env.LIVE_TRADING_CONFIRM || "") === LIVE_CONFIRMATION;
  const liveAutoTradingEnabled = boolValue(env.LIVE_AUTO_TRADING_ENABLED, false);
  const unlocked = mode === "DEMO"
    ? demoOnly
    : !demoOnly && liveTradingEnabled && liveConfirmed;
  return {
    mode,
    modeLabel: `BITGET_${mode}`,
    isLive: mode === "LIVE",
    demoOnly,
    liveTradingEnabled,
    liveConfirmed,
    liveAutoTradingEnabled,
    unlocked,
  };
}

function executionErrors(execution = readExecutionMode()) {
  const errors = [];
  if (execution.mode === "DEMO" && !execution.demoOnly) {
    errors.push("Demo modu için DEMO_ONLY=true olmalı.");
  }
  if (execution.mode === "LIVE") {
    if (execution.demoOnly) errors.push("Canlı mod için DEMO_ONLY=false olmalı.");
    if (!execution.liveTradingEnabled) errors.push("LIVE_TRADING_ENABLED=true değil.");
    if (!execution.liveConfirmed) errors.push("Canlı para riski onayı eksik.");
  }
  return errors;
}

function assertExecutionUnlocked(execution = readExecutionMode()) {
  const errors = executionErrors(execution);
  if (errors.length) throw new Error(errors.join(" "));
  return execution;
}

module.exports = { LIVE_CONFIRMATION, readExecutionMode, executionErrors, assertExecutionUnlocked };
