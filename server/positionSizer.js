function finitePositive(value, name) {
  const number = Number(value);
  if (!(number > 0) || !Number.isFinite(number)) throw new Error(`${name} geçersiz.`);
  return number;
}

function calculatePositionSize(input) {
  const equity = finitePositive(input.equity, "Hesap özkaynağı");
  const entry = finitePositive(input.entry, "Giriş fiyatı");
  const stop = finitePositive(input.stop, "Stop fiyatı");
  const leverage = Math.max(1, Math.floor(finitePositive(input.leverage, "Kaldıraç")));
  const riskPercent = finitePositive(input.riskPercent, "İşlem riski");
  const riskMultiplier = Math.max(0, Math.min(1, Number(input.riskMultiplier ?? 1)));
  const maxMarginUsdt = finitePositive(input.maxMarginUsdt, "Azami emir teminatı");
  const maxMarginPercent = finitePositive(input.maxMarginPercent, "Azami teminat yüzdesi");
  const frictionFraction = Math.max(0, Number(input.feeSlippageBps || 0)) / 10_000;
  const stopFraction = Math.abs(entry - stop) / entry;
  if (!(stopFraction > 0)) throw new Error("Stop mesafesi sıfır olamaz.");

  const effectiveRiskFraction = stopFraction + frictionFraction;
  const riskBudgetUsdt = equity * (riskPercent / 100) * riskMultiplier;
  const targetNotionalUsdt = riskBudgetUsdt / effectiveRiskFraction;
  const uncappedMarginUsdt = targetNotionalUsdt / leverage;
  const equityMarginCap = equity * (maxMarginPercent / 100);
  const marginUsdt = Math.floor(Math.min(uncappedMarginUsdt, maxMarginUsdt, equityMarginCap) * 100) / 100;
  if (!(marginUsdt >= 1)) throw new Error("Risk hesabı 1 USDT altında emir üretti.");

  return {
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    actualRiskUsdt: marginUsdt * leverage * effectiveRiskFraction,
    riskBudgetUsdt,
    stopPercent: stopFraction * 100,
    capped: marginUsdt + 0.001 < uncappedMarginUsdt,
  };
}

module.exports = { calculatePositionSize };
