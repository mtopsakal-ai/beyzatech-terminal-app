const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LIVE_CONFIRMATION,
  readExecutionMode,
  executionErrors,
} = require("./executionMode");

test("demo modu varsayılan ve kilidi açık gelir", () => {
  const mode = readExecutionMode({});
  assert.equal(mode.mode, "DEMO");
  assert.equal(mode.unlocked, true);
  assert.deepEqual(executionErrors(mode), []);
});

test("canlı mod tek bir bayrakla açılamaz", () => {
  const mode = readExecutionMode({ EXECUTION_MODE: "LIVE" });
  assert.equal(mode.isLive, true);
  assert.equal(mode.unlocked, false);
  assert.ok(executionErrors(mode).length >= 3);
});

test("canlı mod yalnızca dört açık onayla açılır", () => {
  const mode = readExecutionMode({
    EXECUTION_MODE: "LIVE",
    DEMO_ONLY: "false",
    LIVE_TRADING_ENABLED: "true",
    LIVE_TRADING_CONFIRM: LIVE_CONFIRMATION,
  });
  assert.equal(mode.isLive, true);
  assert.equal(mode.unlocked, true);
  assert.deepEqual(executionErrors(mode), []);
});
