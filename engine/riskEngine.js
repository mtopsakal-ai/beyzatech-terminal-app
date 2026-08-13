const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calculateDynamicRisk({
  balance = 0, baseRiskPercent = 1, entry = 0, stop = 0,
  entryQuality = 0, directionConfidence = 0, volatilityBlocked = false,
  consecutiveLosses = 0, dailyLossPercent = 0, timeframeConflict = false,
  timeframeRiskMultiplier = 1,
}) {
  const hardBlock = volatilityBlocked || timeframeConflict || dailyLossPercent >= 3 || consecutiveLosses >= 3;
  let multiplier = clamp((entryQuality + directionConfidence) / 160, 0.35, 1);
  if (consecutiveLosses === 1) multiplier *= 0.75;
  if (consecutiveLosses === 2) multiplier *= 0.5;
  if (dailyLossPercent >= 2) multiplier *= 0.5;
  multiplier *= clamp(Number(timeframeRiskMultiplier) || 0, 0, 1);
  if (hardBlock) multiplier = 0;
  const appliedRiskPercent = clamp(baseRiskPercent * multiplier, 0, 1.5);
  const riskAmount = balance * appliedRiskPercent / 100;
  const stopDistance = Math.abs(entry - stop);
  const units = stopDistance > 0 ? riskAmount / stopDistance : 0;
  return {
    hardBlock, multiplier, appliedRiskPercent, riskAmount, units,
    positionValue: units * entry,
    reason: volatilityBlocked ? "Volatilite kilidi" : timeframeConflict ? "Gerçek üst zaman çatışması" : dailyLossPercent >= 3 ? "Günlük kayıp sınırı" : consecutiveLosses >= 3 ? "Art arda kayıp sınırı" : timeframeRiskMultiplier < 1 ? "Zaman rejimine göre azaltılmış risk" : "Kaliteye göre dinamik risk",
  };
}
