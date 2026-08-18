const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STATE = {
  version: 2,
  armed: false,
  emergencyLocked: false,
  lockReason: null,
  lockedAt: null,
  running: false,
  lastReconciledAt: null,
  lastSignalCandle: {},
  usedSignals: {},
  managedOrders: {},
  processedPositions: [],
  day: null,
  dailyLossUsdt: 0,
  dailyOrders: 0,
  consecutiveLosses: 0,
  cooldownUntil: 0,
  dayStartEquityUsdt: null,
  peakEquityUsdt: null,
  lastEquityUsdt: null,
  lastEquityAt: null,
};

function createStateStore(fileName = process.env.AUTO_STATE_FILE || path.join(__dirname, "data", "automation-state.json")) {
  const stateFile = path.resolve(fileName);

  function read() {
    try {
      if (!fs.existsSync(stateFile)) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      return { ...DEFAULT_STATE, ...parsed };
    } catch (error) {
      throw new Error(`Otomasyon durum dosyası okunamadı: ${error.message}`);
    }
  }

  function write(nextState) {
    const directory = path.dirname(stateFile);
    const temporary = `${stateFile}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(temporary, `${JSON.stringify(nextState, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, stateFile);
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
      throw new Error(`Otomasyon durumu kalıcı kaydedilemedi: ${error.message}`);
    }
  }

  function update(change) {
    const current = read();
    const next = typeof change === "function" ? change(current) : { ...current, ...change };
    write(next);
    return next;
  }

  function verifyWritable() {
    const snapshot = read();
    write(snapshot);
    return { ok: true, stateFile };
  }

  return { read, write, update, verifyWritable, stateFile };
}

module.exports = { DEFAULT_STATE, createStateStore };
