import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function StrengthGauge({ score = 50, direction = "NÖTR" }) {
  const safeScore = clamp(Number(score) || 0, 0, 100);
  const angle = Math.PI - (safeScore / 100) * Math.PI;
  const centerX = 100;
  const centerY = 92;
  const needleLength = 62;
  const needleX = centerX + Math.cos(angle) * needleLength;
  const needleY = centerY - Math.sin(angle) * needleLength;
  const label =
    safeScore >= 75 ? "GÜÇLÜ" : safeScore >= 60 ? "POZİTİF" : safeScore >= 45 ? "NÖTR" : "ZAYIF";
  const color =
    direction === "LONG" ? "#10B981" : direction === "SHORT" ? "#EF4444" : "#FBBF24";

  return (
    <View style={styles.wrap}>
      <Svg width="200" height="105" viewBox="0 0 200 105">
        <Path d="M22 92 A78 78 0 0 1 62 24" fill="none" stroke="#EF4444" strokeWidth="16" />
        <Path d="M62 24 A78 78 0 0 1 138 24" fill="none" stroke="#FBBF24" strokeWidth="16" />
        <Path d="M138 24 A78 78 0 0 1 178 92" fill="none" stroke="#10B981" strokeWidth="16" />
        <G>
          <Line x1={centerX} y1={centerY} x2={needleX} y2={needleY} stroke="#38BDF8" strokeWidth="4" />
          <Circle cx={centerX} cy={centerY} r="7" fill="#E2E8F0" stroke="#0F172A" strokeWidth="3" />
        </G>
      </Svg>
      <Text style={[styles.score, { color }]}>{safeScore}%</Text>
      <Text style={styles.label}>{label} • {direction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", minWidth: 205 },
  score: { fontSize: 24, fontWeight: "900", marginTop: -6 },
  label: { color: "#94A3B8", fontSize: 11, fontWeight: "800", marginTop: 2 },
});
