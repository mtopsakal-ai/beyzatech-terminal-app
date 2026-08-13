import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function TimeframeMatrix({ matrix }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>🧭 ÇOKLU ZAMAN MATRİSİ</Text>
        <Text style={matrix.hardConflict ? styles.bad : styles.good}>AĞIRLIKLI UYUM %{matrix.score}</Text>
      </View>
      <View style={styles.grid}>
        {matrix.rows.map((item) => {
          const color = item.trend === "YUKARI" ? "#10B981" : item.trend === "AŞAĞI" ? "#F87171" : "#94A3B8";
          return (
            <View key={item.timeframe} style={styles.box}>
              <Text style={styles.tf}>{item.label}</Text>
              <Text style={{ color, fontSize: 10, fontWeight: "900" }}>{item.available === false ? "VERİ YOK" : item.trend}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.regimeRow}>
        <Text style={matrix.hardConflict ? styles.bad : styles.regime}>{matrix.state}</Text>
        <Text style={styles.risk}>RİSK x{Number(matrix.riskMultiplier || 0).toFixed(2)}</Text>
      </View>
      <Text style={matrix.hardConflict ? styles.warning : styles.note}>{matrix.hardConflict ? "⚠ " : "ℹ "}{matrix.warning}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 13, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: "#1E293B" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#38BDF8", fontSize: 14, fontWeight: "900" },
  good: { color: "#10B981", fontSize: 10, fontWeight: "900" },
  bad: { color: "#F87171", fontSize: 10, fontWeight: "900" },
  grid: { flexDirection: "row", gap: 6, marginTop: 9 },
  box: { flex: 1, backgroundColor: "#0B1220", borderRadius: 7, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#1E293B" },
  tf: { color: "#94A3B8", fontSize: 9, fontWeight: "900", marginBottom: 3 },
  warning: { color: "#FCA5A5", fontSize: 9, marginTop: 7 },
  note: { color: "#94A3B8", fontSize: 9, marginTop: 7 },
  regimeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  regime: { color: "#38BDF8", fontSize: 10, fontWeight: "900" },
  risk: { color: "#FBBF24", fontSize: 9, fontWeight: "900" },
});
