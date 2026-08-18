const test = require("node:test");
const assert = require("node:assert/strict");
const { validateOrder } = require("./riskGuard");
const { signRequest, floorToStep } = require("./bitgetClient");

const limits = { demoOnly: true, maxOrderUsdt: 10, maxLeverage: 3, allowedSymbols: new Set(["ETHUSDT"]) };
const valid = { symbol: "ETHUSDT", direction: "LONG", orderUsdt: 5, leverage: 2, stop: 90, tp1: 110, tp2: 120, lifecycle: "GİRİŞ HAZIR", hardBlock: false, timeframeConflict: false, dataHealthScore: 100, signalId: "signal-1" };

test("güvenli demo emri kabul edilir", () => assert.equal(validateOrder(valid, limits).ok, true));
test("üst zaman çatışması reddedilir", () => assert.equal(validateOrder({ ...valid, timeframeConflict: true }, limits).ok, false));
test("limit üstü kaldıraç reddedilir", () => assert.equal(validateOrder({ ...valid, leverage: 4 }, limits).ok, false));
test("adım büyüklüğü aşağı yuvarlanır", () => assert.equal(floorToStep(1.239, 0.01, 2), "1.23"));
test("imza deterministiktir", () => assert.equal(signRequest("secret", "1", "GET", "/x", "a=1", ""), signRequest("secret", "1", "GET", "/x", "a=1", "")));
