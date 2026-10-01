import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated, Dimensions, RefreshControl, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";
import useRefresh from "../hooks/useRefresh";
import AppHeader from "./AppHeader";
import BottomBar from "./BottomBar";
import MenuModal from "./MenuModal";
import { getCart, addToCart, removeFromCart } from "../services/cartService";

const { width } = Dimensions.get("window");
const scale = width / 400;

export default function CartSummary({ navigation }) {
  const [user, setUser] = useState(null);
  const [cartItems, setCartItems] = useState({});
  const [products, setProducts] = useState([]);
  const [updating, setUpdating] = useState({});
  const [loadingCart, setLoadingCart] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = useRefresh(async () => {
    await refreshCart();
  });

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    })();
  }, []);

  useEffect(() => {
    if (isFocused) {
      setLoadingCart(true);
      refreshCart();
    }
  }, [isFocused]);

  const refreshCart = async () => {
    try {
      const storedUser = await AsyncStorage.getItem("user");
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;
      const customerId = parsedUser?.id ?? parsedUser?.customer_id;
      if (!customerId) return;

      const res = await getCart(customerId);
      if (res?.status === 1 && Array.isArray(res.data)) {
        const filtered = res.data.filter((i) => (i.product_quantity || 0) > 0);
        setProducts(filtered);
        const map = {};
        filtered.forEach((i) => {
          map[i.product_id] = i.product_quantity || 0;
        });
        setCartItems(map);
      } else {
        setProducts([]);
        setCartItems({});
      }
    } catch (e) {
      console.warn("Failed to refresh cart", e);
      setProducts([]);
      setCartItems({});
    } finally {
      setLoadingCart(false);
    }
  };

  const calcTotal = (price, qty) => (price * qty).toFixed(2);

  const grandTotal = products
    .reduce((sum, i) => {
      const price = Number(i.discount_price ?? i.product_price ?? 0);
      return sum + price * (i.product_quantity || 0);
    }, 0)
    .toFixed(2);

  const updateQty = async (item, delta) => {
    const current = cartItems[item.product_id] || 0;
    const updated = current + delta;

    const storedUser = await AsyncStorage.getItem("user");
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    const customerId = parsedUser?.id ?? parsedUser?.customer_id;
    if (!customerId) return;

    // Sync to AsyncStorage for "Replace Cart" popup logic
    // We assume item.user_id is the Restaurant ID (product owner)
    const restaurantId = item.user_id || item.restaurant_id;

    if (products.length === 1 && updated <= 0) {
      // If this is the last item being removed, strictly clear the entire cart cache
      await AsyncStorage.removeItem("cart");
    } else if (restaurantId) {
      try {
        const storedCart = await AsyncStorage.getItem("cart");
        const parsedCart = storedCart ? JSON.parse(storedCart) : {};
        const restCart = parsedCart[restaurantId] || {};

        if (updated <= 0) {
          delete restCart[item.product_id];
        } else {
          restCart[item.product_id] = updated;
        }

        // Update the restaurant entry - If empty, remove the restaurant key entirely
        if (Object.keys(restCart).length === 0) {
          delete parsedCart[restaurantId];
        } else {
          parsedCart[restaurantId] = restCart;
        }

        await AsyncStorage.setItem("cart", JSON.stringify(parsedCart));
      } catch (e) {
        console.warn("Failed to sync local cart", e);
      }
    }

    setUpdating((s) => ({ ...s, [item.product_id]: true }));
    try {
      if (updated <= 0) {
        await removeFromCart(item.cart_id || item.id);
        setCartItems((prev) => {
          const next = { ...prev };
          delete next[item.product_id];
          return next;
        });
        setProducts((prev) => prev.filter((p) => p.product_id !== item.product_id));
      } else {
        await addToCart({
          customer_id: customerId,
          user_id: parsedUser.id, // Current implementation uses customer ID here, keeping as is
          product_id: item.product_id,
          product_name: item.product_name,
          product_price: item.product_price,
          product_quantity: delta,
          textfield: item.textfield || "",
        });
        setCartItems((prev) => ({ ...prev, [item.product_id]: updated }));
        setProducts((prev) =>
          prev.map((p) =>
            p.product_id === item.product_id ? { ...p, product_quantity: updated } : p
          )
        );
      }
    } catch (e) {
      console.warn("Failed to update cart item", e);
    } finally {
      setUpdating((s) => {
        const next = { ...s };
        delete next[item.product_id];
        return next;
      });
    }
  };

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!loadingCart && products.length > 0) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loadingCart, products.length]);

  return (
    <View style={styles.root}>
      <AppHeader
        user={user}
        navigation={navigation}
        cartItems={cartItems}
        onMenuPress={() => setMenuVisible(true)}
      />

      {loadingCart ? (
        <View style={styles.loaderFull}>
          <ActivityIndicator size="large" color="#FF2B5C" />
          <Text style={styles.loaderText}>Syncing your cart...</Text>
        </View>
      ) : products.length < 1 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.emptyImageWrap}>
            <Ionicons name="cart-outline" size={80} color="#DDD" />
          </View>
          <Text style={styles.emptyTitle}>Empty Plate?</Text>
          <Text style={styles.emptySubtitle}>
            Your cart is hungry. Explore our finest selection and add your favorites now!
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => navigation.navigate("Resturent")}
          >
            <LinearGradient colors={["#FF2B5C", "#FF6B8B"]} style={styles.browseGradient}>
              <Text style={styles.browseText}>Start Ordering</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={products}
            keyExtractor={(i) => String(i.product_id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListHeaderComponent={() => (
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                <View style={styles.listHeader}>
                  <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle}>Review Items</Text>
                    <Text style={styles.headerSub}>{products.length} {products.length === 1 ? 'item' : 'items'} in your bucket</Text>
                  </View>
                </View>

                {/* Arrival Timer Card */}
                <View style={styles.etaCard}>
                  <LinearGradient colors={["#FFF", "#FAFAFA"]} style={styles.etaInner}>
                    <View style={styles.etaIconBg}>
                      <Ionicons name="time" size={24} color="#FF2B5C" />
                    </View>
                    <View style={styles.etaTextWrap}>
                      <Text style={styles.etaLabel}>Estimated Prep Time</Text>
                      <Text style={styles.etaValue}>20 - 25 Minutes</Text>
                    </View>
                    <View style={styles.arrivalBadge}>
                      <Text style={styles.arrivalText}>Freshly Prepared</Text>
                    </View>
                  </LinearGradient>
                </View>

                {/* PREMIUM ADD MORE CARD ABOVE ITEMS */}
                <TouchableOpacity
                  style={styles.addMorePremiumCard}
                  activeOpacity={0.8}
                  onPress={() => navigation.goBack()}
                >
                  <View style={styles.addMoreContent}>
                    <View style={styles.addMoreIconWrap}>
                      <Ionicons name="add" size={24} color="#FF2B5C" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 15 }}>
                      <Text style={styles.addMoreTitle}>Hungry for more?</Text>
                      <Text style={styles.addMoreSub}>Add more items to your bucket</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#FF2B5C" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
            renderItem={({ item }) => {
              const qty = item.product_quantity || 0;
              const price = Number(item.discount_price ?? item.product_price ?? 0);
              const total = calcTotal(price, qty);

              return (
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <View style={styles.nameHeader}>
                      <Ionicons name="radio-button-on" size={12} color="#16a34a" style={{ marginRight: 6, marginTop: 3 }} />
                      <Text style={styles.itemName} numberOfLines={2}>{item.product_name}</Text>
                    </View>
                    {item.textfield ? (
                      <View style={styles.noteBox}>
                        <Text style={styles.itemNote}>“{item.textfield}”</Text>
                      </View>
                    ) : null}
                    <Text style={styles.itemPriceUnit}>£{price.toFixed(2)}</Text>
                  </View>

                  <View style={styles.actionCol}>
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity
                        style={styles.actionBtnMinus}
                        onPress={() => updateQty(item, -1)}
                        disabled={!!updating[item.product_id]}
                      >
                        {updating[item.product_id] ? (
                          <ActivityIndicator size="small" color="#FF2B5C" />
                        ) : (
                          <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={20} color="#FF2B5C" />
                        )}
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.actionBtnPlus}
                        onPress={() => updateQty(item, 1)}
                        disabled={!!updating[item.product_id]}
                      >
                        <Ionicons name="add" size={22} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={() => (
              <View style={styles.billSummary}>
                <Text style={styles.billTitle}>Price Details</Text>
                <View style={styles.billCard}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Item Total</Text>
                    <Text style={styles.billValue}>£{grandTotal}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Preparation Fee</Text>
                    <Text style={[styles.billValue, { color: '#16a34a' }]}>FREE</Text>
                  </View>
                  <View style={styles.billDivider} />
                  <View style={styles.billRow}>
                    <Text style={styles.grandLabel}>Amount Payable</Text>
                    <Text style={styles.grandValue}>£{grandTotal}</Text>
                  </View>
                </View>

                {/* Safety Badge */}
                <View style={styles.safetyCard}>
                  <View style={styles.safetyIconBg}>
                    <Ionicons name="shield-checkmark" size={24} color="#16a34a" />
                  </View>
                  <View style={styles.safetyTextRow}>
                    <Text style={styles.safetyTitle}>Safety & Hygiene Guaranteed</Text>
                    <Text style={styles.safetySub}>Trained professionals preparing your food</Text>
                  </View>
                </View>

                <View style={{ height: 85 }} />
              </View>
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        </View>
      )}

      {/* STICKY PLACE ORDER BAR - NOW CLEANER AT THE BOTTOM */}
      {!loadingCart && products.length > 0 && (
        <View style={[styles.stickyFooter, { bottom: insets.bottom }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.premiumStickyBar}
            onPress={() => navigation.navigate("CheckoutScreen", { restaurantId: products[0]?.restaurant_id || products[0]?.user_id })}
          >
            <LinearGradient
              colors={["#16a34a", "#15803d"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.stickyBtn}
            >
              <Text style={styles.stickyBtnText}>Proceed to Checkout</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <MenuModal
        visible={menuVisible}
        setVisible={setMenuVisible}
        user={user}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8F8F8" },

  loaderFull: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 15, fontFamily: 'PoppinsMedium', color: '#666' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyImageWrap: { width: 140, height: 140, backgroundColor: '#EEE', borderRadius: 70, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
  emptyTitle: { fontSize: 22 * scale, fontFamily: 'PoppinsBold', color: '#1C1C1C' },
  emptySubtitle: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#777', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  browseBtn: { marginTop: 30, borderRadius: 12, overflow: 'hidden', elevation: 5 },
  browseGradient: { paddingVertical: 14, paddingHorizontal: 30 },
  browseText: { color: '#FFF', fontFamily: 'PoppinsBold', fontSize: 15 * scale },

  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 20, paddingTop: 15 },
  headerTitle: {
    fontSize: 22 * scale,     // ⬆️ slightly bigger
    fontFamily: 'PoppinsBold',
    fontWeight: '900',        // ✅ force bold
    color: '#1C1C1C',
  },

  headerSub: { fontSize: 12 * scale, fontFamily: 'PoppinsMedium', color: '#888' },
  addMoreBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,43,92,0.08)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  addMoreText: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#FF2B5C', marginLeft: 5 },

  etaCard: { marginHorizontal: 20, marginBottom: 15, borderRadius: 12, overflow: 'hidden', elevation: 4 },
  etaInner: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  etaIconBg: { width: 45, height: 45, borderRadius: 10, backgroundColor: 'rgba(255,43,92,0.1)', alignItems: 'center', justifyContent: 'center' },
  etaTextWrap: { flex: 1, marginLeft: 15 },
  etaLabel: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '800',
    color: '#AAA',
    letterSpacing: 0.6,
  },
  etaValue: {
    fontSize: 16 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '900',
    color: '#1C1C1C',
  },

  arrivalBadge: { backgroundColor: '#FF2B5C', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  arrivalText: { fontSize: 10 * scale, fontFamily: 'PoppinsBold', color: '#FFF' },

  itemRow: { flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 20, marginVertical: 6, borderRadius: 12, padding: 16, elevation: 2 },
  itemInfo: { flex: 1, paddingRight: 10 },
  nameHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  itemName: {
    fontSize: 16.5 * scale,   // ⬆️ clearer
    fontFamily: 'PoppinsBold',
    fontWeight: '800',
    color: '#1C1C1C',
  },

  noteBox: { backgroundColor: '#F9F9F9', padding: 10, borderRadius: 8, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#DDD' },
  itemNote: { fontSize: 12 * scale, fontFamily: 'PoppinsMedium', fontStyle: 'italic', color: '#666' },
  itemPriceUnit: { fontSize: 14 * scale, fontFamily: 'PoppinsSemiBold', color: '#FF2B5C', marginTop: 8 },

  actionCol: { alignItems: 'flex-end', justifyContent: 'space-between' },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#EEE' },
  actionBtnMinus: { width: 34, height: 34, backgroundColor: '#FFF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtnPlus: { width: 34, height: 34, backgroundColor: '#FF2B5C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#FF2B5C', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 } },
  qtyText: { fontSize: 16 * scale, fontFamily: 'PoppinsBold', fontWeight: '900', color: '#1C1C1C', marginHorizontal: 12, minWidth: 20, textAlign: 'center' },
  totalTextSmall: { fontSize: 15 * scale, fontFamily: 'PoppinsBold', color: '#1C1C1C', marginTop: 10 },

  billSummary: { padding: 16, paddingBottom: 10 },
  billTitle: {
    fontSize: 19 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '900',
    color: '#1C1C1C',
    marginBottom: 10,
  },
  billCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, elevation: 3 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  billLabel: { fontSize: 14 * scale, fontFamily: 'PoppinsMedium', color: '#777' },
  billValue: {
    fontSize: 15 * scale,      // ⬆️ slightly bigger
    fontFamily: 'PoppinsBold',
    fontWeight: '800',         // ✅ stronger bold
    color: '#1C1C1C',
  },

  billDivider: { height: 1.5, backgroundColor: '#F5F5F5', marginVertical: 10 },
  grandLabel: {
    fontSize: 17 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '900',
    color: '#1C1C1C',
  },

  grandValue: {
    fontSize: 22 * scale,      // ⬆️ premium emphasis
    fontFamily: 'PoppinsBold',
    fontWeight: '900',         // 🔥 extra bold
    color: '#16a34a',
  },


  safetyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DCFCE7' },
  safetyIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  safetyTextRow: { marginLeft: 12 },
  safetyTitle: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#15803d' },
  safetySub: { fontSize: 11 * scale, fontFamily: 'PoppinsMedium', color: '#166534', opacity: 0.8 },

  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  premiumStickyBar: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Centered
    paddingHorizontal: 20,
    paddingVertical: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 35,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F1F5F9',
  },
  // stickyLeft: { flex: 0.45, justifyContent: 'center' },
  // stickyItemCount: { fontSize: 11 * scale, fontFamily: 'PoppinsBold', color: '#64748B', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: -1 },
  // stickyPriceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 0 },
  // stickyTotalLabel: { fontSize: 13 * scale, fontFamily: 'PoppinsSemiBold', color: '#1E293B', marginRight: 4, opacity: 0.7 },
  // stickyTotalValue: { fontSize: 22 * scale, fontFamily: 'PoppinsBold', fontWeight: '900', color: '#1C1C1C' },
  stickyBtn: {
    flex: 1, // Full width inside the centered container
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: 14,
  },
  stickyBtnText: {
    color: '#FFF',
    fontSize: 15 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '800',
  },

  /* PREMIUM ADD MORE CARD */
  addMorePremiumCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderStyle: 'dashed',
    elevation: 2,
  },
  addMoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addMoreIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,43,92,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreTitle: {
    fontSize: 15 * scale,
    fontFamily: 'PoppinsBold',
    fontWeight: '800',
    color: '#1C1C1C',
  },
  addMoreSub: {
    fontSize: 11 * scale,
    fontFamily: 'PoppinsMedium',
    color: '#888',
  },
});
