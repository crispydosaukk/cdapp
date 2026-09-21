import firestore from '@react-native-firebase/firestore';

export const createOrder = async (orderData) => {
  try {
    const ordersRef = firestore().collection('orders');
    // Generate a simple order number
    const orderNumber = "ORD-" + Math.floor(100000 + Math.random() * 900000);
    
    await ordersRef.add({
      ...orderData,
      order_number: orderNumber,
      order_status: 1, // Pending
      created_at: firestore.FieldValue.serverTimestamp()
    });
    
    // --- NEW LOGIC START --- (Moved from Cloud Functions)
    try {
      const settingsDoc = await firestore().collection('settings').doc('global').get();
      let loyaltyPointsEarned = 0;
      if (settingsDoc.exists) {
        const s = settingsDoc.data() || {};
        if (s.earn_per_order_amount) loyaltyPointsEarned = Number(s.earn_per_order_amount);
      }

      const walletDeducted = Number(orderData.wallet_used || 0);
      const customerRef = firestore().collection('customers').doc(orderData.customer_id);

      let updates = {};
      if (loyaltyPointsEarned > 0) {
        updates.loyalty_points = firestore.FieldValue.increment(loyaltyPointsEarned);
      }
      if (walletDeducted > 0) {
        updates.wallet_balance = firestore.FieldValue.increment(-walletDeducted);
      }

      if (Object.keys(updates).length > 0) {
        await customerRef.update(updates);
      }

      if (walletDeducted > 0) {
        await firestore().collection('wallet_transactions').add({
          customer_id: orderData.customer_id,
          amount: walletDeducted,
          type: 'debit',
          description: `Used in Order ${orderNumber}`,
          created_at: firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (rewardErr) {
      console.log("Error applying rewards/wallet:", rewardErr);
    }
    // --- NEW LOGIC END ---

    // Clear cart for this customer
    const cartSnapshot = await firestore()
      .collection('carts')
      .where('customer_id', '==', orderData.customer_id)
      .get();
      
    const batch = firestore().batch();
    cartSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return { status: 1, message: "Order placed successfully!" };
  } catch (err) {
    console.log("createOrder error:", err);
    return { status: 0, message: "Unable to place order" };
  }
};

export const getOrders = async (customerId) => {
  try {
    const snapshot = await firestore()
      .collection('orders')
      .where('customer_id', '==', String(customerId))
      .orderBy('created_at', 'desc')
      .get();
      
    const data = snapshot.docs.map(doc => {
      const o = doc.data();
      return { 
        id: doc.id, 
        ...o,
        created_at: o.created_at?.toDate ? o.created_at.toDate().toISOString() : o.created_at
      };
    });
    return { status: 1, data };
  } catch (err) {
    console.log("getOrders error:", err);
    return { status: 0, message: "Unable to fetch orders", data: [] };
  }
};

export const getOrder = async (orderId) => {
  try {
    const doc = await firestore().collection('orders').doc(orderId).get();
    if (doc.exists) {
      const o = doc.data();
      return { 
        status: 1, 
        data: { 
          id: doc.id, 
          ...o,
          created_at: o.created_at?.toDate ? o.created_at.toDate().toISOString() : o.created_at
        } 
      };
    }
    return { status: 0, message: "Order not found" };
  } catch (err) {
    console.log("getOrder error:", err);
    return { status: 0, message: "Unable to fetch order details" };
  }
};
