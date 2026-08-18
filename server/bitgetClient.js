const crypto = require("node:crypto");
const { readExecutionMode, assertExecutionUnlocked } = require("./executionMode");

const BASE_URL = "https://api.bitget.com";

function signRequest(secret, timestamp, method, requestPath, query = "", body = "") {
  const queryPart = query ? `?${query}` : "";
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${queryPart}${body}`;
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

function credentialsFromEnv(execution = readExecutionMode()) {
  const prefix = execution.isLive ? "BITGET_LIVE" : "BITGET";
  const credentials = {
    key: process.env[`${prefix}_API_KEY`],
    secret: process.env[`${prefix}_API_SECRET`],
    passphrase: process.env[`${prefix}_API_PASSPHRASE`],
  };
  if (!credentials.key || !credentials.secret || !credentials.passphrase) {
    throw new Error(execution.isLive
      ? "Canlı Bitget API bilgileri eksik (BITGET_LIVE_*)."
      : "Bitget Demo API bilgileri sunucuda eksik.");
  }
  return credentials;
}

async function bitgetRequest(method, requestPath, { query = "", payload, authenticated = false } = {}) {
  const body = payload ? JSON.stringify(payload) : "";
  const execution = readExecutionMode();
  const headers = { "Content-Type": "application/json", locale: "tr-TR" };
  if (!execution.isLive) headers.paptrading = "1";
  if (authenticated) {
    assertExecutionUnlocked(execution);
    const credentials = credentialsFromEnv(execution);
    const timestamp = String(Date.now());
    Object.assign(headers, {
      "ACCESS-KEY": credentials.key,
      "ACCESS-SIGN": signRequest(credentials.secret, timestamp, method, requestPath, query, body),
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": credentials.passphrase,
    });
  }
  const response = await fetch(`${BASE_URL}${requestPath}${query ? `?${query}` : ""}`, {
    method,
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(12000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.code !== "00000") {
    throw new Error(`Bitget: ${json.msg || response.statusText || "istek başarısız"}`);
  }
  return json.data;
}

function decimals(value) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function floorToStep(value, step, places) {
  const count = Math.floor((Number(value) + Number.EPSILON) / step);
  return (count * step).toFixed(places);
}

async function buildOrderSize(symbol, orderUsdt, leverage) {
  const category = "USDT-FUTURES";
  const [tickerRows, contractRows] = await Promise.all([
    bitgetRequest("GET", "/api/v3/market/tickers", { query: `category=${category}&symbol=${symbol}` }),
    bitgetRequest("GET", "/api/v3/market/instruments", { query: `category=${category}&symbol=${symbol}` }),
  ]);
  const ticker = Array.isArray(tickerRows) ? tickerRows[0] : tickerRows;
  const contract = Array.isArray(contractRows) ? contractRows[0] : contractRows;
  const price = Number(ticker?.lastPrice);
  const step = Number(contract?.quantityMultiplier || 0);
  const minTrade = Number(contract?.minOrderQty || 0);
  const minOrderAmount = Number(contract?.minOrderAmount || 0);
  const places = Number.isFinite(Number(contract?.quantityPrecision))
    ? Number(contract.quantityPrecision)
    : decimals(step);
  if (!(price > 0) || !(step > 0) || !(minTrade > 0)) {
    throw new Error("Kontrat büyüklüğü güvenli biçimde hesaplanamadı.");
  }
  const size = floorToStep((Number(orderUsdt) * Number(leverage)) / price, step, places);
  if (Number(size) < minTrade) throw new Error(`Emir büyüklüğü minimum ${minTrade} kontratın altında.`);
  if (Number(size) * price < minOrderAmount) throw new Error(`Emir tutarı minimum ${minOrderAmount} USDT altında.`);
  return { size, price, category };
}

async function placeOrder(order) {
  const sizeInfo = await buildOrderSize(order.symbol, order.orderUsdt, order.leverage);
  if (order.direction === "LONG" && !(order.stop < sizeInfo.price && sizeInfo.price < order.tp1)) {
    throw new Error("Piyasa fiyatı LONG stop ve TP1 arasında değil; yeni önizleme gerekli.");
  }
  if (order.direction === "SHORT" && !(order.stop > sizeInfo.price && sizeInfo.price > order.tp1)) {
    throw new Error("Piyasa fiyatı SHORT stop ve TP1 arasında değil; yeni önizleme gerekli.");
  }
  await bitgetRequest("POST", "/api/v3/account/set-leverage", {
    payload: {
      category: sizeInfo.category,
      symbol: order.symbol,
      leverage: String(order.leverage),
      marginMode: "isolated",
      ...(process.env.BITGET_POSITION_MODE === "hedge_mode" ? { posSide: order.direction === "LONG" ? "long" : "short" } : {}),
    },
    authenticated: true,
  });
  const payload = {
    category: sizeInfo.category,
    symbol: order.symbol,
    marginMode: "isolated",
    qty: sizeInfo.size,
    side: order.direction === "LONG" ? "buy" : "sell",
    orderType: "market",
    clientOid: order.clientOid,
    reduceOnly: "no",
    stopLoss: String(order.stop),
    takeProfit: String(order.tp1),
    slOrderType: "market",
    tpOrderType: "market",
    slTriggerBy: "mark",
    tpTriggerBy: "mark",
  };
  if (process.env.BITGET_POSITION_MODE === "hedge_mode") payload.posSide = order.direction === "LONG" ? "long" : "short";
  const result = await bitgetRequest("POST", "/api/v3/trade/place-order", {
    payload,
    authenticated: true,
  });
  return { ...result, requestedSize: sizeInfo.size, referencePrice: sizeInfo.price };
}

function listFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.orderList)) return data.orderList;
  return data ? [data] : [];
}

async function getOrderDetails({ orderId, clientOid }) {
  const query = new URLSearchParams({
    category: "USDT-FUTURES",
    ...(orderId ? { orderId: String(orderId) } : {}),
    ...(clientOid ? { clientOid: String(clientOid) } : {}),
  }).toString();
  const data = await bitgetRequest("GET", "/api/v3/trade/order-info", { query, authenticated: true });
  return listFrom(data)[0] || null;
}

async function getOpenOrders(symbol) {
  const query = new URLSearchParams({ category: "USDT-FUTURES", ...(symbol ? { symbol } : {}) }).toString();
  const data = await bitgetRequest("GET", "/api/v3/trade/unfilled-orders", { query, authenticated: true });
  return listFrom(data);
}

async function getUnfilledProtectionOrders(symbol) {
  const query = new URLSearchParams({
    category: "USDT-FUTURES",
    type: "tpsl",
    ...(symbol ? { symbol } : {}),
  }).toString();
  const data = await bitgetRequest("GET", "/api/v3/trade/unfilled-strategy-orders", { query, authenticated: true });
  return listFrom(data);
}

function activePositionSize(position) {
  return Math.abs(Number(position?.total ?? position?.qty ?? position?.size ?? position?.available ?? 0));
}

async function waitForOrderAndPosition({ symbol, orderId, clientOid, timeoutMs = 20_000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastOrder = null;
  while (Date.now() < deadline) {
    try { lastOrder = await getOrderDetails({ orderId, clientOid }); } catch {}
    const positions = await getOpenPositions(symbol);
    const position = positions.find((row) => activePositionSize(row) > 0) || null;
    if (position) return { order: lastOrder, position };
    const status = String(lastOrder?.status || lastOrder?.state || "").toLowerCase();
    if (["cancelled", "canceled", "rejected", "failed"].includes(status)) {
      throw new Error(`Bitget emri gerçekleşmedi (${status}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Emir kabul edildi ancak açık pozisyon süresi içinde doğrulanamadı.");
}

function triggerValue(row) {
  return Number(row?.triggerPrice ?? row?.triggerPx ?? row?.stopSurplusTriggerPrice ?? row?.stopLossTriggerPrice ?? 0);
}

function approximatelyEqual(left, right) {
  if (!(left > 0) || !(right > 0)) return false;
  return Math.abs(left - right) / Math.max(left, right) <= 0.002;
}

async function verifyProtectionOrders(symbol, stop, takeProfit, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await getUnfilledProtectionOrders(symbol);
    const stopFound = rows.some((row) => approximatelyEqual(triggerValue(row), Number(stop)) && /loss|sl/i.test(String(row.planType || row.type || row.orderType || "")));
    const takeProfitFound = rows.some((row) => approximatelyEqual(triggerValue(row), Number(takeProfit)) && /profit|tp/i.test(String(row.planType || row.type || row.orderType || "")));
    // Bazı UTA yanıtları plan türünü ayrı alanla dönmez. Bu durumda iki
    // farklı hedef seviyesinin varlığını yine de doğruluyoruz.
    const stopLevelFound = rows.some((row) => approximatelyEqual(triggerValue(row), Number(stop)));
    const tpLevelFound = rows.some((row) => approximatelyEqual(triggerValue(row), Number(takeProfit)));
    if ((stopFound || stopLevelFound) && (takeProfitFound || tpLevelFound)) {
      return { ok: true, stopFound: true, takeProfitFound: true, orders: rows };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { ok: false, stopFound: rows.some((row) => approximatelyEqual(triggerValue(row), Number(stop))), takeProfitFound: rows.some((row) => approximatelyEqual(triggerValue(row), Number(takeProfit))), orders: rows };
}

async function placeOrderAndConfirm(order) {
  const accepted = await placeOrder(order);
  const resolved = await waitForOrderAndPosition({
    symbol: order.symbol,
    orderId: accepted.orderId,
    clientOid: order.clientOid,
  });
  const protection = await verifyProtectionOrders(order.symbol, order.stop, order.tp1);
  if (!protection.ok) {
    const missing = [!protection.stopFound && "stop", !protection.takeProfitFound && "TP"].filter(Boolean).join(" ve ");
    const error = new Error(`Pozisyon açıldı fakat ${missing || "koruma emirleri"} doğrulanamadı; otomasyon kilitlenmeli.`);
    error.code = "UNPROTECTED_POSITION";
    error.position = resolved.position;
    error.accepted = accepted;
    throw error;
  }
  return { accepted, order: resolved.order, position: resolved.position, protection };
}

async function getCandles(symbol, interval, limit = 100) {
  const query = new URLSearchParams({ category: "USDT-FUTURES", symbol, interval, limit: String(limit) }).toString();
  return bitgetRequest("GET", "/api/v3/market/candles", { query });
}

async function getOpenPositions(symbol) {
  const query = new URLSearchParams({ category: "USDT-FUTURES", ...(symbol ? { symbol } : {}) }).toString();
  const data = await bitgetRequest("GET", "/api/v3/position/current-position", { query, authenticated: true });
  return Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : [];
}

async function getPositionHistory(limit = 50) {
  const query = new URLSearchParams({ category: "USDT-FUTURES", limit: String(limit) }).toString();
  const data = await bitgetRequest("GET", "/api/v3/position/history-position", { query, authenticated: true });
  return Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : [];
}

async function getAccountEquity() {
  const data = await bitgetRequest("GET", "/api/v3/account/assets", { authenticated: true });
  const row = Array.isArray(data) ? data[0] : data;
  const equity = Number(row?.accountEquity ?? row?.usdtEquity ?? row?.equity);
  if (!(equity >= 0)) throw new Error("Bitget hesap özkaynağı okunamadı.");
  return {
    equity,
    usdtEquity: Number(row?.usdtEquity ?? equity),
    unrealisedPnl: Number(row?.unrealisedPnl ?? 0),
    effectiveEquity: Number(row?.effEquity ?? equity),
  };
}

module.exports = {
  signRequest, floorToStep, buildOrderSize, placeOrder, placeOrderAndConfirm,
  placeDemoOrder: placeOrder,
  getCandles, getOpenPositions, getPositionHistory, getOrderDetails,
  getAccountEquity,
  getOpenOrders, getUnfilledProtectionOrders, waitForOrderAndPosition,
  verifyProtectionOrders, activePositionSize,
};
