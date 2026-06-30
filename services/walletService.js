import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export const getWalletSummary = async () => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error("Not logged in");

    const doc = await firestore().collection('customers').doc(user.uid).get();
    const data = doc.data() || {};
    
    // Also fetch transaction history
    const historySnap = await firestore()
      .collection('wallet_transactions')
      .where('customer_id', '==', user.uid)
      .orderBy('created_at', 'desc')
      .get();
      
    const history = historySnap.docs.map(d => {
      const hd = d.data();
      const isDebit = hd.type === "debit";
      return { 
        id: d.id, 
        ...hd,
        created_at: hd.created_at?.toDate ? hd.created_at.toDate().toLocaleString() : hd.created_at,
        amount: isDebit ? `-${hd.amount}` : `+${hd.amount}`
      };
    });

    return {
      wallet_balance: data.wallet_balance || 0,
      loyalty_points: data.loyalty_points || 0,
      loyalty_pending_points: 0,
      loyalty_pending_list: [],
      loyalty_expiry_list: data.loyalty_points >= 10 ? [{
        credit_value: Math.floor(data.loyalty_points / 10),
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString()
      }] : [],
      referral_credits: data.referral_credits || 0,
      history: history,
      loyalty_redeem_points: 10,
      loyalty_redeem_value: 1,
      loyalty_available_after_hours: 0,
    };
  } catch (err) {
    console.log("getWalletSummary error:", err);
    return null;
  }
};

export const redeemLoyaltyToWallet = async () => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error("Not logged in");

    const ref = firestore().collection('customers').doc(user.uid);
    
    await firestore().runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const points = doc.data().loyalty_points || 0;
      const balance = doc.data().wallet_balance || 0;
      
      if (points < 10) throw new Error("Not enough points");
      
      const redeemAmount = Math.floor(points / 10);
      const newBalance = balance + redeemAmount;
      const newPoints = points % 10;
      
      transaction.update(ref, {
        loyalty_points: newPoints,
        wallet_balance: newBalance
      });
      
      // Log the transaction
      const wtRef = firestore().collection("wallet_transactions").doc();
      transaction.set(wtRef, {
        customer_id: user.uid,
        amount: redeemAmount,
        type: "credit",
        description: `Redeemed ${points - newPoints} loyalty points`,
        created_at: firestore.FieldValue.serverTimestamp()
      });
    });

    return { status: 1, message: "Redeemed successfully!" };
  } catch (err) {
    console.log("redeemLoyaltyToWallet error:", err);
    return { status: 0, message: "Redeem failed" };
  }
};
