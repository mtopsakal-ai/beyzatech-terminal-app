const BINANCE_BASE = {
  SPOT: "wss://stream.binance.com:9443/ws",
  FUTURES: "wss://fstream.binance.com/ws",
};

export function createMarketSocket({ exchange, marketType, coin, onTick, onState }) {
  const normalizedCoin = String(coin).toUpperCase();
  const subscriptionKey = `${exchange}:${marketType}:${normalizedCoin}`;
  const symbol = `${String(coin).toLowerCase()}usdt`;
  const isBitget = exchange === "BITGET";
  const url = isBitget
    ? "wss://ws.bitget.com/v2/ws/public"
    : `${BINANCE_BASE[marketType] || BINANCE_BASE.SPOT}/${symbol}@bookTicker`;
  let socket;
  let stopped = false;
  let reconnectTimer;
  let attempts = 0;

  const emitState = (state, extra = {}) => onState?.({ state, at: Date.now(), attempts, ...extra });

  const connect = () => {
    if (stopped) return;
    emitState(attempts ? "YENİDEN BAĞLANIYOR" : "BAĞLANIYOR");
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempts = 0;
      emitState("CANLI");
      if (isBitget) {
        socket.send(JSON.stringify({
          op: "subscribe",
          args: [{
            instType: marketType === "FUTURES" ? "USDT-FUTURES" : "SPOT",
            channel: "ticker",
            instId: `${String(coin).toUpperCase()}USDT`,
          }],
        }));
      }
    };
    socket.onmessage = (event) => {
      // A closed subscription can still have one queued message. Never pass it
      // to the newly selected market.
      if (stopped) return;
      try {
        if (event.data === "pong") return;
        const payload = JSON.parse(event.data);
        const row = isBitget ? payload?.data?.[0] : payload;
        const incomingSymbol = String(isBitget ? row?.instId : row?.s || "").toUpperCase();
        if (incomingSymbol && incomingSymbol !== `${normalizedCoin}USDT`) return;
        const bid = Number(isBitget ? row?.bidPr : row?.b);
        const ask = Number(isBitget ? row?.askPr : row?.a);
        const last = Number(isBitget ? row?.lastPr : 0);
        const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
        if (price > 0) onTick?.({
          price,
          bid,
          ask,
          coin: normalizedCoin,
          exchange,
          marketType,
          subscriptionKey,
          receivedAt: Date.now(),
          source: "WEBSOCKET",
        });
      } catch (_) {
        emitState("VERİ HATASI");
      }
    };
    socket.onerror = () => emitState("BAĞLANTI HATASI");
    socket.onclose = () => {
      if (stopped) return;
      attempts += 1;
      emitState("KESİLDİ");
      reconnectTimer = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(attempts, 4)));
    };
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    if (socket && socket.readyState < 2) socket.close();
  };
}
