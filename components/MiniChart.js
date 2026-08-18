import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

const PRICE_HEIGHT = 280;
const VOLUME_HEIGHT = 72;
const RSI_HEIGHT = 86;
const MACD_HEIGHT = 94;
const LEFT = 12;
const RIGHT = 66;
const TOP = 14;
const BOTTOM = 22;
const ZOOM_LEVELS = [24, 48, 80];

function emaSeries(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  }
  return output;
}

function smaSeries(values, period) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

function rsiSeries(values, period = 14) {
  return values.map((_, index) => {
    if (index < period) return 50;
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = values[cursor] - values[cursor - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    if (!losses) return 100;
    return 100 - 100 / (1 + gains / losses);
  });
}

function pathFrom(values, x, y) {
  return values
    .map((value, index) => `${index ? "L" : "M"} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`)
    .join(" ");
}

function formatPrice(value) {
  const number = Number(value) || 0;
  if (number >= 1000) return number.toFixed(2);
  if (number >= 1) return number.toFixed(4);
  return number.toFixed(6);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MiniChart({
  candles = [],
  coin = "—",
  direction,
  timeframe,
  entry,
  stop,
  tp1,
  tp2,
  support,
  resistance,
}) {
  const [visibleCount, setVisibleCount] = useState(48);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(true);
  const [showLevels, setShowLevels] = useState(true);

  const data = useMemo(() => candles.slice(-visibleCount), [candles, visibleCount]);
  const analytics = useMemo(() => {
    if (!data.length) return null;
    const allCloses = candles.map((item) => item.close);
    const offset = Math.max(0, candles.length - data.length);
    const ema9 = emaSeries(allCloses, 9).slice(offset);
    const ema21 = emaSeries(allCloses, 21).slice(offset);
    const sma200 = smaSeries(allCloses, 200).slice(offset);
    const rsi = rsiSeries(allCloses).slice(offset);
    const fast = emaSeries(allCloses, 12);
    const slow = emaSeries(allCloses, 26);
    const macdAll = allCloses.map((_, index) => fast[index] - slow[index]);
    const signalAll = emaSeries(macdAll, 9);
    return {
      ema9,
      ema21,
      sma200,
      rsi,
      macd: macdAll.slice(offset),
      macdSignal: signalAll.slice(offset),
    };
  }, [candles, data.length]);

  if (!data.length || !analytics) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📈 PROFESYONEL GRAFİK</Text>
        <Text style={styles.empty}>Mum verisi bekleniyor…</Text>
      </View>
    );
  }

  const chartWidth = Math.max(620, data.length * 14 + LEFT + RIGHT);
  const plotWidth = chartWidth - LEFT - RIGHT;
  const slot = plotWidth / data.length;
  const bodyWidth = Math.max(3, slot * 0.62);
  const levels = data.flatMap((item) => [item.high, item.low]);
  if (showLevels) {
    [entry, stop, tp1, tp2, support, resistance].forEach((value) => {
      if (Number.isFinite(value) && value > 0) levels.push(value);
    });
  }
  const priceMin = Math.min(...levels);
  const priceMax = Math.max(...levels);
  const pricePadding = (priceMax - priceMin || priceMax * 0.01 || 1) * 0.08;
  const min = priceMin - pricePadding;
  const max = priceMax + pricePadding;
  const range = max - min || 1;
  const x = (index) => LEFT + index * slot + slot / 2;
  const y = (value) => TOP + ((max - value) / range) * (PRICE_HEIGHT - TOP - BOTTOM);
  const selected =
    selectedIndex === null ? data.at(-1) : data[Math.min(selectedIndex, data.length - 1)];
  const selectedPosition =
    selectedIndex === null ? data.length - 1 : Math.min(selectedIndex, data.length - 1);
  const maxVolume = Math.max(...data.map((item) => item.volume), 1);
  const macdMin = Math.min(...analytics.macd, ...analytics.macdSignal, 0);
  const macdMax = Math.max(...analytics.macd, ...analytics.macdSignal, 0);
  const macdRange = macdMax - macdMin || 1;
  const latestPrice = data.at(-1).close;

  const drawLevel = (value, color, label) => {
    if (!showLevels || !Number.isFinite(value) || value <= 0) return null;
    const lineY = y(value);
    return (
      <G key={label}>
        <Line x1={LEFT} x2={chartWidth - RIGHT} y1={lineY} y2={lineY} stroke={color} strokeWidth="1" strokeDasharray="6 4" />
        <Rect x={chartWidth - RIGHT + 3} y={lineY - 9} width={RIGHT - 6} height="18" rx="4" fill={color} />
        <SvgText x={chartWidth - RIGHT + 7} y={lineY + 3} fill="#FFF" fontSize="8" fontWeight="800">
          {label} {formatPrice(value)}
        </SvgText>
      </G>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.symbol}>{coin}/USDT</Text>
          <Text style={styles.marketMeta}>BITGET FUTURES • {timeframe}</Text>
        </View>
        <View style={styles.lastPriceWrap}>
          <Text style={styles.lastPrice}>${formatPrice(latestPrice)}</Text>
          <Text style={[styles.direction, direction === "LONG" ? styles.long : styles.short]}>
            {direction}
          </Text>
        </View>
      </View>

      <View style={styles.ohlcRow}>
        <Text style={styles.ohlc}>O <Text style={styles.ohlcValue}>{formatPrice(selected.open)}</Text></Text>
        <Text style={styles.ohlc}>H <Text style={styles.long}>{formatPrice(selected.high)}</Text></Text>
        <Text style={styles.ohlc}>L <Text style={styles.short}>{formatPrice(selected.low)}</Text></Text>
        <Text style={styles.ohlc}>C <Text style={styles.ohlcValue}>{formatPrice(selected.close)}</Text></Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.chartScroll}>
        <View style={{ width: chartWidth }}>
          <Svg width={chartWidth} height={PRICE_HEIGHT}>
            {[0, 0.25, 0.5, 0.75, 1].map((part) => {
              const gridY = TOP + part * (PRICE_HEIGHT - TOP - BOTTOM);
              const gridPrice = max - part * range;
              return (
                <G key={part}>
                  <Line x1={LEFT} x2={chartWidth - RIGHT} y1={gridY} y2={gridY} stroke="#1E293B" />
                  <SvgText x={chartWidth - RIGHT + 5} y={gridY + 3} fill="#64748B" fontSize="8">
                    {formatPrice(gridPrice)}
                  </SvgText>
                </G>
              );
            })}
            {data.map((candle, index) => {
              const center = x(index);
              const color = candle.close >= candle.open ? "#22C99A" : "#F05252";
              const bodyTop = y(Math.max(candle.open, candle.close));
              const bodyBottom = y(Math.min(candle.open, candle.close));
              return (
                <G key={`${candle.time}-${index}`}>
                  <Line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
                  <Rect x={center - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={Math.max(2, bodyBottom - bodyTop)} fill={color} rx="1" />
                </G>
              );
            })}
            {showEma && (
              <>
                <Path d={pathFrom(analytics.ema9, x, y)} fill="none" stroke="#38BDF8" strokeWidth="1.6" />
                <Path d={pathFrom(analytics.ema21, x, y)} fill="none" stroke="#FBBF24" strokeWidth="1.6" />
              </>
            )}
            {showSma && <Path d={pathFrom(analytics.sma200, x, y)} fill="none" stroke="#A855F7" strokeWidth="1.5" />}
            {drawLevel(entry, "#0284C7", "GİRİŞ")}
            {drawLevel(stop, "#DC2626", "STOP")}
            {drawLevel(tp1, "#059669", "TP1")}
            {drawLevel(tp2, "#16A34A", "TP2")}
            {drawLevel(support, "#0D9488", "DESTEK")}
            {drawLevel(resistance, "#EA580C", "DİRENÇ")}
            <Line x1={LEFT} x2={chartWidth - RIGHT} y1={y(latestPrice)} y2={y(latestPrice)} stroke="#38BDF8" strokeDasharray="2 3" />
            <Rect x={chartWidth - RIGHT + 3} y={y(latestPrice) - 10} width={RIGHT - 6} height="20" rx="4" fill="#0369A1" />
            <SvgText x={chartWidth - RIGHT + 7} y={y(latestPrice) + 4} fill="#FFF" fontSize="9" fontWeight="900">
              {formatPrice(latestPrice)}
            </SvgText>
            {selectedIndex !== null && (
              <>
                <Line x1={x(selectedPosition)} x2={x(selectedPosition)} y1={TOP} y2={PRICE_HEIGHT - BOTTOM} stroke="#94A3B8" strokeDasharray="3 3" />
                <Line x1={LEFT} x2={chartWidth - RIGHT} y1={y(selected.close)} y2={y(selected.close)} stroke="#94A3B8" strokeDasharray="3 3" />
              </>
            )}
            <Rect
              x={LEFT}
              y={TOP}
              width={plotWidth}
              height={PRICE_HEIGHT - TOP - BOTTOM}
              fill="transparent"
              onPress={(event) => {
                const locationX = Number(event?.nativeEvent?.locationX || plotWidth);
                const next = Math.max(0, Math.min(data.length - 1, Math.floor((locationX - LEFT) / slot)));
                setSelectedIndex(next);
              }}
            />
            {[0, Math.floor(data.length / 2), data.length - 1].map((index) => (
              <SvgText key={index} x={x(index) - 13} y={PRICE_HEIGHT - 5} fill="#64748B" fontSize="8">
                {formatTime(data[index].time)}
              </SvgText>
            ))}
          </Svg>

          <Svg width={chartWidth} height={VOLUME_HEIGHT}>
            <Line x1={LEFT} x2={chartWidth - RIGHT} y1="10" y2="10" stroke="#1E293B" />
            <SvgText x={LEFT} y="9" fill="#64748B" fontSize="8">HACİM</SvgText>
            {data.map((candle, index) => {
              const height = Math.max(2, (candle.volume / maxVolume) * 50);
              return (
                <Rect
                  key={index}
                  x={x(index) - bodyWidth / 2}
                  y={VOLUME_HEIGHT - height - 5}
                  width={bodyWidth}
                  height={height}
                  fill={candle.close >= candle.open ? "#0F766E" : "#991B1B"}
                  opacity="0.8"
                />
              );
            })}
          </Svg>

          <Svg width={chartWidth} height={RSI_HEIGHT}>
            <Rect x={LEFT} y="20" width={plotWidth} height="46" fill="#2E1065" opacity="0.25" />
            <Line x1={LEFT} x2={chartWidth - RIGHT} y1="20" y2="20" stroke="#64748B" strokeDasharray="4 4" />
            <Line x1={LEFT} x2={chartWidth - RIGHT} y1="66" y2="66" stroke="#64748B" strokeDasharray="4 4" />
            <Path d={pathFrom(analytics.rsi, x, (value) => 80 - (value / 100) * 72)} fill="none" stroke="#C084FC" strokeWidth="1.7" />
            <SvgText x={LEFT} y="13" fill="#C084FC" fontSize="9" fontWeight="800">RSI 14  {analytics.rsi.at(-1).toFixed(1)}</SvgText>
            <SvgText x={chartWidth - RIGHT + 8} y="23" fill="#64748B" fontSize="8">70</SvgText>
            <SvgText x={chartWidth - RIGHT + 8} y="69" fill="#64748B" fontSize="8">30</SvgText>
          </Svg>

          <Svg width={chartWidth} height={MACD_HEIGHT}>
            <Line x1={LEFT} x2={chartWidth - RIGHT} y1="48" y2="48" stroke="#334155" />
            {analytics.macd.map((value, index) => {
              const histogram = value - analytics.macdSignal[index];
              const height = Math.min(32, Math.abs(histogram / macdRange) * 70);
              return (
                <Rect
                  key={index}
                  x={x(index) - bodyWidth / 2}
                  y={histogram >= 0 ? 48 - height : 48}
                  width={bodyWidth}
                  height={height}
                  fill={histogram >= 0 ? "#10B981" : "#EF4444"}
                  opacity="0.65"
                />
              );
            })}
            <Path d={pathFrom(analytics.macd, x, (value) => 82 - ((value - macdMin) / macdRange) * 68)} fill="none" stroke="#38BDF8" strokeWidth="1.5" />
            <Path d={pathFrom(analytics.macdSignal, x, (value) => 82 - ((value - macdMin) / macdRange) * 68)} fill="none" stroke="#F59E0B" strokeWidth="1.5" />
            <SvgText x={LEFT} y="11" fill="#CBD5E1" fontSize="9" fontWeight="800">MACD 12,26,9</SvgText>
          </Svg>
        </View>
      </ScrollView>

      <View style={styles.legend}>
        <Text style={styles.ema9}>● EMA 9</Text>
        <Text style={styles.ema21}>● EMA 21</Text>
        <Text style={styles.sma}>● SMA 200</Text>
        <Text style={styles.hint}>Muma dokun: detay</Text>
      </View>
      <View style={styles.toolbar}>
        {ZOOM_LEVELS.map((level) => (
          <TouchableOpacity key={level} style={[styles.toolButton, visibleCount === level && styles.toolActive]} onPress={() => { setVisibleCount(level); setSelectedIndex(null); }}>
            <Text style={[styles.toolText, visibleCount === level && styles.toolTextActive]}>{level} mum</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.toolbar}>
        <TouchableOpacity style={[styles.toolButton, showEma && styles.toolActive]} onPress={() => setShowEma((value) => !value)}>
          <Text style={[styles.toolText, showEma && styles.toolTextActive]}>EMA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toolButton, showSma && styles.toolActive]} onPress={() => setShowSma((value) => !value)}>
          <Text style={[styles.toolText, showSma && styles.toolTextActive]}>SMA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toolButton, showLevels && styles.toolActive]} onPress={() => setShowLevels((value) => !value)}>
          <Text style={[styles.toolText, showLevels && styles.toolTextActive]}>SEVİYELER</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={() => setSelectedIndex(null)}>
          <Text style={styles.toolText}>SON MUM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#090F1C", padding: 11, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: "#243249" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  symbol: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  marketMeta: { color: "#64748B", fontSize: 9, fontWeight: "700", marginTop: 2 },
  lastPriceWrap: { alignItems: "flex-end" },
  lastPrice: { color: "#38BDF8", fontSize: 16, fontWeight: "900" },
  direction: { fontSize: 9, fontWeight: "900", marginTop: 2 },
  long: { color: "#10B981" },
  short: { color: "#F87171" },
  ohlcRow: { flexDirection: "row", gap: 9, marginTop: 9, marginBottom: 3 },
  ohlc: { color: "#64748B", fontSize: 9, fontWeight: "800" },
  ohlcValue: { color: "#CBD5E1" },
  chartScroll: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#172033" },
  legend: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 7 },
  ema9: { color: "#38BDF8", fontSize: 9, fontWeight: "800" },
  ema21: { color: "#FBBF24", fontSize: 9, fontWeight: "800" },
  sma: { color: "#C084FC", fontSize: 9, fontWeight: "800" },
  hint: { color: "#64748B", fontSize: 8, marginLeft: "auto" },
  toolbar: { flexDirection: "row", gap: 6, marginTop: 8 },
  toolButton: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 6, backgroundColor: "#111827", borderWidth: 1, borderColor: "#25334A" },
  toolActive: { backgroundColor: "#075985", borderColor: "#38BDF8" },
  toolText: { color: "#94A3B8", fontSize: 8, fontWeight: "900" },
  toolTextActive: { color: "#FFF" },
  title: { color: "#FFF", fontWeight: "800" },
  empty: { color: "#64748B", textAlign: "center", paddingVertical: 55 },
});
