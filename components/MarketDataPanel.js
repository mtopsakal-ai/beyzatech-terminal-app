import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function MarketDataPanel({ openInterest, funding, accountRatio, takerFlow, volume, availability }) {
  const availabilityValues = availability && typeof availability === "object"
    ? Object.values(availability)
    : [Boolean(availability)];
  const availableCount = availabilityValues.filter(Boolean).length;
  const isLive = availabilityValues.length > 0 && availableCount === availabilityValues.length;
  const isPartial = availableCount > 0 && !isLive;
  const dataStatus = isLive ? "CANLI" : isPartial ? "KISMİ" : "VERİ YOK";
  const headerStatus = isLive ? "REAL-TIME" : isPartial ? "KISMİ VERİ" : "VERİ YOK";
  const statusColor = isLive ? "#10B981" : isPartial ? "#FBBF24" : "#EF4444";

  const items = [
    ["Açık faiz", openInterest], ["Fonlama", funding],
    ["Hesap L/S", accountRatio], ["Taker akışı", takerFlow],
    ["Hacim değişimi", volume], ["Durum", dataStatus],
  ];
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 MARKET DATA</Text>
        <Text style={[styles.status, { color: statusColor }]}>{headerStatus}</Text>
      </View>
      <View style={styles.grid}>
        {items.map(([label, value]) => (
          <View key={label} style={styles.item}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value || "—"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 15, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#1E293B" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { color: "#38BDF8", fontSize: 16, fontWeight: "800" },
  status: { fontSize: 10, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  item: { width: "48.5%", backgroundColor: "#0B1220", padding: 11, borderRadius: 8, marginBottom: 8 },
  label: { color: "#64748B", fontSize: 10, marginBottom: 5 },
  value: { color: "#E2E8F0", fontSize: 13, fontWeight: "800" },
});
