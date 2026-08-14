require("./loadEnv");

const http = require("node:http");
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
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (Buffer.byteLength(text) > 32_000) throw new Error("İstek çok büyük.");
  return text ? JSON.parse(text) : {};
}

function authorized(request) {
  const expected = process.env.APP_CONTROL_TOKEN;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 24 || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && require("node:crypto").timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function cleanup() {
  const now = Date.now();
  for (const [key, value] of previews) if (value.expiresAt <= now) previews.delete(key);
  for (const [key, value] of usedSignals) if (value <= now - 86_400_000) usedSignals.delete(key);
}

const server = http.createServer(async (request, response) => {
  cleanup();
  if (request.method === "GET" && request.url === "/health") {
    const limits = readLimits();
    return send(response, 200, {
      ok: true, mode: limits.modeLabel, isLive: limits.isLive, demoOnly: limits.demoOnly,
      unlocked: limits.unlocked, liveAutoTradingEnabled: limits.liveAutoTradingEnabled,
      armed, userManagedRisk: limits.userManagedRisk,
      maxOrderUsdt: limits.maxOrderUsdt, maxLeverage: limits.maxLeverage,
      auto: autoTrader.status(),
    });
  }
  if (!authorized(request)) return send(response, 401, { ok: false, error: "Yetkisiz istek." });
  try {
    if (request.method === "POST" && request.url === "/v1/control/arm") {
      const limits = assertExecutionUnlocked(readLimits());
      const body = await readJson(request);
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
    if (request.method === "POST" && request.url === "/v1/orders/preview") {
      if (!armed) return send(response, 423, { ok: false, error: "İşlem köprüsü etkin değil." });
      const result = validateOrder(await readJson(request));
      if (!result.ok) return send(response, 400, { ok: false, errors: result.errors });
      if (usedSignals.has(result.order.signalId)) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
      const confirmationId = createConfirmationId();
      const expiresAt = Date.now() + 60_000;
      previews.set(confirmationId, { order: result.order, expiresAt });
      const limits = readLimits();
      return send(response, 200, { ok: true, confirmationId, expiresAt, order: result.order, mode: limits.modeLabel, isLive: limits.isLive });
    }
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
    return send(response, 500, { ok: false, error: error?.message || "Sunucu hatası." });
  }
});

// Sunucuyu dinlemeye başla (CORS zaten send fonksiyonunda halledildi)
server.listen(PORT, "0.0.0.0", () => console.log(`Beyzatech execution server :${PORT}`));
