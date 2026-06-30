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
    
    // The Cloud Function (onOrderCreated) in the backend handles wallet deduction and loyalty generation automatically!
    
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
