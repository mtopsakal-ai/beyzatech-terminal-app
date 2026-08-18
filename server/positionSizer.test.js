const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePositionSize } = require("./positionSizer");

test("stop mesafesi ve ozkaynakla risk butcesi hesaplar", () => {
  const result = calculatePositionSize({
    equity: 1000, entry: 100, stop: 98, leverage: 2,
    riskPercent: 0.5, riskMultiplier: 1,
    maxMarginUsdt: 100, maxMarginPercent: 5, feeSlippageBps: 0,
  });
  assert.equal(result.marginUsdt, 50);
  assert.equal(result.notionalUsdt, 100);
  assert.equal(result.actualRiskUsdt, 2);
  assert.equal(result.capped, true);
});

test("teminat ust sinirini asmaz", () => {
  const result = calculatePositionSize({
    equity: 5000, entry: 100, stop: 99.8, leverage: 3,
    riskPercent: 1, riskMultiplier: 1,
    maxMarginUsdt: 25, maxMarginPercent: 10, feeSlippageBps: 15,
  });
  assert.equal(result.marginUsdt, 25);
  assert.equal(result.capped, true);
});

test("sifir risk carpani emir uretmez", () => {
  assert.throws(() => calculatePositionSize({
    equity: 1000, entry: 100, stop: 99, leverage: 2,
    riskPercent: 0.5, riskMultiplier: 0,
    maxMarginUsdt: 100, maxMarginPercent: 5,
  }), /1 USDT altında/);
});
