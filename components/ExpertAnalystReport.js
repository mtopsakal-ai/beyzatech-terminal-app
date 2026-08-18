import React from "react";
import { View, Text, StyleSheet } from "react-native";

const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(4)}` : "—";

export default function ExpertAnalystReport({ coin, direction, status, decision = {}, plan = {}, rows = [] }) {
  const expectedTrend = direction === "LONG" ? "YUKARI" : direction === "SHORT" ? "AŞAĞI" : "NÖTR";
  const available = rows.filter((row) => row.available);
  const aligned = available.filter((row) => row.trend === expectedTrend).length;
  const ready = String(status || "").includes("HAZIR");
  const conflicts = available.length - aligned;
  const setup = decision.setupType || "NET KURULUM YOK";

  return (
    <View style={[styles.card, { borderColor: ready ? "#10B981" : "#FBBF24" }]}>
      <View style={styles.header}>
        <Text style={styles.title}>📜 UZMAN ANALİST RAPORU</Text>
        <Text style={[styles.badge, { color: ready ? "#10B981" : "#FBBF24" }]}>{status || "BEKLE"}</Text>
      </View>
      <Text style={styles.report}>
        {coin}/USDT için {decision.regime || "belirsiz"} piyasa rejimi izleniyor. {setup} senaryosu değerlendiriliyor.
        {` ${available.length || 0} zaman diliminin ${aligned} tanesi ${direction || "NÖTR"} yönünü destekliyor.`}
      </Text>
      <Text style={styles.opinion}>
        💡 Sistem görüşü: {ready ? "Giriş ve güvenlik koşulları uyumlu; emir öncesi risk sınırlarını koruyun." : "Tüm koşullar tamamlanmadığı için izleme modunda kalın."}
      </Text>
      <View style={styles.divider} />
      <Text style={styles.target}>🎯 Hedef senaryo: Bölge {money(plan.zoneLow)} – {money(plan.zoneHigh)}, geçersizlik {money(plan.invalidation)}.</Text>
      {conflicts > 0 && <Text style={styles.warning}>⚠️ {conflicts} zaman diliminde yön çatışması bulunuyor.</Text>}
      <Text style={styles.disclaimer}>Otomatik teknik değerlendirmedir; yatırım tavsiyesi değildir.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 15, marginTop: 10, borderRadius: 12, borderWidth: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { color: "#38BDF8", fontSize: 16, fontWeight: "800", flex: 1 },
  badge: { fontSize: 11, fontWeight: "900", textAlign: "right" },
  report: { color: "#E2E8F0", fontSize: 14, lineHeight: 22, marginTop: 12 },
  opinion: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", lineHeight: 20, marginTop: 10 },
  divider: { height: 1, backgroundColor: "#253148", marginVertical: 12 },
  target: { color: "#FBBF24", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  warning: { color: "#F87171", fontSize: 12, marginTop: 8 },
  disclaimer: { color: "#64748B", fontSize: 10, marginTop: 10 },
});
