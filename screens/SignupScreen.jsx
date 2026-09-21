// screens/SignupScreen.jsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Platform,
  StatusBar,
  ScrollView,
  Dimensions,
  Modal,
  Animated,
  ActivityIndicator,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { registerUser } from "../services/authService";
import { fetchRestaurants } from "../services/restaurantService";
import { fetchAppSettings } from "../services/settingsService";

const { width } = Dimensions.get("window");
const scale = width / 400;

export default function SignupScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredRestaurant, setPreferredRestaurant] = useState("");
  const [dob, setDob] = useState(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [gender, setGender] = useState("");

  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Premium Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("info");
  const alertScale = React.useRef(new Animated.Value(0)).current;

  // Success Modal State
  const [successVisible, setSuccessVisible] = useState(false);
  const successScale = React.useRef(new Animated.Value(0)).current;

  // PREMIUM OFFER ANIMATION START
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [textIndex, setTextIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await fetchAppSettings();
      if (data) {
        setSettings(data);
      }
    };
    loadSettings();

    // Pre-fill phone if coming from Login
    if (navigation.getState().routes) {
      const currentRoute = navigation.getState().routes.find(r => r.name === 'Signup');
      if (currentRoute?.params?.phoneNumber) {
        let incomingPhone = currentRoute.params.phoneNumber;
        if (incomingPhone.startsWith('+44')) {
          incomingPhone = incomingPhone.substring(3);
        } else {
          incomingPhone = incomingPhone.replace('+', '');
        }
        setPhone(incomingPhone);
      }
    }
  }, []);

  const offers = [
    { colors: ["#FF416C", "#FF4B2B"], textColor: "#FFFFFF", icon: "flash" },
    { colors: ["#1D976C", "#93F9B9"], textColor: "#004D40", icon: "leaf" },
    { colors: ["#F2994A", "#F2C94C"], textColor: "#5D4037", icon: "wallet" },
  ];

  const animatedTexts = settings ? [
    `EARN £${Number(settings.earn_per_order_amount).toFixed(2)} ON EVERY ORDER`,
    `REFER & EARN £${Number(settings.referral_bonus_amount).toFixed(2)}`,
    `£${Number(settings.signup_bonus_amount).toFixed(2)} WELCOME BONUS`,
  ] : [];

  useEffect(() => {
    const animate = () => {
      if (animatedTexts.length === 0) return;
      fadeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTextIndex((p) => {
          const next = (p + 1) % animatedTexts.length;
          setActiveIndex(next % offers.length);
          return next;
        });
        animate();
      });
    };
    animate();
  }, [animatedTexts.length]);

  const highlightAmount = (text) => {
    if (!settings) return <Text style={styles.offerText}>{text}</Text>;
    const regex = new RegExp(`(£\\s?${Number(settings.signup_bonus_amount).toFixed(2)}|£${Number(settings.signup_bonus_amount).toFixed(2)}|£\\s?${Number(settings.referral_bonus_amount).toFixed(2)}|£${Number(settings.referral_bonus_amount).toFixed(2)}|£\\s?${Number(settings.earn_per_order_amount).toFixed(2)}|£${Number(settings.earn_per_order_amount).toFixed(2)})`, 'i');
    const parts = text.split(regex);
    return (
      <Text style={[styles.offerText, { color: "#FFFFFF" }]} numberOfLines={1}>
        {parts[0]}
        {parts[1] && (
          <Text style={styles.offerAmount}>{parts[1]}</Text>
        )}
        {parts[2]}
      </Text>
    );
  };
  // PREMIUM OFFER ANIMATION END

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await fetchRestaurants();
        if (isMounted) setRestaurants(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setRestaurantsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const validateForm = () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!name.trim()) return "Full name is required.";
    if (!email.trim()) return "Email is required.";
    if (!emailRegex.test(email.trim())) return "Enter valid Gmail address (@gmail.com).";
    if (!phone.trim()) return "Phone number is required.";
    if (!preferredRestaurant) return "Select your preferred restaurant.";
    if (!dob) return "Please select your Date of Birth.";
    if (!termsAccepted) return "Please accept Terms & Conditions.";
    return null;
  };

  const showPremiumAlert = (title, msg, type = "info") => {
    setAlertTitle(title);
    setAlertMsg(msg);
    setAlertType(type);
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

  const handleSignup = async () => {
    const err = validateForm();
    if (err) return showPremiumAlert("Required", err, "info");

    let userPhone = phone.trim().replace(/\s+/g, '');
    if (userPhone.startsWith('+44')) userPhone = userPhone.substring(3);
    if (userPhone.startsWith('44')) userPhone = userPhone.substring(2);
    if (userPhone.startsWith('0')) userPhone = userPhone.substring(1);
    if (userPhone.length !== 10) {
      return showPremiumAlert("Invalid Input", "Please enter a valid UK Mobile Number", "error");
    }

    setLoading(true);
    try {
      await registerUser({
        full_name: name.trim(),
        email: email.trim(),
        mobile_number: `+44${userPhone}`,
        country_code: `+44`,
        preferred_restaurant: preferredRestaurant,
        date_of_birth: dob ? dob.toISOString().split("T")[0] : null,
        referred_by: referralCode.trim() || null,
        gender: gender || null,
      });

      setSuccessVisible(true);
      Animated.spring(successScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        setSuccessVisible(false);
        navigation.navigate("Login");
      }, 2500);
    } catch (e) {
      showPremiumAlert("Signup Failed", e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <View style={styles.root}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 60 }}>

          <LinearGradient
            colors={["#16a34a", "#15803d"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <Image source={require("../assets/logo.png")} style={styles.logo} />
              <Text style={styles.title}>Create Account</Text>

              {/* SIGNUP BONUS PILL */}
              {/* DYNAMIC COLOR OFFER PILL */}
              {settings && animatedTexts.length > 0 && (
                <Animated.View style={[styles.premiumOfferWrap, { opacity: fadeAnim }]}>
                  <LinearGradient
                    colors={offers[activeIndex]?.colors || ["#FF2B5C", "#FF6B8B"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.premiumOfferInner}
                  >
                    <View style={styles.offerIconBadge}>
                      <Ionicons name={offers[activeIndex]?.icon || "gift"} size={14 * scale} color="#FFFFFF" />
                    </View>
                    <View style={styles.offerTextContainer}>
                      {highlightAmount(animatedTexts[textIndex])}
                    </View>
                    <View style={[styles.glowingDot, { backgroundColor: '#FFFFFF' }]} />
                  </LinearGradient>
                </Animated.View>
              )}
            </View>
            {/* Decorative shapes */}
            <View style={styles.decor1} />
            <View style={styles.decor2} />
          </LinearGradient>

          <View style={styles.formCard}>

            <InputItem icon="person-outline" placeholder="Full Name" value={name} onChangeText={setName} />

            <InputItem icon="mail-outline" placeholder="Gmail Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

            <View style={styles.phoneContainer}>
              <Text style={styles.callingCodeText}>🇬🇧 +44</Text>
              <TextInput
                placeholder="Mobile Number"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                maxLength={11}
              />
            </View>

            {/* RESTAURANT PICKER */}
            <View style={styles.pickerWrapper}>
              <Ionicons name="restaurant-outline" size={20} color="#16a34a" style={styles.pickerIcon} />
              <View style={{ flex: 1 }}>
                <Picker
                  selectedValue={preferredRestaurant}
                  onValueChange={setPreferredRestaurant}
                  style={styles.picker}
                  dropdownIconColor="#16a34a"
                >
                  <Picker.Item label="Preferred Restaurant" value="" color="#94A3B8" />
                  {restaurants.map(r => (
                    <Picker.Item key={r.id} label={r.name} value={r.name} />
                  ))}
                </Picker>
              </View>
            </View>

            {/* DOB */}
            <TouchableOpacity style={styles.dobBtn} onPress={() => setShowDobPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color="#16a34a" />
              <Text style={[styles.dobText, !dob && { color: "#94A3B8" }]}>
                {dob ? dob.toDateString() : "Date of Birth"}
              </Text>
            </TouchableOpacity>

            {showDobPicker && (
              <DateTimePicker
                value={dob || new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(e, date) => {
                  setShowDobPicker(false);
                  if (date) setDob(date);
                }}
              />
            )}

            {/* GENDER */}
            <View style={styles.pickerWrapper}>
              <Ionicons name="transgender-outline" size={20} color="#16a34a" style={styles.pickerIcon} />
              <View style={{ flex: 1 }}>
                <Picker
                  selectedValue={gender}
                  onValueChange={setGender}
                  style={styles.picker}
                  dropdownIconColor="#16a34a"
                >
                  <Picker.Item label="Gender (Optional)" value="" color="#94A3B8" />
                  <Picker.Item label="Male" value="male" />
                  <Picker.Item label="Female" value="female" />
                  <Picker.Item label="Other" value="other" />
                </Picker>
              </View>
            </View>

            <InputItem icon="gift-outline" placeholder="Referral Code (Optional)" value={referralCode} onChangeText={setReferralCode} />

            <TouchableOpacity style={styles.termsRow} onPress={() => setTermsAccepted(!termsAccepted)}>
              <Ionicons name={termsAccepted ? "checkbox" : "square-outline"} size={22} color={termsAccepted ? "#16a34a" : "#CBD5E1"} />
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.link} onPress={() => navigation.navigate("TermsConditions")}>Terms</Text> & <Text style={styles.link} onPress={() => navigation.navigate("PrivacyPolicy")}>Privacy Policy</Text> <Text style={{ color: 'red' }}>*</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mainBtn}
              onPress={handleSignup}
              disabled={!termsAccepted || loading}
            >
              <LinearGradient 
                colors={termsAccepted ? ["#16a34a", "#15803d"] : ["#94A3B8", "#64748B"]} 
                style={styles.btnGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.btnText}>Create Account</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

          </View>

          <TouchableOpacity style={styles.footer} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.footerText}>Already have an account? <Text style={styles.footerLink}>Sign In</Text></Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deliveryPartnerFooter} onPress={() => navigation.navigate("DeliveryLogin")}>
            <Text style={styles.deliveryPartnerText}>Delivery Partner? <Text style={styles.deliveryPartnerLink}>Sign In Here 🛵</Text></Text>
          </TouchableOpacity>

        </ScrollView>
      </View>

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
              <TouchableOpacity style={styles.alertBtn} onPress={hidePremiumAlert}>
                <LinearGradient
                  colors={alertType === 'error' ? ["#EF4444", "#DC2626"] : ["#16A34A", "#15803D"]}
                  style={styles.alertBtnGrad}
                >
                  <Text style={styles.alertBtnText}>Ok</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* PREMIUM SUCCESS MODAL */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <Animated.View style={[styles.alertCard, { transform: [{ scale: successScale }] }]}>
            <LinearGradient colors={["#16a34a", "#15803d"]} style={styles.alertContent}>
              <View style={styles.successIconRing}>
                <Ionicons name="checkmark" size={50} color="#16a34a" />
              </View>
              <Text style={[styles.alertTitleText, { color: "#FFF" }]}>Account Created!</Text>
              <Text style={[styles.alertMsgText, { color: "#FFF", opacity: 0.9 }]}>
                Welcome to Crispy Dosa. Your account is ready!
              </Text>
              {settings && (
                <Text style={{ color: "#FFF", fontFamily: "PoppinsBold", fontSize: 13 * scale, marginTop: 10 }}>
                  Enjoy your £{Number(settings.signup_bonus_amount).toFixed(2)} Signup Bonus 🎁
                </Text>
              )}
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

    </>
  );
}

const InputItem = ({ icon, ...props }) => (
  <View style={styles.inputContainer}>
    <Ionicons name={icon} size={18} color="#16a34a" />
    <TextInput
      placeholderTextColor="#475569"
      style={styles.input}
      {...props}
    />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  headerGradient: {
    paddingTop: 30,
    paddingBottom: 65,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 10,
  },
  logo: { width: 140, height: 60, resizeMode: 'contain' },
  title: { fontSize: 22 * scale, fontFamily: "PoppinsBold", color: "#FFF", marginTop: 2, fontWeight: '900' },

  // REMOVED OLD BONUS STYLES: bonusBadge, bonusText, but keeping place clean.

  // NEW PREMIUM OFFER STYLES from Categories
  premiumOfferWrap: {
    marginTop: 15,
    borderRadius: 50,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    minWidth: '85%',
  },
  premiumOfferInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offerIconBadge: {
    width: 28 * scale,
    height: 28 * scale,
    borderRadius: 14 * scale,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  offerText: {
    fontSize: 13 * scale,
    fontFamily: "PoppinsBold",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  offerAmount: {
    color: "#FBFF00",
    fontWeight: "900",
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  glowingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E23744",
    marginLeft: 10,
  },

  decor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decor2: {
    position: 'absolute',
    bottom: 20,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  formCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: -45, // Moved significantly higher
    borderRadius: 24,
    padding: 16,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9"
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 10,
    borderWidth: 1.2,
    borderColor: "#94A3B8"
  },
  input: { flex: 1, marginLeft: 12, fontSize: 14 * scale, color: "#000000", fontFamily: "PoppinsBold", paddingVertical: 0 },

  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 10,
    borderWidth: 1.2,
    borderColor: "#94A3B8"
  },
  callingCodeText: { fontSize: 14 * scale, fontFamily: "PoppinsBold", color: "#000000", marginLeft: 5 },
  phoneInput: { flex: 1, marginLeft: 10, fontSize: 14 * scale, color: "#000000", fontFamily: "PoppinsBold", paddingVertical: 0 },

  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 10,
    borderWidth: 1.2,
    borderColor: "#94A3B8"
  },
  pickerIcon: { marginRight: 2 },
  picker: { flex: 1, marginLeft: 2, height: 52, color: "#000000" },

  dobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    marginBottom: 10,
    borderWidth: 1.2,
    borderColor: "#94A3B8"
  },
  dobText: { marginLeft: 12, fontSize: 14 * scale, color: "#000000", fontFamily: "PoppinsBold" },

  termsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, marginTop: 4 },
  termsText: { flex: 1, marginLeft: 10, fontSize: 12 * scale, color: "#475569", lineHeight: 18 },
  link: { color: "#16a34a", fontFamily: "PoppinsBold" },

  mainBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 5 },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  btnText: { color: "#FFF", fontSize: 16 * scale, fontFamily: "PoppinsBold", marginRight: 8 },

  footer: { marginTop: 20, alignItems: 'center' },
  deliveryPartnerFooter: { marginTop: 14, marginBottom: 20, alignItems: 'center', backgroundColor: '#F0FDF4', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, alignSelf: 'center', borderWidth: 1, borderColor: '#DCFCE7' },
  deliveryPartnerText: { fontSize: 13 * scale, color: '#475569', fontFamily: 'PoppinsBold' },
  deliveryPartnerLink: { color: '#16a34a', fontWeight: '800' },
  footerText: { fontSize: 14 * scale, color: "#64748B" },
  footerLink: { color: "#16a34a", fontFamily: "PoppinsBold" },

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
  successIconRing: {
    width: 90 * scale,
    height: 90 * scale,
    borderRadius: 45 * scale,
    backgroundColor: "#FFF",
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
