import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function AIComment({ data }) {
  const score = Number(data?.score || 0);
  const scoreColor = score >= 75 ? "#10B981" : score >= 55 ? "#FBBF24" : "#F87171";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 AI ANALİZ MOTORU</Text>
        <Text style={[styles.score, { color: scoreColor }]}>{score}/100</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: scoreColor }]} />
      </View>

      <Text style={styles.text}>{data?.comment || "Analiz bekleniyor."}</Text>

      {!!data?.factors?.length && (
        <View style={styles.factors}>
          {data.factors.map((factor, index) => (
            <View style={styles.factor} key={`${factor.label}-${index}`}>
              <Text style={styles.factorLabel}>{factor.label}</Text>
              <Text style={{ color: factor.positive ? "#10B981" : "#F87171", fontWeight: "700" }}>
                {factor.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 15, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: "#1E293B" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#38BDF8", fontWeight: "800", fontSize: 15 },
  score: { fontSize: 16, fontWeight: "800" },
  track: { height: 7, borderRadius: 4, backgroundColor: "#1E293B", overflow: "hidden", marginTop: 11 },
  fill: { height: 7, borderRadius: 4 },
  text: { color: "#FFF", marginTop: 12, lineHeight: 21 },
  factors: { borderTopWidth: 1, borderTopColor: "#1E293B", marginTop: 12, paddingTop: 8 },
  factor: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  factorLabel: { color: "#94A3B8", fontSize: 13 },
});
