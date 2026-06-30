import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from "@react-native-async-storage/async-storage";

// 🔹 Login User
export const loginUser = async (email, password) => {
  try {
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
    const firebaseUser = userCredential.user;

    // Fetch the customer's full profile from Firestore
    const userDoc = await firestore().collection('customers').doc(firebaseUser.uid).get();
    
    if (!userDoc.exists) {
      throw new Error("Customer profile not found in database.");
    }

    const userData = { id: firebaseUser.uid, ...userDoc.data() };
    const token = await firebaseUser.getIdToken();

    // Save token and user info for app state
    await AsyncStorage.setItem("token", token);
    await AsyncStorage.setItem("user", JSON.stringify(userData));

    return { user: userData, token };
  } catch (error) {
    console.log("Login error:", error.message);
    throw new Error(error.message || "Login failed");
  }
};

// 🔹 Register User
export const registerUser = async (data) => {
  try {
    const { email, password, full_name, mobile_number } = data;
    
    // Create the user in Firebase Auth
    const userCredential = await auth().createUserWithEmailAndPassword(email, password);
    
    // Note: Our Dashboard's Cloud Function (onCustomerCreated) will automatically 
    // detect this new user, create their Firestore document, and give them a referral code!
    
    // We can optionally update their display name immediately
    await userCredential.user.updateProfile({ displayName: full_name });

    return { status: 1, message: "Account created successfully!" };
  } catch (error) {
    console.log("Register error:", error.message);
    throw new Error(error.message || "Signup failed");
  }
};
