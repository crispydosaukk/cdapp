import firestore from '@react-native-firebase/firestore';

// Fetch global settings
export const fetchAppSettings = async () => {
    try {
        const doc = await firestore().collection("settings").doc("global").get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error("Fetch App Settings Error:", error);
        return null;
    }
};
