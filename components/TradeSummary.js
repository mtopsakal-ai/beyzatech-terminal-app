import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function TradeSummary({ coin, direction, decision, plan, risk }) {
  const directionColor = direction === "LONG" ? "#10B981" : direction === "SHORT" ? "#F87171" : "#94A3B8";
  const statusColor = risk.hardBlock ? "#F87171" : directionColor;
  return (
    <View style={[styles.card, { borderColor: statusColor }]}> 
      <Text style={styles.title}>⚡ TEK BAKIŞTA İŞLEM ÖZETİ</Text>
      <Text style={[styles.signal, { color: statusColor }]}>{coin}/USDT • {risk.hardBlock ? "İŞLEM YOK" : direction}</Text>
      <Text style={styles.text}>Yön / giriş: %{decision.directionConfidence} / %{decision.entryQuality}</Text>
      <Text style={styles.text}>Rejim: {decision.regime}</Text>
      <Text style={styles.text}>Senaryo: {decision.setupType}</Text>
      <Text style={styles.text}>Giriş: ${Number(plan.zoneLow).toFixed(4)} – ${Number(plan.zoneHigh).toFixed(4)}</Text>
      <Text style={styles.text}>Stop: ${Number(plan.stop).toFixed(4)} • TP1: ${Number(plan.tp1).toFixed(4)}</Text>
      <Text style={styles.text}>Uygulanan risk: %{risk.appliedRiskPercent.toFixed(2)} • Pozisyon: {risk.positionValue.toFixed(2)} USDT</Text>
      <Text style={risk.hardBlock ? styles.block : styles.note}>{risk.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 14, marginTop: 10, borderRadius: 10, borderWidth: 1 },
  title: { color: "#38BDF8", fontSize: 14, fontWeight: "900", marginBottom: 7 },
  signal: { fontSize: 19, fontWeight: "900", marginBottom: 5 },
  text: { color: "#E2E8F0", fontSize: 11, lineHeight: 18 },
  note: { color: "#10B981", fontSize: 9, marginTop: 6 },
  block: { color: "#F87171", fontSize: 9, marginTop: 6, fontWeight: "900" },
});
