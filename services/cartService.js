import firestore from '@react-native-firebase/firestore';

export const addToCart = async (cartData) => {
  try {
    const custId = String(cartData.customer_id);
    const cartRef = firestore().collection('carts');
    const snapshot = await cartRef
      .where('customer_id', '==', custId)
      .where('product_id', '==', String(cartData.product_id))
      .where('textfield', '==', cartData.textfield || "")
      .get();
      
    if (!snapshot.empty) {
      // Update quantity
      const docId = snapshot.docs[0].id;
      const currentQty = snapshot.docs[0].data().product_quantity;
      const newQty = currentQty + cartData.product_quantity;
      
      if (newQty <= 0) {
        await cartRef.doc(docId).delete();
      } else {
        await cartRef.doc(docId).update({ product_quantity: newQty });
      }
    } else {
      // Add new item if delta is positive
      if (cartData.product_quantity > 0) {
        await cartRef.add({
          ...cartData,
          customer_id: custId,
          product_id: String(cartData.product_id),
          created_at: firestore.FieldValue.serverTimestamp()
        });
      }
    }
    return { status: 1, message: "Cart updated" };
  } catch (err) {
    console.log("Add to Cart Error:", err);
    return { status: 0, message: "Firestore Error" };
  }
};

export const getCart = async (customerId) => {
  try {
    const snapshot = await firestore()
      .collection('carts')
      .where('customer_id', '==', String(customerId))
      .get();
      
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { status: 1, data };
  } catch (err) {
    console.log("Get Cart Error:", err);
    return { status: 0, data: [] };
  }
};

export const removeFromCart = async (cartId) => {
  try {
    await firestore().collection('carts').doc(cartId).delete();
    return { status: 1, message: "Item removed" };
  } catch (err) {
    console.log("Remove Cart Error:", err);
    return { status: 0, message: "Firestore Error" };
  }
};
