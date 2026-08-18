require("./loadEnv");

const http = require("node:http");
<<<<<<< HEAD
const crypto = require("node:crypto");
const { readLimits, validateOrder, createConfirmationId } = require("./riskGuard");
const bitget = require("./bitgetClient");
const { assertExecutionUnlocked } = require("./executionMode");
const { createAutoTrader } = require("./autoTrader");
const { createStateStore } = require("./stateStore");

const PORT = Number(process.env.PORT || 8787);
const previews = new Map();
const store = createStateStore();
const autoTrader = createAutoTrader({ store, client: bitget });

function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
=======
const { readLimits, validateOrder, createConfirmationId } = require("./riskGuard");
const { placeOrder } = require("./bitgetClient");
const { assertExecutionUnlocked } = require("./executionMode");
const { createAutoTrader } = require("./autoTrader");

const PORT = Number(process.env.PORT || 8787);
const previews = new Map();
const usedSignals = new Map();
let armed = false;
const autoTrader = createAutoTrader();

// === KESİN CORS ÇÖZÜMÜ ===
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

function send(response, status, payload) {
  response.writeHead(status, { 
    "Content-Type": "application/json; charset=utf-8", 
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
<<<<<<< HEAD
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_000) throw new Error("İstek çok büyük.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
=======
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (Buffer.byteLength(text) > 32_000) throw new Error("İstek çok büyük.");
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  return text ? JSON.parse(text) : {};
}

function authorized(request) {
  const expected = process.env.APP_CONTROL_TOKEN;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 24 || !supplied) return false;
<<<<<<< HEAD
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
=======
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && require("node:crypto").timingSafeEqual(expectedBuffer, suppliedBuffer);
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
}

function cleanup() {
  const now = Date.now();
  for (const [key, value] of previews) if (value.expiresAt <= now) previews.delete(key);
<<<<<<< HEAD
  store.update((state) => {
    const usedSignals = Object.fromEntries(Object.entries(state.usedSignals || {}).filter(([, at]) => Number(at) > now - 86_400_000));
    return Object.keys(usedSignals).length === Object.keys(state.usedSignals || {}).length ? state : { ...state, usedSignals };
  });
}

function clientOid(isLive, signalId) {
  const digest = crypto.createHash("sha256").update(String(signalId)).digest("hex").slice(0, 8);
  return `bt${isLive ? "l" : "d"}${Date.now().toString(36)}${digest}`.slice(0, 32);
}

function lockExecution(reason) {
  store.update((state) => ({ ...state, armed: false, running: false, emergencyLocked: true, lockReason: reason, lockedAt: new Date().toISOString() }));
=======
  for (const [key, value] of usedSignals) if (value <= now - 86_400_000) usedSignals.delete(key);
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
}

const server = http.createServer(async (request, response) => {
  cleanup();
  if (request.method === "GET" && request.url === "/health") {
    const limits = readLimits();
<<<<<<< HEAD
    const state = store.read();
    const autoStatus = autoTrader.status(true);
    
    // --- GÜNCELLEME: Sunucudaki detaylı durumu App.js'ye gönder ---
    return send(response, 200, {
      ok: true, 
      mode: limits.modeLabel, 
      isLive: limits.isLive, 
      demoOnly: limits.demoOnly,
      unlocked: limits.unlocked, 
      liveAutoTradingEnabled: limits.liveAutoTradingEnabled,
      armed: state.armed, 
      emergencyLocked: state.emergencyLocked, 
      lockReason: state.lockReason,
      maxOrderUsdt: limits.maxOrderUsdt, 
      maxLeverage: limits.maxLeverage,
      auto: {
        running: autoStatus.running || false,
        envAllowed: autoStatus.envAllowed || false,
        scanning: autoStatus.scanning || false,
        reconciling: autoStatus.reconciling || false,
        lastScanAt: autoStatus.lastScanAt || null,
        nextScanAt: autoStatus.nextScanAt || null,
        emergencyLocked: state.emergencyLocked || false, // Store'dan gelen acil kilit
        lockReason: state.lockReason || null,
        dailyOrders: state.dailyOrders || 0,
        dailyLossUsdt: state.dailyLossUsdt || 0,
        consecutiveLosses: state.consecutiveLosses || 0,
        lastDecision: autoStatus.lastDecision || {}
      }
    });
  }
  if (!authorized(request)) return send(response, 401, { ok: false, error: "Yetkisiz istek." });

=======
    return send(response, 200, {
      ok: true, mode: limits.modeLabel, isLive: limits.isLive, demoOnly: limits.demoOnly,
      unlocked: limits.unlocked, liveAutoTradingEnabled: limits.liveAutoTradingEnabled,
      armed, userManagedRisk: limits.userManagedRisk,
      maxOrderUsdt: limits.maxOrderUsdt, maxLeverage: limits.maxLeverage,
      auto: autoTrader.status(),
    });
  }
  if (!authorized(request)) return send(response, 401, { ok: false, error: "Yetkisiz istek." });
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
  try {
    if (request.method === "POST" && request.url === "/v1/control/arm") {
      const limits = assertExecutionUnlocked(readLimits());
      const body = await readJson(request);
<<<<<<< HEAD
      const state = store.read();
      if (state.emergencyLocked) return send(response, 423, { ok: false, error: `Acil kilit açık: ${state.lockReason || "neden belirtilmedi"}` });
      if (limits.isLive && body.confirmLive !== "ARM_LIVE_TRADING") {
        return send(response, 400, { ok: false, error: "Canlı hesap için açık etkinleştirme onayı eksik." });
      }
      store.update((current) => ({ ...current, armed: true }));
      return send(response, 200, { ok: true, armed: true, mode: limits.modeLabel, isLive: limits.isLive });
    }

    if (request.method === "POST" && request.url === "/v1/control/stop") {
      autoTrader.stop();
      store.update((state) => ({ ...state, armed: false, running: false }));
      previews.clear();
      return send(response, 200, { ok: true, armed: false, note: "Yeni emirler durduruldu; açık pozisyonlar kapatılmadı." });
    }

    if (request.method === "POST" && request.url === "/v1/control/unlock") {
      const body = await readJson(request);
      if (body.confirm !== "UNLOCK_AFTER_RECONCILE") return send(response, 400, { ok: false, error: "Kilit açma onayı eksik." });
      await autoTrader.reconcile({ clearLock: true });
      const state = store.read();
      if (state.emergencyLocked) return send(response, 423, { ok: false, error: state.lockReason || "Acil kilit kaldırılamadı." });
      return send(response, 200, { ok: true, emergencyLocked: false, note: "Uzlaştırma tamamlandı; köprü ayrıca etkinleştirilmelidir." });
    }

    if (request.method === "GET" && request.url === "/v1/auto/status") return send(response, 200, { ok: true, auto: autoTrader.status(true) });
    if (request.method === "POST" && request.url === "/v1/auto/reconcile") {
      await autoTrader.reconcile();
=======
      if (limits.isLive && body.confirmLive !== "ARM_LIVE_TRADING") {
        return send(response, 400, { ok: false, error: "Canlı hesap için açık etkinleştirme onayı eksik." });
      }
      armed = true;
      return send(response, 200, { ok: true, armed, mode: limits.modeLabel, isLive: limits.isLive });
    }
    if (request.method === "POST" && request.url === "/v1/control/stop") {
      armed = false;
      autoTrader.stop();
      previews.clear();
      return send(response, 200, { ok: true, armed, note: "Yeni emirler durduruldu; açık pozisyonlar kapatılmadı." });
    }
    if (request.method === "GET" && request.url === "/v1/auto/status") {
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
      return send(response, 200, { ok: true, auto: autoTrader.status(true) });
    }
    if (request.method === "POST" && request.url === "/v1/auto/start") {
      const limits = readLimits();
      const body = await readJson(request);
      if (limits.isLive && body.confirmLive !== "START_LIVE_AUTO_TRADING") {
        return send(response, 400, { ok: false, error: "Canlı otomatik pilot için açık onay eksik." });
      }
      autoTrader.start();
      return send(response, 200, { ok: true, auto: autoTrader.status() });
    }
    if (request.method === "POST" && request.url === "/v1/auto/stop") {
      autoTrader.stop();
      return send(response, 200, { ok: true, auto: autoTrader.status() });
    }
    if (request.method === "POST" && request.url === "/v1/auto/scan") {
      await autoTrader.scan();
      return send(response, 200, { ok: true, auto: autoTrader.status(true) });
    }
<<<<<<< HEAD

    if (request.method === "POST" && request.url === "/v1/orders/preview") {
      const state = store.read();
      if (!state.armed || state.emergencyLocked) return send(response, 423, { ok: false, error: state.emergencyLocked ? "Acil kilit açık." : "İşlem köprüsü etkin değil." });
      const result = validateOrder(await readJson(request));
      if (!result.ok) return send(response, 400, { ok: false, errors: result.errors });
      if (state.usedSignals?.[result.order.signalId]) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
=======
    if (request.method === "POST" && request.url === "/v1/orders/preview") {
      if (!armed) return send(response, 423, { ok: false, error: "İşlem köprüsü etkin değil." });
      const result = validateOrder(await readJson(request));
      if (!result.ok) return send(response, 400, { ok: false, errors: result.errors });
      if (usedSignals.has(result.order.signalId)) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
      const confirmationId = createConfirmationId();
      const expiresAt = Date.now() + 60_000;
      previews.set(confirmationId, { order: result.order, expiresAt });
      const limits = readLimits();
      return send(response, 200, { ok: true, confirmationId, expiresAt, order: result.order, mode: limits.modeLabel, isLive: limits.isLive });
    }
<<<<<<< HEAD

    if (request.method === "POST" && ["/v1/orders/execute", "/v1/orders/demo"].includes(request.url)) {
      const limits = assertExecutionUnlocked(readLimits());
      const state = store.read();
      if (request.url === "/v1/orders/demo" && limits.isLive) return send(response, 404, { ok: false, error: "Demo uç noktası canlı modda kapalı." });
      if (!state.armed || state.emergencyLocked) return send(response, 423, { ok: false, error: state.emergencyLocked ? "Acil kilit açık." : "İşlem köprüsü etkin değil." });
      const { confirmationId } = await readJson(request);
      const preview = previews.get(String(confirmationId || ""));
      if (!preview || preview.expiresAt <= Date.now()) return send(response, 410, { ok: false, error: "Onay süresi doldu; yeniden önizleyin." });
      previews.delete(String(confirmationId));
      if (state.usedSignals?.[preview.order.signalId]) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
      const id = `manual-${preview.order.signalId}`;
      const order = { ...preview.order, clientOid: clientOid(limits.isLive, preview.order.signalId) };
      store.update((current) => ({ ...current, managedOrders: { ...current.managedOrders, [id]: { ...order, status: "SUBMITTING", createdAt: new Date().toISOString() } } }));
      try {
        const result = await bitget.placeOrderAndConfirm(order);
        store.update((current) => ({ ...current, armed: false,
          usedSignals: { ...current.usedSignals, [order.signalId]: Date.now() },
          managedOrders: { ...current.managedOrders, [id]: { ...current.managedOrders[id], status: "PROTECTED", confirmedAt: new Date().toISOString(), orderId: result.accepted?.orderId } } }));
        return send(response, 200, { ok: true, mode: limits.modeLabel, isLive: limits.isLive, clientOid: order.clientOid, result });
      } catch (error) {
        store.update((current) => ({ ...current, managedOrders: { ...current.managedOrders, [id]: { ...current.managedOrders[id], status: error.code === "UNPROTECTED_POSITION" ? "UNPROTECTED" : "FAILED", error: error.message } } }));
        if (error.code === "UNPROTECTED_POSITION") lockExecution("Korumasız pozisyon algılandı");
        throw error;
      }
    }

    return send(response, 404, { ok: false, error: "Uç nokta bulunamadı." });
  } catch (error) {
=======
    if (request.method === "POST" && ["/v1/orders/execute", "/v1/orders/demo"].includes(request.url)) {
      const limits = assertExecutionUnlocked(readLimits());
      if (request.url === "/v1/orders/demo" && limits.isLive) return send(response, 404, { ok: false, error: "Demo uç noktası canlı modda kapalı." });
      if (!armed) return send(response, 423, { ok: false, error: "İşlem köprüsü etkin değil." });
      const { confirmationId } = await readJson(request);
      const preview = previews.get(String(confirmationId || ""));
      if (!preview || preview.expiresAt <= Date.now()) return send(response, 410, { ok: false, error: "Onay süresi doldu; yeniden önizleyin." });
      previews.delete(confirmationId);
      if (usedSignals.has(preview.order.signalId)) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
      const clientOid = `bt-${limits.isLive ? "live" : "demo"}-${Date.now()}-${preview.order.signalId.slice(-8)}`;
      const result = await placeOrder({ ...preview.order, clientOid });
      usedSignals.set(preview.order.signalId, Date.now());
      armed = false;
      return send(response, 200, { ok: true, mode: limits.modeLabel, isLive: limits.isLive, clientOid, result });
    }
    return send(response, 404, { ok: false, error: "Uç nokta bulunamadı." });
  } catch (error) {
    console.error("🔥 CAUGHT 500 ERROR:", error);
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
    return send(response, 500, { ok: false, error: error?.message || "Sunucu hatası." });
  }
});

<<<<<<< HEAD
server.listen(PORT, "0.0.0.0", () => console.log(`Beyzatech execution server :${PORT}`));
=======
// Sunucuyu dinlemeye başla (CORS zaten send fonksiyonunda halledildi)
server.listen(PORT, "0.0.0.0", () => console.log(`Beyzatech execution server :${PORT}`));
>>>>>>> e2c2fbb2a1e38ddc09f7a6ab69525e18fda616f6
