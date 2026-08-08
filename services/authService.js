import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from "@react-native-async-storage/async-storage";

const MSG91_AUTH_KEY = "556810AQwSjcKL6a72bde6P1"; 
const MSG91_TEMPLATE_ID = "6a76b4b59708204c84092c82";

export const checkPhoneNumberExists = async (phoneNumber) => {
  try {
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    // Firestore query (you may need to ensure your 'mobile_number' field format matches)
    const snapshot = await firestore().collection('customers').where('mobile_number', '==', formattedPhone).get();
    if (!snapshot.empty) {
       return { exists: true, userDoc: snapshot.docs[0].data(), id: snapshot.docs[0].id };
    }
    return { exists: false };
  } catch (error) {
    console.log("Check phone error:", error);
    throw new Error("Could not verify phone number.");
  }
};

export const sendMsg91Otp = async (phoneNumber) => {
  try {
    const cleanPhone = phoneNumber.replace('+', ''); // MSG91 usually takes numbers without +
    const url = `https://control.msg91.com/api/v5/otp?template_id=${MSG91_TEMPLATE_ID}&mobile=${cleanPhone}&authkey=${MSG91_AUTH_KEY}`;
    const response = await fetch(url, { method: "POST" });
    const data = await response.json();
    if (data.type === "error") throw new Error(data.message);
    return true;
  } catch (error) {
    console.log("Send OTP Error:", error);
    throw new Error(error.message || "Failed to send OTP");
  }
};

export const verifyMsg91Otp = async (phoneNumber, otp) => {
  try {
    const cleanPhone = phoneNumber.replace('+', '');
    const url = `https://control.msg91.com/api/v5/otp/verify?otp=${otp}&mobile=${cleanPhone}&authkey=${MSG91_AUTH_KEY}`;
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    if (data.type === "error") throw new Error(data.message);
    return true;
  } catch (error) {
    console.log("Verify OTP Error:", error);
    throw new Error(error.message || "Invalid OTP");
  }
};

export const loginUserWithPhone = async (phoneNumber) => {
  try {
    const userCheck = await checkPhoneNumberExists(phoneNumber);
    if (!userCheck.exists) throw new Error("Account not found");

    const userData = { id: userCheck.id, ...userCheck.userDoc };
    
    try {
      const email = userData.email;
      const dummyPassword = `Crispy@${phoneNumber.replace('+', '')}`;
      const userCredential = await auth().signInWithEmailAndPassword(email, dummyPassword);
      const token = await userCredential.user.getIdToken();
      await AsyncStorage.setItem("token", token);
    } catch(e) {
      console.log("Firebase Auth sign-in failed, proceeding with AsyncStorage:", e.message);
      await AsyncStorage.setItem("token", "dummy_token_" + Date.now());
    }

    await AsyncStorage.setItem("user", JSON.stringify(userData));
    return { user: userData };
  } catch (error) {
    console.log("Login error:", error.message);
    throw new Error(error.message || "Login failed");
  }
};

// Keep original loginUser for backwards compatibility if needed
export const loginUser = async (email, password) => {
  try {
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
    const firebaseUser = userCredential.user;
    const userDoc = await firestore().collection('customers').doc(firebaseUser.uid).get();
    
    if (!userDoc.exists) throw new Error("Customer profile not found in database.");

    const userData = { id: firebaseUser.uid, ...userDoc.data() };
    const token = await firebaseUser.getIdToken();

    await AsyncStorage.setItem("token", token);
    await AsyncStorage.setItem("user", JSON.stringify(userData));

    return { user: userData, token };
  } catch (error) {
    throw new Error(error.message || "Login failed");
  }
};

export const registerUser = async (data) => {
  try {
    const { email, full_name, mobile_number } = data;
    const cleanPhone = mobile_number.replace('+', '');
    const dummyPassword = `Crispy@${cleanPhone}`;
    
    const userCredential = await auth().createUserWithEmailAndPassword(email, dummyPassword);
    
    await userCredential.user.updateProfile({ displayName: full_name });

    // Save customer profile to Firestore so it can be found during login
    await firestore().collection('customers').doc(userCredential.user.uid).set({
      ...data,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });

    return { status: 1, message: "Account created successfully!" };
  } catch (error) {
    console.log("Register error:", error.message);
    throw new Error(error.message || "Signup failed");
  }
};
