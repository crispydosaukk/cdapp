import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export const getPaymentHistory = async () => {
  try {
    const user = auth().currentUser;
    if (!user) return { status: 0, data: [] };
    const snap = await firestore()
      .collection('wallet_transactions')
      .where('customer_id', '==', user.uid)
      .orderBy('created_at', 'desc')
      .get();
    return { status: 1, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  } catch(err) {
    return { status: 0, data: [] };
  }
};
