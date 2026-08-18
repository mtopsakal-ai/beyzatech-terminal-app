const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStateStore } = require("./stateStore");
const { createAutoTrader } = require("./autoTrader");

function fixture(client, initial = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bt-auto-"));
  const store = createStateStore(path.join(directory, "state.json"));
  store.update((state) => ({ ...state, ...initial }));
  const trader = createAutoTrader({ store, client, timers: false });
  return { directory, store, trader };
}

test("tanınmayan açık pozisyon otomasyonu acil kilitler", async () => {
  const client = {
    getOpenPositions: async () => [{ symbol: "BTCUSDT", total: "0.001" }],
    verifyProtectionOrders: async () => ({ ok: true }),
  };
  const item = fixture(client, { armed: true });
  try {
    await item.trader.reconcile();
    const state = item.store.read();
    assert.equal(state.emergencyLocked, true);
    assert.match(state.lockReason, /Yönetilmeyen açık pozisyon/);
    assert.equal(state.armed, false);
  } finally { fs.rmSync(item.directory, { recursive: true, force: true }); }
});

test("stop veya TP doğrulanmayan yönetilen pozisyon kilitlenir", async () => {
  const client = {
    getOpenPositions: async () => [{ symbol: "BTCUSDT", total: "0.001" }],
    verifyProtectionOrders: async () => ({ ok: false, stopFound: true, tpFound: false }),
  };
  const managedOrders = { signal1: { symbol: "BTCUSDT", status: "PROTECTED", stop: 90, tp1: 120 } };
  const item = fixture(client, { armed: true, managedOrders });
  try {
    await item.trader.reconcile();
    const state = item.store.read();
    assert.equal(state.emergencyLocked, true);
    assert.equal(state.managedOrders.signal1.status, "UNPROTECTED");
    assert.match(state.lockReason, /stop\/TP/);
  } finally { fs.rmSync(item.directory, { recursive: true, force: true }); }
});
