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
  Alert,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { width } = Dimensions.get('window');
const scale = width / 400;

export default function DeliveryLoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await auth().signInWithEmailAndPassword(
        email.trim().toLowerCase(),
        password.trim()
      );
      const firebaseUser = userCredential.user;

      // Check delivery_partners collection
      let partnerDoc = null;
      let partnerId = null;

      // 1. Try lookup by UID
      const uidSnap = await firestore().collection('delivery_partners').where('uid', '==', firebaseUser.uid).get();
      if (!uidSnap.empty) {
        partnerDoc = uidSnap.docs[0].data();
        partnerId = uidSnap.docs[0].id;
      } else {
        // 2. Try lookup by email
        const emailSnap = await firestore()
          .collection('delivery_partners')
          .where('email', '==', email.trim().toLowerCase())
          .get();
        if (!emailSnap.empty) {
          partnerDoc = emailSnap.docs[0].data();
          partnerId = emailSnap.docs[0].id;
        } else {
          // 3. Try direct doc(uid)
          const directSnap = await firestore().collection('delivery_partners').doc(firebaseUser.uid).get();
          if (directSnap.exists) {
            partnerDoc = directSnap.data();
            partnerId = directSnap.id;
          }
        }
      }

      if (!partnerDoc) {
        await auth().signOut();
        Alert.alert(
          'Access Restricted',
          'This account is not registered as a Delivery Partner. Please contact the administrator.'
        );
        setLoading(false);
        return;
      }

      if (partnerDoc.status === 0) {
        await auth().signOut();
        Alert.alert('Account Inactive', 'Your delivery account has been deactivated. Please contact support.');
        setLoading(false);
        return;
      }

      const partnerData = {
        id: partnerId,
        uid: firebaseUser.uid,
        name: partnerDoc.name || 'Delivery Partner',
        email: partnerDoc.email || email.trim().toLowerCase(),
        mobile_number: partnerDoc.mobile_number || partnerDoc.phone || '',
        vehicle_type: partnerDoc.vehicle_type || 'Bike',
        restaurant_id: partnerDoc.restaurant_id ? String(partnerDoc.restaurant_id) : null,
        restaurant_name: partnerDoc.restaurant_name || '',
      };

      await AsyncStorage.setItem('delivery_partner', JSON.stringify(partnerData));
      await AsyncStorage.setItem('user_type', 'delivery_partner');

      setLoading(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'DeliveryHome' }],
      });
    } catch (err) {
      setLoading(false);
      console.log('Delivery login error:', err);
      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      Alert.alert('Sign In Failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header decoration */}
        <LinearGradient
          colors={['#0F172A', '#1E293B', '#0F172A']}
          style={styles.header}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <MaterialIcons name="delivery-dining" size={44} color="#10B981" />
          </View>

          <Text style={styles.title}>Delivery Partner Portal</Text>
          <Text style={styles.subtitle}>
            Sign in to access live orders, navigate destinations & manage deliveries
          </Text>
        </LinearGradient>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          {/* Email Input */}
          <Text style={styles.inputLabel}>Registered Email</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={20} color="#64748B" />
            <TextInput
              placeholder="delivery@crispydosa.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748B" />
            <TextInput
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              style={styles.input}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.btnGradient}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Text style={styles.btnText}>Sign In to Dashboard</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Note */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#3B82F6" />
            <Text style={styles.infoText}>
              Delivery accounts are created by the Crispy Dosa admin team. Contact your manager if you do not have credentials.
            </Text>
          </View>

          {/* Customer back link */}
          <TouchableOpacity
            style={styles.customerLink}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.customerLinkText}>
              Not a delivery partner? <Text style={styles.customerHighlight}>Customer Login</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flexGrow: 1 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22 * scale,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13 * scale,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20 * scale,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#1E293B',
    marginHorizontal: 18,
    borderRadius: 24,
    padding: 24,
    marginTop: -15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 18 * scale,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12 * scale,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
    marginTop: 10,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 14 * scale,
    marginLeft: 10,
  },
  signInBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 20,
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 8,
  },
  btnText: {
    color: '#FFF',
    fontSize: 15 * scale,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 11 * scale,
    color: '#93C5FD',
    lineHeight: 16 * scale,
  },
  customerLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  customerLinkText: {
    fontSize: 13 * scale,
    color: '#94A3B8',
  },
  customerHighlight: {
    color: '#10B981',
    fontWeight: '700',
  },
});
