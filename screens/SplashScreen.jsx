
// SplashScreen.js
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { initAndSaveFcmToken } from "../utils/fcm";

const { width } = Dimensions.get("window");

export default function SplashScreen({ navigation }) {
  // Main animations
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loaderWidth = useRef(new Animated.Value(0)).current;

  // underline + text animation
  const lineAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(lineAnim, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.timing(loaderWidth, {
      toValue: 1,
      duration: 2400,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const timeout = setTimeout(async () => {
      try {
        const deliveryPartner = await AsyncStorage.getItem("delivery_partner");
        if (deliveryPartner) {
          navigation.replace("DeliveryHome");
          return;
        }
        const token = await AsyncStorage.getItem("token");
        const user = await AsyncStorage.getItem("user");
        if (token && user) {
          initAndSaveFcmToken();
          navigation.replace("Resturent");
        } else {
          navigation.replace("Home");
        }
      } catch {
        navigation.replace("Login");
      }
    }, 2800);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#F7CB45" barStyle="dark-content" />

      <SafeAreaView style={styles.safeArea}>
        {/* CENTER CONTENT (Logo) - Moved to absolute to ensure perfect centering */}
        <View style={styles.center} pointerEvents="none">
          <Animated.View
            style={{
              opacity: opacityAnim,
              alignItems: "center",
              transform: [{ scale: scaleAnim }],
            }}
          >
            {/* TEXT LOGO */}
            <Animated.View
              style={{
                flexDirection: "row",
                opacity: textOpacity,
                transform: [{ translateY: textTranslateY }],
              }}
            >
              <Text style={styles.crispy}>Crispy</Text>
              <Text style={styles.dosa}>Dosa</Text>
            </Animated.View>

            {/* 🆕 ANIMATED LINE BELOW TEXT */}
            <Animated.View
              style={[
                styles.underline,
                {
                  width: lineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, width * 0.42],
                  }),
                },
              ]}
            />

            {/* TAGLINE */}
            <Text style={styles.tagline}>Pure Veg. Freshly Made.</Text>
          </Animated.View>
        </View>

        {/* Spacer to keep bottom content at the bottom */}
        <View style={{ flex: 1 }} />

        {/* BOTTOM COMPANY TEXT */}
        <Animated.View style={[styles.bottomInfo, { opacity: textOpacity }]}>
          <Text style={styles.eternal}>WHERE TRADITION MEETS TASTE</Text>
        </Animated.View>

        {/* LOADER */}
        <View style={styles.footer}>
          <View style={styles.loaderTrack}>
            <Animated.View
              style={[
                styles.loaderFill,
                {
                  width: loaderWidth.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7CB45",
  },
  safeArea: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    paddingBottom: 60, // Nudge the logo up slightly
  },

  // 🔑 UPDATED COLOR FOR CRISPY
  crispy: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 50,
    color: "#C62828", // 🔴 dark red / orange tone
    letterSpacing: -1.5,
  },

  dosa: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 50,
    color: "#3E863F",
    marginLeft: 0,
    letterSpacing: -1.5,
  },

  underline: {
    height: 3,
    backgroundColor: "#1C1C1C",
    borderRadius: 6,
    marginTop: 0,
    marginBottom: 10,
  },

  tagline: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 18,
    color: "#1C1C1C",
    letterSpacing: -0.2,
    marginTop: 2,
  },

  bottomInfo: {
    alignItems: "center",
    marginBottom: 20, // Reduced to move text closer to loader
  },

  eternal: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: "#1C1C1C",
    letterSpacing: 4,
  },

  footer: {
    paddingBottom: 110, // Increased to move below content up
    alignItems: "center",
  },

  loaderTrack: {
    width: 52,
    height: 3,
    backgroundColor: "rgba(28,28,28,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },

  loaderFill: {
    height: "100%",
    backgroundColor: "#1C1C1C",
  },
});
