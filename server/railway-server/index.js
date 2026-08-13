require("./loadEnv");

const http = require("node:http");
const { readLimits, validateOrder, createConfirmationId } = require("./riskGuard");
const { placeDemoOrder } = require("./bitgetClient");

const PORT = Number(process.env.PORT || 8787);
const previews = new Map();
const usedSignals = new Map();
let armed = false;

function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
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
    return send(response, 200, { ok: true, mode: "BITGET_DEMO", demoOnly: limits.demoOnly, armed, maxOrderUsdt: limits.maxOrderUsdt, maxLeverage: limits.maxLeverage });
  }
  if (!authorized(request)) return send(response, 401, { ok: false, error: "Yetkisiz istek." });
  try {
    if (request.method === "POST" && request.url === "/v1/control/arm") {
      if (!readLimits().demoOnly) throw new Error("Demo kilidi kapalı; sunucu emir veremez.");
      armed = true;
      return send(response, 200, { ok: true, armed, mode: "BITGET_DEMO" });
    }
    if (request.method === "POST" && request.url === "/v1/control/stop") {
      armed = false;
      previews.clear();
      return send(response, 200, { ok: true, armed, note: "Yeni emirler durduruldu; açık pozisyonlar kapatılmadı." });
    }
    if (request.method === "POST" && request.url === "/v1/orders/preview") {
      if (!armed) return send(response, 423, { ok: false, error: "Demo işlem köprüsü etkin değil." });
      const result = validateOrder(await readJson(request));
      if (!result.ok) return send(response, 400, { ok: false, errors: result.errors });
      if (usedSignals.has(result.order.signalId)) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
      const confirmationId = createConfirmationId();
      const expiresAt = Date.now() + 60_000;
      previews.set(confirmationId, { order: result.order, expiresAt });
      return send(response, 200, { ok: true, confirmationId, expiresAt, order: result.order, mode: "BITGET_DEMO" });
    }
    if (request.method === "POST" && request.url === "/v1/orders/demo") {
      if (!armed) return send(response, 423, { ok: false, error: "Demo işlem köprüsü etkin değil." });
      const { confirmationId } = await readJson(request);
      const preview = previews.get(String(confirmationId || ""));
      if (!preview || preview.expiresAt <= Date.now()) return send(response, 410, { ok: false, error: "Onay süresi doldu; yeniden önizleyin." });
      previews.delete(confirmationId);
      if (usedSignals.has(preview.order.signalId)) return send(response, 409, { ok: false, error: "Bu sinyal daha önce kullanıldı." });
      const clientOid = `bt-demo-${Date.now()}-${preview.order.signalId.slice(-8)}`;
      const result = await placeDemoOrder({ ...preview.order, clientOid });
      usedSignals.set(preview.order.signalId, Date.now());
      return send(response, 200, { ok: true, mode: "BITGET_DEMO", clientOid, result });
    }
    return send(response, 404, { ok: false, error: "Uç nokta bulunamadı." });
  } catch (error) {
    return send(response, 500, { ok: false, error: error?.message || "Sunucu hatası." });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`Beyzatech demo execution server :${PORT}`));
