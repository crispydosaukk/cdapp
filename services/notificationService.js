import firestore from '@react-native-firebase/firestore';

export const saveFcmToken = async ({ userType, userId, token }) => {
  try {
    await firestore().collection('customers').doc(userId).update({ fcm_token: token });
  } catch (err) {
    console.log("Save FCM token failed:", err);
  }
};

export const getNotifications = async (userType, userId) => {
  try {
    const snap = await firestore()
      .collection('notifications')
      .where('user_id', 'in', [String(userId), Number(userId)])
      .get();
    return { status: 1, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  } catch(e) {
    return { status: 0, data: [] };
  }
};

export const markNotificationRead = async (id, userId = null, markAll = false) => {
  try {
    if (markAll && userId) {
      const snap = await firestore().collection('notifications').where('user_id', 'in', [String(userId), Number(userId)]).get();
      const batch = firestore().batch();
      snap.docs.forEach(d => batch.update(d.ref, { is_read: 1 }));
      await batch.commit();
    } else if (id) {
      await firestore().collection('notifications').doc(id).update({ is_read: 1 });
    }
  } catch(e) {}
};
