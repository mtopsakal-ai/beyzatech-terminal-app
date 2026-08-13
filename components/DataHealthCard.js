import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function DataHealthCard({ health }) {
  const color = health.blocked ? "#F87171" : health.score >= 80 ? "#10B981" : "#FBBF24";
  return (
    <View style={[styles.card, { borderColor: color }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📡 VERİ SAĞLIĞI</Text>
        <Text style={[styles.score, { color }]}>%{health.score}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Canlı akış</Text>
        <Text style={{ color }}>{health.socketState}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Son veri yaşı</Text>
        <Text style={{ color }}>{health.ageSeconds}s</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Kaynak</Text>
        <Text style={styles.value}>{health.source}</Text>
      </View>
      <Text style={styles.note}>{health.blocked ? "Gecikmiş veya eksik veri nedeniyle yeni işlem engellendi." : "Canlı akış sağlıklı; REST taraması yedek doğrulama olarak çalışıyor."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 13, marginTop: 10, borderRadius: 10, borderWidth: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  title: { color: "#38BDF8", fontWeight: "900", fontSize: 14 },
  score: { fontWeight: "900", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  label: { color: "#94A3B8", fontSize: 11 },
  value: { color: "#E2E8F0", fontSize: 11, fontWeight: "800" },
  note: { color: "#64748B", fontSize: 9, lineHeight: 14, marginTop: 6 },
});
