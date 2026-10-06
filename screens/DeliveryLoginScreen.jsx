import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { width } = Dimensions.get('window');
const scale = width / 400;

export default function DeliveryLoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Success Modal State
  const [successVisible, setSuccessVisible] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState('info');
  const alertScale = React.useRef(new Animated.Value(0)).current;

  const showAlert = (title, msg, type = 'info') => {
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

  const hideAlert = () => {
    Animated.timing(alertScale, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setAlertVisible(false));
  };

  const handleLogin = async () => {
    const rawInput = email.trim();
    const rawPass = password.trim();

    if (!rawInput || !rawPass) {
      showAlert('Required', 'Please enter your registered email or phone and password.', 'error');
      return;
    }

    try {
      setLoading(true);

      let targetEmail = rawInput.toLowerCase();
      let directPartnerDoc = null;
      let directPartnerId = null;

      // If user typed a phone number instead of an email (does not contain @)
      if (!rawInput.includes('@')) {
        const phoneDigits = rawInput.replace(/[^0-9]/g, '');
        const phoneClean = rawInput.replace(/[^0-9+]/g, '');
        const phoneWithoutPlus44 = phoneClean.startsWith('+44') ? '0' + phoneClean.slice(3) : phoneClean;
        const phoneWithPlus44 = phoneClean.startsWith('0') ? '+44' + phoneClean.slice(1) : phoneClean;
        const lookupList = Array.from(new Set([rawInput, phoneDigits, phoneClean, phoneWithoutPlus44, phoneWithPlus44])).filter(Boolean);

        const phoneSnap = await firestore()
          .collection('delivery_partners')
          .where('mobile_number', 'in', lookupList.slice(0, 10))
          .get();

        if (!phoneSnap.empty) {
          directPartnerDoc = phoneSnap.docs[0].data();
          directPartnerId = phoneSnap.docs[0].id;
          if (directPartnerDoc.email) {
            targetEmail = directPartnerDoc.email.toLowerCase();
          }
        } else {
          // Check phone field
          const altSnap = await firestore()
            .collection('delivery_partners')
            .where('phone', 'in', lookupList.slice(0, 10))
            .get();
          if (!altSnap.empty) {
            directPartnerDoc = altSnap.docs[0].data();
            directPartnerId = altSnap.docs[0].id;
            if (directPartnerDoc.email) {
              targetEmail = directPartnerDoc.email.toLowerCase();
            }
          }
        }
      }

      // Try Firebase Auth
      let firebaseUser = null;
      let authSuccessful = false;

      try {
        const userCredential = await auth().signInWithEmailAndPassword(
          targetEmail,
          rawPass
        );
        firebaseUser = userCredential.user;
        authSuccessful = true;
      } catch (authErr) {
        // If Firebase Auth failed, check if the partner document in Firestore has this password stored
        if (directPartnerDoc && directPartnerDoc.password && String(directPartnerDoc.password) === rawPass) {
          authSuccessful = true;
        } else {
          // If no direct partner yet, try lookup by email in delivery_partners to check password
          if (!directPartnerDoc && targetEmail.includes('@')) {
            const emailPartnerSnap = await firestore()
              .collection('delivery_partners')
              .where('email', '==', targetEmail)
              .get();
            if (!emailPartnerSnap.empty) {
              const docData = emailPartnerSnap.docs[0].data();
              if (docData.password && String(docData.password) === rawPass) {
                directPartnerDoc = docData;
                directPartnerId = emailPartnerSnap.docs[0].id;
                authSuccessful = true;
              }
            }
          }
        }

        if (!authSuccessful) {
          throw authErr;
        }
      }

      // Partner verification in Firestore
      let partnerDoc = directPartnerDoc;
      let partnerId = directPartnerId;

      if (!partnerDoc && firebaseUser) {
        // 1. Try lookup by UID
        const uidSnap = await firestore()
          .collection('delivery_partners')
          .where('uid', '==', firebaseUser.uid)
          .get();

        if (!uidSnap.empty) {
          partnerDoc = uidSnap.docs[0].data();
          partnerId = uidSnap.docs[0].id;
        } else {
          // 2. Try lookup by email
          const emailSnap = await firestore()
            .collection('delivery_partners')
            .where('email', '==', targetEmail)
            .get();

          if (!emailSnap.empty) {
            partnerDoc = emailSnap.docs[0].data();
            partnerId = emailSnap.docs[0].id;
          } else {
            // 3. Try direct doc(uid)
            const directSnap = await firestore()
              .collection('delivery_partners')
              .doc(firebaseUser.uid)
              .get();

            if (directSnap.exists) {
              partnerDoc = directSnap.data();
              partnerId = directSnap.id;
            }
          }
        }
      }

      if (!partnerDoc) {
        if (auth().currentUser) await auth().signOut();
        setLoading(false);
        showAlert(
          'Access Restricted',
          'This account is not registered as an authorized Delivery Partner. Please contact your restaurant manager.',
          'error'
        );
        return;
      }

      if (partnerDoc.status === 0) {
        if (auth().currentUser) await auth().signOut();
        setLoading(false);
        showAlert(
          'Account Inactive',
          'Your delivery partner account has been deactivated. Please contact support.',
          'error'
        );
        return;
      }

      const partnerData = {
        id: partnerId,
        uid: firebaseUser?.uid || partnerDoc.uid || partnerId,
        name: partnerDoc.name || 'Delivery Partner',
        email: partnerDoc.email || targetEmail,
        mobile_number: partnerDoc.mobile_number || partnerDoc.phone || '',
        vehicle_type: partnerDoc.vehicle_type || 'Bike',
        restaurant_id: partnerDoc.restaurant_id ? String(partnerDoc.restaurant_id) : null,
        restaurant_name: partnerDoc.restaurant_name || '',
      };

      await AsyncStorage.setItem('delivery_partner', JSON.stringify(partnerData));
      await AsyncStorage.setItem('user_type', 'delivery_partner');

      setLoading(false);
      setPartnerName(partnerData.name);
      setSuccessVisible(true);

      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        setSuccessVisible(false);
        navigation.reset({
          index: 0,
          routes: [{ name: 'DeliveryHome' }],
        });
      }, 1600);
    } catch (err) {
      setLoading(false);
      console.log('Delivery login error:', err);
      let msg = 'Failed to sign in. Please verify your credentials.';
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        msg = 'Invalid credentials. Please verify your email/phone and password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address or registered mobile number.';
      }
      showAlert('Sign In Failed', msg, 'error');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#1d8f52"
        translucent={Platform.OS === 'android'}
      />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 30 + (insets.bottom || 10) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* TOP GREEN WAVE HEADER */}
          <LinearGradient
            colors={['#1d8f52', '#27b36a', '#41d48a']}
            style={[
              styles.topWave,
              { paddingTop: topPadding + 14, minHeight: 110 * scale + topPadding }
            ]}
          >
            {/* BACK BUTTON */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </TouchableOpacity>
          </LinearGradient>

          {/* MAIN CARD */}
          <View style={styles.card}>
            <Text style={styles.title}>Sign In</Text>

            {/* Email or Phone Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email or Mobile Number</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={20} color="#1f4d35" />
                <TextInput
                  placeholder="driver@crispydosa.com or 07..."
                  placeholderTextColor="#88a796"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color="#1f4d35" />
                <TextInput
                  placeholder="Enter your password"
                  placeholderTextColor="#88a796"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={styles.input}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#1f4d35"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#1a8b50', '#21a863', '#34c87c']}
                style={styles.loginGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.loginText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Customer Switch Link */}
            <TouchableOpacity
              style={styles.customerLink}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.customerLinkText}>
                Not a delivery partner?{' '}
                <Text style={styles.customerHighlight}>Customer Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SUCCESS MODAL */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.successCard, { transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient
              colors={['#16a34a', '#15803d', '#14532d']}
              style={styles.successGradient}
            >
              <View style={styles.checkRing}>
                <Ionicons name="checkmark" size={48 * scale} color="#FFF" />
              </View>
              <Text style={styles.successTitle}>Welcome Back!</Text>
              <Text style={styles.successMsg}>{partnerName || 'Partner'}</Text>
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>ACTIVE ON DUTY 🛵</Text>
              </View>
              <Text style={styles.enjoyText}>Loading live delivery dashboard...</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* CUSTOM ALERT MODAL */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <Animated.View style={[styles.alertCard, { transform: [{ scale: alertScale }] }]}>
            <View style={styles.alertContent}>
              <View
                style={[
                  styles.alertIconRing,
                  { backgroundColor: alertType === 'error' ? '#FEE2E2' : '#E0F2FE' },
                ]}
              >
                <Ionicons
                  name={alertType === 'error' ? 'alert-circle' : 'information-circle'}
                  size={42 * scale}
                  color={alertType === 'error' ? '#DC2626' : '#0284C7'}
                />
              </View>

              <Text style={styles.alertTitleText}>{alertTitle}</Text>
              <Text style={styles.alertMsgText}>{alertMsg}</Text>

              <TouchableOpacity style={styles.alertBtn} onPress={hideAlert}>
                <LinearGradient
                  colors={alertType === 'error' ? ['#DC2626', '#B91C1C'] : ['#1a8b50', '#15803d']}
                  style={styles.alertBtnGrad}
                >
                  <Text style={styles.alertBtnText}>Understood</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardWrap: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 30,
  },

  /* TOP WAVE HEADER */
  topWave: {
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    paddingHorizontal: 20,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40 * scale,
    height: 40 * scale,
    borderRadius: 20 * scale,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* CARD */
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -20 * scale,
    borderRadius: 26,
    padding: 24,
    shadowColor: '#1d8f52',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#ECFDF5',
  },
  title: {
    fontSize: 24 * scale,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 20,
    textAlign: 'center',
  },

  /* INPUTS */
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13 * scale,
    fontWeight: '700',
    color: '#1f4d35',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 52 * scale,
  },
  input: {
    flex: 1,
    fontSize: 14 * scale,
    color: '#0F172A',
    marginLeft: 10,
  },

  /* LOGIN BUTTON */
  loginBtn: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1a8b50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  loginGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14 * scale,
    gap: 8,
  },
  loginText: {
    color: '#FFF',
    fontSize: 15 * scale,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* CUSTOMER LINK */
  customerLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  customerLinkText: {
    fontSize: 13 * scale,
    color: '#64748B',
    fontWeight: '500',
  },
  customerHighlight: {
    color: '#15803d',
    fontWeight: '800',
  },

  /* SUCCESS MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCard: {
    width: '85%',
    borderRadius: 28,
    overflow: 'hidden',
    elevation: 20,
  },
  successGradient: {
    padding: 28,
    alignItems: 'center',
  },
  checkRing: {
    width: 80 * scale,
    height: 80 * scale,
    borderRadius: 40 * scale,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  successTitle: {
    fontSize: 24 * scale,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 4,
  },
  successMsg: {
    fontSize: 17 * scale,
    fontWeight: '700',
    color: '#FFF',
    opacity: 0.95,
    marginBottom: 12,
  },
  successBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 14,
  },
  successBadgeText: {
    fontSize: 11 * scale,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: 0.8,
  },
  enjoyText: {
    fontSize: 13 * scale,
    color: '#FFF',
    opacity: 0.85,
    textAlign: 'center',
  },

  /* ALERT MODAL */
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCard: {
    width: '85%',
    borderRadius: 26,
    backgroundColor: '#FFF',
    overflow: 'hidden',
    elevation: 16,
  },
  alertContent: {
    padding: 26,
    alignItems: 'center',
  },
  alertIconRing: {
    width: 72 * scale,
    height: 72 * scale,
    borderRadius: 36 * scale,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitleText: {
    fontSize: 20 * scale,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMsgText: {
    fontSize: 13 * scale,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20 * scale,
    marginBottom: 20,
  },
  alertBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  alertBtnGrad: {
    paddingVertical: 12 * scale,
    alignItems: 'center',
  },
  alertBtnText: {
    color: '#FFF',
    fontSize: 14 * scale,
    fontWeight: '800',
  },
});
