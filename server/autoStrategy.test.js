const test = require("node:test");
const assert = require("node:assert/strict");
<<<<<<< HEAD
const { ema, rsi, parseCandles, classifyTimeframes, analyzeMarket } = require("./autoStrategy");
=======
const { ema, rsi, parseCandles, evaluateTimeframes, analyzeMarket } = require("./autoStrategy");
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6

function candles(count, start = 100, step = 0.25, range = 0.4) {
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * step;
    return { time: index * 60_000, open: close - step / 2, high: close + range, low: close - range, close, volume: 100 + index };
  });
}

test("EMA yükselen seriyi yukarı taşır", () => {
  const values = Array.from({ length: 30 }, (_, index) => index + 1);
  assert.ok(ema(values, 9) > ema(values, 21));
});

test("RSI yükselen seride yüksektir", () => {
  const values = Array.from({ length: 30 }, (_, index) => index + 1);
  assert.equal(rsi(values), 100);
});

test("mumlar zamana göre sıralanır ve bozuk satırlar atılır", () => {
  const parsed = parseCandles([[2, 1, 2, 0, 1, 10], [1, 1, 2, 0, 1, 10], [3, "x", 2, 0, 1, 10]]);
  assert.deepEqual(parsed.map((item) => item.time), [1, 2]);
});

test("eksik zaman dilimi otomatik emri engeller", () => {
  const decision = analyzeMarket({ "15m": candles(40), "1H": candles(40), "4H": candles(10), "1D": candles(40) });
  assert.equal(decision.ready, false);
  assert.equal(decision.reason, "Yetersiz mum verisi");
});

test("aşırı volatilite otomatik emri engeller", () => {
  const volatile = candles(50, 100, 0.1, 10);
  const decision = analyzeMarket({ "15m": volatile, "1H": volatile, "4H": volatile, "1D": volatile }, { maxAtrPercent: 1 });
  assert.equal(decision.ready, false);
  assert.equal(decision.volatilityLocked, true);
});

<<<<<<< HEAD
test("kısa zaman geri çekilmesi sert üst zaman çatışması sayılmaz", () => {
  const result = classifyTimeframes({ "15m": "SHORT", "1H": "LONG", "4H": "LONG", "1D": "LONG" }, "LONG");
  assert.equal(result.regime, "PULLBACK");
  assert.equal(result.hardConflict, false);
  assert.equal(result.riskMultiplier, 0.65);
});

test("iki üst zaman dilimi tersse otomasyon kilitlenir", () => {
  const result = classifyTimeframes({ "15m": "LONG", "1H": "LONG", "4H": "SHORT", "1D": "SHORT" }, "LONG");
=======
test("tek zaman dilimi sapması normal piyasa dalgalanması olarak kabul edilir", () => {
  const result = evaluateTimeframes({ "15m": "LONG", "1H": "LONG", "4H": "LONG", "1D": "SHORT" }, "LONG");
  assert.equal(result.hardConflict, false);
  assert.equal(result.score, 70);
  assert.ok(result.riskMultiplier > 0);
});

test("kısa zaman geri çekilmesi trend içi pullback olarak sınıflanır", () => {
  const result = evaluateTimeframes({ "15m": "SHORT", "1H": "LONG", "4H": "LONG", "1D": "LONG" }, "LONG");
  assert.equal(result.regime, "PULLBACK");
  assert.equal(result.hardConflict, false);
  assert.equal(result.riskMultiplier, 0.75);
});

test("iki üst zaman dilimi birlikte karşı yöndeyse işlem engellenir", () => {
  const result = evaluateTimeframes({ "15m": "LONG", "1H": "LONG", "4H": "SHORT", "1D": "SHORT" }, "LONG");
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  assert.equal(result.regime, "HARD_CONFLICT");
  assert.equal(result.hardConflict, true);
  assert.equal(result.riskMultiplier, 0);
});
<<<<<<< HEAD

test("tek üst zaman ayrışması normal geçiş olarak yönetilir", () => {
  const result = classifyTimeframes({ "15m": "LONG", "1H": "LONG", "4H": "LONG", "1D": "SHORT" }, "LONG");
  assert.equal(result.hardConflict, false);
  assert.equal(result.alignment, 70);
  assert.ok(result.riskMultiplier > 0);
});
=======
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
