import firestore from '@react-native-firebase/firestore';

export const fetchCategories = async (userId) => {
  try {
    const snapshot = await firestore()
      .collection('categories')
      .where('user_id', 'in', [Number(userId), String(userId)])
      .get();
      
    if (!snapshot.empty) {
      return snapshot.docs
        .map(doc => {
          const cat = doc.data();
          return {
            id: doc.id,
            userId: cat.user_id,
            name: cat.name,
            image: cat.category_image || cat.image,
            sort_order: Number(cat.sort_order || 0)
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    return [];
  } catch (error) {
    console.error("Category Firestore Error:", error);
    return [];
  }
};
