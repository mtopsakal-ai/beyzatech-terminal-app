const crypto = require("node:crypto");

const BASE_URL = "https://api.bitget.com";

function signRequest(secret, timestamp, method, requestPath, query = "", body = "") {
  const queryPart = query ? `?${query}` : "";
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${queryPart}${body}`;
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

function credentialsFromEnv() {
  const credentials = {
    key: process.env.BITGET_API_KEY,
    secret: process.env.BITGET_API_SECRET,
    passphrase: process.env.BITGET_API_PASSPHRASE,
  };
  if (!credentials.key || !credentials.secret || !credentials.passphrase) {
    throw new Error("Bitget demo API bilgileri sunucuda eksik.");
  }
  return credentials;
}

async function bitgetRequest(method, requestPath, { query = "", payload, authenticated = false } = {}) {
  const body = payload ? JSON.stringify(payload) : "";
  const headers = { "Content-Type": "application/json", paptrading: "1", locale: "tr-TR" };
  if (authenticated) {
    const credentials = credentialsFromEnv();
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

async function placeDemoOrder(order) {
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

module.exports = { signRequest, floorToStep, buildOrderSize, placeDemoOrder };
