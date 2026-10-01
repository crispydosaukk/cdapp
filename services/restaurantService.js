import firestore from '@react-native-firebase/firestore';

export const fetchRestaurants = async (lat, lng) => {
  try {
    const snapshot = await firestore().collection('restaurant').get();
    
    if (!snapshot.empty) {
      return snapshot.docs.map(doc => {
        const data = doc.data();
        const restLat = data.latitude || data.lat;
        const restLng = data.longitude || data.lng || data.long;
        let distance = null;

        if (lat && lng && restLat && restLng) {
          const R = 3958.8; // Radius of the earth in miles
          const dLat = (restLat - lat) * (Math.PI / 180);
          const dLon = (restLng - lng) * (Math.PI / 180);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat * (Math.PI / 180)) * Math.cos(restLat * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = parseFloat((R * c).toFixed(1));
        }

        return {
          id: doc.id,
          userId: data.user_id || doc.id,
          name: data.restaurant_name || data.name || "Crispy Dosa",
          address: data.restaurant_address || data.address || "",
          photo: data.restaurant_photo || data.photo || "",
          instore: data.instore || 0,
          kerbside: data.kerbside || 0,
          delivery: data.delivery || 0,
          latitude: restLat || null,
          longitude: restLng || null,
          base_delivery_fee: Number(data.base_delivery_fee || 0),
          base_delivery_distance: Number(data.base_delivery_distance || 0),
          extra_fee_per_mile: Number(data.extra_fee_per_mile || 0),
          max_delivery_radius: Number(data.max_delivery_radius || 0),
          min_order_delivery: Number(data.min_order_delivery || 0),
          free_delivery_above: Number(data.free_delivery_above || 0),
          distance: distance,
        };
      });
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
