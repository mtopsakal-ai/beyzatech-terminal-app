const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStateStore } = require("./stateStore");

test("otomasyon durumu yeniden başlatma sonrasında kalır", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bt-state-"));
  const file = path.join(directory, "state.json");
  try {
    const first = createStateStore(file);
    first.update((state) => ({ ...state, armed: true, dailyOrders: 2, lockReason: "test" }));
    const second = createStateStore(file);
    assert.equal(second.read().armed, true);
    assert.equal(second.read().dailyOrders, 2);
    assert.equal(second.read().lockReason, "test");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
