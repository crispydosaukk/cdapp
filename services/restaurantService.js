import firestore from '@react-native-firebase/firestore';

export const fetchRestaurants = async (lat, lng) => {
  try {
    const snapshot = await firestore().collection('restaurant').get();
    
    if (!snapshot.empty) {
      return snapshot.docs.map(doc => ({
        id: doc.id,
        userId: doc.data().user_id || doc.id,
        name: doc.data().restaurant_name || doc.data().name || "Crispy Dosa",
        address: doc.data().restaurant_address || doc.data().address || "",
        photo: doc.data().restaurant_photo || doc.data().photo || "",
        instore: doc.data().instore || 0,
        kerbside: doc.data().kerbside || 0,
        distance: 0,
      }));
    }
    return [];
  } catch (error) {
    console.error("Restaurant API Error:", error);
    return [];
  }
};

export const fetchRestaurantDetails = async (userId) => {
  try {
    const doc = await firestore().collection('restaurant').doc(String(userId)).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error("Restaurant Details API Error:", error);
    return null;
  }
};

export const fetchRestaurantTimings = async (restaurantId) => {
  try {
    // Assuming timings are stored in a subcollection or field
    const doc = await firestore().collection('restaurant').doc(String(restaurantId)).get();
    if (doc.exists && doc.data().timings) {
      return doc.data().timings;
    }
    return [];
  } catch (error) {
    console.error("Fetch Timings Error:", error);
    return [];
  }
};

export const fetchStripeKey = async (restaurantId) => {
  try {
    const doc = await firestore().collection('restaurant').doc(String(restaurantId)).get();
    if (doc.exists && doc.data().stripe_publishable_key) {
      return doc.data().stripe_publishable_key;
    }
    return null;
  } catch (error) {
    console.error("Fetch Stripe Key Error:", error);
    return null;
  }
};
