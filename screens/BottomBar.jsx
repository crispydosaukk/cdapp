import React from "react";
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const scale = width / 400;

export default function BottomBar({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      {/* HOME */}
      <TouchableOpacity style={styles.tabButton} onPress={() => navigation.navigate("Home")}>
        <Ionicons name="home-outline" size={24 * scale} color="#333" />
        <Text style={styles.label}>Home</Text>
      </TouchableOpacity>

      {/* ORDERS */}
      <TouchableOpacity style={styles.tabButton} onPress={() => navigation.navigate("Orders")}>
        <Ionicons name="receipt-outline" size={24 * scale} color="#333" />
        <Text style={styles.label}>Orders</Text>
      </TouchableOpacity>

      {/* QR SCAN (Hidden)
      <TouchableOpacity style={styles.qrButton} onPress={() => navigation.navigate("Scanner")}>
        <Ionicons name="qr-code-outline" size={26 * scale} color="#fff" />
      </TouchableOpacity>
      */}

      {/* CREDITS */}
      <TouchableOpacity style={styles.tabButton} onPress={() => navigation.navigate("Credits")}>
        <Ionicons name="wallet-outline" size={24 * scale} color="#333" />
        <Text style={styles.label}>Credits</Text>
      </TouchableOpacity>

      {/* PROFILE */}
      <TouchableOpacity style={styles.tabButton} onPress={() => navigation.navigate("Profile")}>
        <Ionicons name="person-outline" size={24 * scale} color="#333" />
        <Text style={styles.label}>Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: "#fff", borderTopWidth: 0.4, borderColor: "#e2e2e2", elevation: 10, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  container: {}, // not used now, kept if you want later
  tabButton: { alignItems: "center", justifyContent: "center", width: width * 0.25, paddingTop: 8, paddingBottom: 6 },
  label: { fontSize: 11 * scale, marginTop: 2, color: "#444", fontWeight: "500" },
  qrButton: { width: 52, height: 52, borderRadius: 30, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center", marginBottom: 6, elevation: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});
