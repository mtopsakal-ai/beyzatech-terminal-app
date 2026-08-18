import React from "react";
import { View, Text, StyleSheet } from "react-native";

const COLORS = { AL: "#10B981", SAT: "#F87171", "NÖTR": "#FBBF24" };

const finite = (value) => Number.isFinite(Number(value));

function signalFor(type, value, otherValue) {
  if (!finite(value) || (type === "EMA" && !finite(otherValue))) return "NÖTR";
  if (type === "EMA") return Number(value) > Number(otherValue) ? "AL" : Number(value) < Number(otherValue) ? "SAT" : "NÖTR";
  if (type === "RSI") return Number(value) >= 55 ? "AL" : Number(value) <= 45 ? "SAT" : "NÖTR";
  return Number(value) > 0 ? "AL" : Number(value) < 0 ? "SAT" : "NÖTR";
}

function Indicator({ label, value, signal }) {
  return (
    <View style={styles.indicatorRow}>
      <Text style={styles.indicatorLabel}>{label}</Text>
      <Text style={[styles.signal, { color: COLORS[signal] }]}>{value} · {signal}</Text>
    </View>
  );
}

export default function SmartMoneyAnalysis({ rows = [] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🧠 SMART MONEY / GÖSTERGE MATRİSİ</Text>
      <View style={styles.grid}>
        {rows.map((row) => {
          const data = row?.indicators;
          const emaSignal = signalFor("EMA", data?.ema9, data?.ema21);
          const rsiSignal = signalFor("RSI", data?.rsi);
          const macdSignal = signalFor("MACD", data?.macdHistogram);
          const volumeSignal = signalFor("VOLUME", data?.volumeChange);
          return (
            <View key={row.timeframe} style={styles.item}>
              <Text style={styles.timeframe}>{row.label || row.timeframe}</Text>
              {!row.available || !data ? (
                <Text style={styles.muted}>Veri kullanılamıyor</Text>
              ) : (
                <>
                  <Indicator label="EMA 9/21" value={emaSignal === "AL" ? "YUKARI" : emaSignal === "SAT" ? "AŞAĞI" : "EŞİT"} signal={emaSignal} />
                  <Indicator label="RSI" value={finite(data.rsi) ? Number(data.rsi).toFixed(1) : "—"} signal={rsiSignal} />
                  <Indicator label="MACD" value={finite(data.macdHistogram) ? Number(data.macdHistogram).toFixed(3) : "—"} signal={macdSignal} />
                  <Indicator label="Hacim" value={finite(data.volumeChange) ? `%${Number(data.volumeChange).toFixed(1)}` : "—"} signal={volumeSignal} />
                </>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.note}>Bu matris teknik gösterge uyumunu gösterir; gerçek balina işleminin kanıtı değildir.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 15, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#1E293B" },
  title: { color: "#38BDF8", fontSize: 16, fontWeight: "800", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  item: { width: "48.5%", backgroundColor: "#0B1220", padding: 10, borderRadius: 9, borderWidth: 1, borderColor: "#243147", marginBottom: 10 },
  timeframe: { color: "#E2E8F0", fontWeight: "800", fontSize: 13, marginBottom: 7 },
  indicatorRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 3 },
  indicatorLabel: { color: "#94A3B8", fontSize: 10 },
  signal: { fontSize: 10, fontWeight: "800" },
  muted: { color: "#64748B", fontSize: 11 },
  note: { color: "#64748B", fontSize: 10, lineHeight: 15, marginTop: 2 },
});
