import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export async function fetchProfile() {
  const user = auth().currentUser;
  if (!user) throw new Error("Not logged in");
  const doc = await firestore().collection('customers').doc(user.uid).get();
  return { ...doc.data(), id: doc.id };
}

export async function updateProfileData(data) {
  const user = auth().currentUser;
  if (!user) throw new Error("Not logged in");
  await firestore().collection('customers').doc(user.uid).update(data);
}
