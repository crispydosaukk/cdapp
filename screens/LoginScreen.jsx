import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Ionicons from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { checkPhoneNumberExists, sendMsg91Otp, verifyMsg91Otp, loginUserWithPhone } from "../services/authService";
import messaging from "@react-native-firebase/messaging";
import { saveFcmToken } from "../services/notificationService";

const { width } = Dimensions.get("window");
const scale = width / 400;

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [fullName, setFullName] = useState("");
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (otp.length === 4 && !loading) {
      handleVerifyOtp();
    }
  }, [otp]);

  // Premium Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("info");
  const [alertBtnText, setAlertBtnText] = useState("Ok");
  const [alertAction, setAlertAction] = useState(null);
  const alertScale = React.useRef(new Animated.Value(0)).current;

  const showPremiumAlert = (title, msg, type = "info", btnText = "Ok", action = null) => {
    setAlertTitle(title);
    setAlertMsg(msg);
    setAlertType(type);
    setAlertBtnText(btnText);
    setAlertAction(() => action);
    setAlertVisible(true);
    Animated.spring(alertScale, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const hidePremiumAlert = () => {
    Animated.timing(alertScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setAlertVisible(false));
  };

  const handleContinue = async () => {
    if (!phone) {
      showPremiumAlert("Error", "Please enter your Mobile Number", "error");
      return;
    }
    
    let userPhone = phone.trim();
    if (userPhone.startsWith('0')) {
      userPhone = userPhone.substring(1);
    }
    const cleanPhone = `+44${userPhone}`;
    if (userPhone.length !== 10) {
      showPremiumAlert("Invalid Input", "Please enter a valid UK Mobile Number", "error");
      return;
    }

    setLoading(true);
    try {
      const check = await checkPhoneNumberExists(cleanPhone);
      if (!check.exists) {
        setLoading(false);
        showPremiumAlert(
          "Account Not Found",
          "You don't have an account. Please create an account to continue.",
          "info",
          "Create Account",
          () => navigation.navigate("Signup", { phoneNumber: cleanPhone })
        );
        return;
      }
      
      await sendMsg91Otp(cleanPhone);
      setShowOtp(true);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      if (e.message === "Could not verify phone number.") {
        showPremiumAlert("Firebase Permission Denied", "Cannot access the database. Please update your Firestore Security Rules to allow reads on the 'customers' collection.", "error");
      } else {
        showPremiumAlert("Error", e.message, "error");
      }
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      showPremiumAlert("Error", "Please enter the OTP", "error");
      return;
    }
    
    let userPhone = phone.trim();
    if (userPhone.startsWith('0')) {
      userPhone = userPhone.substring(1);
    }
    const cleanPhone = `+44${userPhone}`;

    setLoading(true);
    try {
      await verifyMsg91Otp(cleanPhone, otp.trim());
      
      const { user } = await loginUserWithPhone(cleanPhone);

      /* =======================
        🔔 STEP 6.3 – FCM TOKEN
      ======================= */
      messaging().getToken().then(fcmToken => {
        if (fcmToken && user?.id) {
          saveFcmToken({
            userType: "customer",
            userId: user.id,
            token: fcmToken
          }).catch(console.log);
        }
      }).catch(err => console.log("FCM Token fetch failed:", err));
      /* ======================= */

      setFullName(user.full_name || "Guest");
      setSuccessVisible(true);

      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        setSuccessVisible(false);
        navigation.replace("Resturent");
      }, 2500);

    } catch (e) {
      showPremiumAlert("Login Failed", e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>

          {/* TOP GREEN WAVE */}
          <LinearGradient
            colors={["#1d8f52", "#27b36a", "#41d48a"]}
            style={styles.topWave}
          />

          {/* LOGO */}
          <View style={styles.logoWrap}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
            />
          </View>

          {/* MAIN CARD AREA */}
          <View style={styles.card}>
            <Text style={styles.title}>Hello 👋</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>

            {!showOtp ? (
              <>
                <View style={styles.box}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="call-outline" size={20} color="#1f4d35" />
                    <Text style={{ fontSize: 15, color: '#1f4d35', marginLeft: 8, fontWeight: 'bold' }}>🇬🇧 +44</Text>
                    <TextInput
                      placeholder="Enter mobile number"
                      placeholderTextColor="#88a796"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                      style={styles.input}
                      maxLength={11}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    We will send an OTP to verify your number.
                  </Text>
                </View>

                <TouchableOpacity style={styles.loginBtn} onPress={handleContinue}>
                  <LinearGradient
                    colors={["#1a8b50", "#21a863", "#34c87c"]}
                    style={styles.loginGradient}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.loginText}>Continue</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.bottomText}>
                  Don’t have an account?{" "}
                  <Text
                    style={styles.signup}
                    onPress={() => navigation.navigate("Signup")}
                  >
                    Register Now
                  </Text>
                </Text>
              </>
            ) : (
              <>
                <View style={styles.box}>
                  <Text style={styles.label}>Enter OTP</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="keypad-outline" size={20} color="#1f4d35" />
                    <TextInput
                      placeholder="Enter 4 digit OTP"
                      placeholderTextColor="#88a796"
                      keyboardType="number-pad"
                      value={otp}
                      onChangeText={setOtp}
                      style={styles.input}
                      maxLength={4}
                    />
                  </View>
                  <TouchableOpacity style={styles.forgotBtn} onPress={() => setShowOtp(false)}>
                    <Text style={styles.forgotText}>Change Mobile Number?</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={styles.loginBtn} 
                  onPress={handleVerifyOtp}
                  disabled={otp.length !== 4 || loading}
                >
                  <LinearGradient
                    colors={otp.length === 4 ? ["#1a8b50", "#21a863", "#34c87c"] : ["#94A3B8", "#64748B"]}
                    style={styles.loginGradient}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.loginText}>Verify & Login</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* BOTTOM GREEN WAVE */}
          <LinearGradient
            colors={["#1d8f52", "#27b36a", "#41d48a"]}
            style={styles.bottomWave}
          />

        </View>
      </KeyboardAvoidingView>

      {/* PREMIUM SUCCESS MODAL */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[
            styles.successCard,
            { transform: [{ scale: scaleAnim }] }
          ]}>
            <LinearGradient
              colors={["#16a34a", "#15803d"]}
              style={styles.successGradient}
            >
              <View style={styles.checkRing}>
                <Ionicons name="checkmark" size={50 * scale} color="#FFF" />
              </View>

              <Text style={styles.successTitle}>Logged In!</Text>
              <Text style={styles.successMsg}>
                Welcome back, {fullName}!
              </Text>

              <Text style={styles.enjoyText}>
                Enjoy ordering your favorite meals 😋
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* PREMIUM ALERT MODAL */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <Animated.View style={[styles.alertCard, { transform: [{ scale: alertScale }] }]}>
            <LinearGradient
              colors={alertType === 'error' ? ["#FFF5F5", "#FFFFFF"] : ["#F0FDF4", "#FFFFFF"]}
              style={styles.alertContent}
            >
              <View style={[styles.alertIconRing, { backgroundColor: alertType === 'error' ? '#FEE2E2' : '#DCFCE7' }]}>
                <Ionicons
                  name={alertType === 'error' ? "close-circle" : "information-circle"}
                  size={40}
                  color={alertType === 'error' ? "#EF4444" : "#16A34A"}
                />
              </View>
              <Text style={styles.alertTitleText}>{alertTitle}</Text>
              <Text style={styles.alertMsgText}>{alertMsg}</Text>
              <TouchableOpacity style={styles.alertBtn} onPress={() => {
                hidePremiumAlert();
                if (alertAction) {
                  setTimeout(alertAction, 300);
                }
              }}>
                <LinearGradient
                  colors={alertType === 'error' ? ["#EF4444", "#DC2626"] : ["#16A34A", "#15803D"]}
                  style={styles.alertBtnGrad}
                >
                  <Text style={styles.alertBtnText}>{alertBtnText}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

/* ====================== STYLES ====================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },

  topWave: {
    height: "32%",
    width: "140%",
    borderBottomLeftRadius: 220,
    borderBottomRightRadius: 220,
    position: "absolute",
    top: -100,
    alignSelf: "center",
  },

  bottomWave: {
    height: "28%",
    width: "140%",
    borderTopLeftRadius: 220,
    borderTopRightRadius: 220,
    position: "absolute",
    bottom: -100,
    alignSelf: "center",
  },

  logoWrap: {
    marginTop: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: 180,
    height: 90,
    resizeMode: "contain",
  },

  card: {
    flex: 1,
    paddingHorizontal: 28,
    marginTop: 20,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1f4d35",
  },

  subtitle: {
    fontSize: 15,
    color: "#4a7f65",
    marginBottom: 30,
  },

  box: { marginBottom: 20 },

  label: {
    color: "#1f4d35",
    marginBottom: 6,
    fontWeight: "600",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5ee",
    borderRadius: 12,
    paddingHorizontal: 12,
  },

  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#000",
    marginLeft: 8,
  },

  helperText: {
    color: "#4a7f65",
    fontSize: 13,
    marginTop: 5,
  },

  forgotBtn: { alignSelf: "flex-end", marginTop: 4 },
  forgotText: { color: "#1a8b50", fontWeight: "600" },

  loginBtn: { marginTop: 10 },

  loginGradient: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },

  loginText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },

  bottomText: {
    textAlign: "center",
    marginTop: 25,
    color: "#2c6e49",
    fontSize: 15,
  },

  signup: {
    color: "#1a8b50",
    fontWeight: "800",
    textDecorationLine: "underline",
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  successCard: {
    width: "85%",
    borderRadius: 30,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  successGradient: {
    padding: 30,
    alignItems: "center",
  },
  checkRing: {
    width: 90 * (Dimensions.get("window").width / 400),
    height: 90 * (Dimensions.get("window").width / 400),
    borderRadius: 45 * (Dimensions.get("window").width / 400),
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
  },
  successTitle: {
    fontSize: 28 * (Dimensions.get("window").width / 400),
    fontFamily: "PoppinsBold",
    color: "#FFF",
    fontWeight: "900",
    marginBottom: 5,
  },
  successMsg: {
    fontSize: 18 * (Dimensions.get("window").width / 400),
    fontFamily: "PoppinsSemiBold",
    color: "#FFF",
    textAlign: "center",
    opacity: 0.9,
    marginBottom: 15,
  },
  successBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 20,
  },
  successBadgeText: {
    fontSize: 10 * (Dimensions.get("window").width / 400),
    fontFamily: "PoppinsBold",
    color: "#15803d",
    letterSpacing: 1,
  },
  enjoyText: {
    fontSize: 14 * (Dimensions.get("window").width / 400),
    fontFamily: "PoppinsMedium",
    color: "#FFF",
    opacity: 0.8,
    textAlign: "center",
  },

  /* ALERT STYLES */
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertCard: {
    width: "85%",
    borderRadius: 30,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  alertContent: {
    padding: 30,
    alignItems: "center",
  },
  alertIconRing: {
    width: 80 * scale,
    height: 80 * scale,
    borderRadius: 40 * scale,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  alertTitleText: {
    fontSize: 22 * scale,
    fontFamily: "PoppinsBold",
    color: "#0F172A",
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  alertMsgText: {
    fontSize: 14 * scale,
    fontFamily: "PoppinsMedium",
    color: "#475569",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 22 * scale,
  },
  alertBtn: {
    width: "100%",
    borderRadius: 15,
    overflow: "hidden",
  },
  alertBtnGrad: {
    paddingVertical: 14,
    alignItems: "center",
  },
  alertBtnText: {
    fontSize: 15 * scale,
    fontFamily: "PoppinsBold",
    color: "#FFF",
    fontWeight: "800",
  },
});
