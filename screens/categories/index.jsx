import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Modal,
  Animated,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import { PermissionsAndroid, Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import AppHeader from "../AppHeader";
import BottomBar from "../BottomBar";
import MenuModal from "../MenuModal";
import LinearGradient from "react-native-linear-gradient";
import { fetchCategories } from "../../services/categoryService";
import {
  fetchRestaurantDetails,
  fetchRestaurantTimings,
} from "../../services/restaurantService";
import { getCart } from "../../services/cartService";
import { RefreshControl } from "react-native";
import useRefresh from "../../hooks/useRefresh";
import { fetchAppSettings } from "../../services/settingsService";


const { width } = Dimensions.get("window");
const scale = width / 400;

export default function Categories({ route, navigation }) {
  const { userId } = route?.params || {};
  const isFocused = useIsFocused();

  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [timings, setTimings] = useState([]);
  const [timingsLoading, setTimingsLoading] = useState(false);
  const [todayTiming, setTodayTiming] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [cartItems, setCartItems] = useState({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [textIndex, setTextIndex] = useState(0);
  const offers = [
    { colors: ["#FF416C", "#FF4B2B"], textColor: "#FFFFFF", icon: "flash" },
    { colors: ["#1D976C", "#93F9B9"], textColor: "#004D40", icon: "leaf" },
    { colors: ["#F2994A", "#F2C94C"], textColor: "#5D4037", icon: "wallet" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await fetchAppSettings();
      if (data) {
        setSettings(data);
      }
    };
    loadSettings();
  }, []);
  const animatedTexts = settings ? [
    `EARN £${Number(settings.earn_per_order_amount).toFixed(2)} ON EVERY ORDER`,
    `REFER & EARN £${Number(settings.referral_bonus_amount).toFixed(2)}`,
    `£${Number(settings.signup_bonus_amount).toFixed(2)} WELCOME BONUS`,
  ] : [];
  const formatTime = (t) => (!t ? "" : t.slice(0, 5));

  // offer text animation
  useEffect(() => {
    const animate = () => {
      if (animatedTexts.length === 0) return;
      fadeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTextIndex((p) => {
          const next = (p + 1) % animatedTexts.length;
          setActiveIndex(next % offers.length);
          return next;
        });
        animate();
      });
    };
    animate();
  }, [animatedTexts.length]);

  // load user
  useEffect(() => {
    (async () => {
      const s = await AsyncStorage.getItem("user");
      if (s) setUser(JSON.parse(s));
    })();
  }, []);

  // restaurant details
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const d = await fetchRestaurantDetails(userId);
      setRestaurant(d);
    })();
  }, [userId]);

  // categories
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const d = await fetchCategories(userId);
      if (mounted) setCategories(Array.isArray(d) ? d : []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // today timing
  useEffect(() => {
    if (!restaurant?.id) return;
    (async () => {
      const d = await fetchRestaurantTimings(restaurant.id);
      if (!d?.length) return;
      const today = new Date().toLocaleString("en-US", { weekday: "long" });
      const t = d.find((i) => i.day === today);
      setTodayTiming(t || null);
    })();
  }, [restaurant]);

  // cart
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const id = user.id ?? user.customer_id;
      if (!id) return;
      const res = await getCart(id);
      if (res?.status === 1 && Array.isArray(res.data)) {
        const map = {};
        res.data.forEach((i) => {
          if (i.product_quantity > 0) map[i.product_id] = i.product_quantity;
        });
        setCartItems(map);
      }
    };
    if (isFocused) load();
  }, [isFocused, user]);

  const openTimingsModal = async () => {
    if (!restaurant?.id) return;
    setModalVisible(true);
    setTimingsLoading(true);
    const data = await fetchRestaurantTimings(restaurant.id);
    setTimings(data || []);
    setTimingsLoading(false);
  };

  const filteredCategories = categories.filter((c) =>
    (c?.name || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const { refreshing, onRefresh } = useRefresh(async () => {
    // Reload settings
    const sData = await fetchAppSettings();
    if (sData) setSettings(sData);

    // Reload restaurant
    const d = await fetchRestaurantDetails(userId);
    setRestaurant(d);

    // Reload categories
    const c = await fetchCategories(userId);
    setCategories(Array.isArray(c) ? c : []);

    // Reload timings
    if (d?.id) {
      const t = await fetchRestaurantTimings(d.id);
      const today = new Date().toLocaleString("en-US", { weekday: "long" });
      setTodayTiming(t.find((i) => i.day === today) || null);
    }

    // Reload cart
    if (user) {
      const id = user.id ?? user.customer_id;
      const res = await getCart(id);
      if (res?.status === 1 && Array.isArray(res.data)) {
        const map = {};
        res.data.forEach((i) => {
          if (i.product_quantity > 0) map[i.product_id] = i.product_quantity;
        });
        setCartItems(map);
      }
    }
  });

  const renderCategory = ({ item, index }) => {
    const isEven = index % 2 === 0;
    return (
      <TouchableOpacity
        style={cardStyles.wideCard}
        activeOpacity={0.9}
        onPress={() =>
          navigation.navigate("Products", { userId, categoryId: item.id })
        }
      >
        <LinearGradient
          colors={isEven ? ["#FFF", "#FDF2F8"] : ["#FFF", "#F0FDF4"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cardStyles.cardGradient}
        >
          <View style={cardStyles.cardInfo}>
            <Text style={cardStyles.categoryName}>{item?.name}</Text>
            <View style={styles.serviceRow}>
              <View style={[styles.serviceChip, { backgroundColor: isEven ? '#FCE7F3' : '#DCFCE7' }]}>
                <Text style={[styles.serviceChipText, { color: isEven ? '#9D174D' : '#166534', fontWeight: '800' }]}>EXPLORE MENU</Text>
              </View>
            </View>
          </View>

          <View style={cardStyles.floatingImageContainer}>
            <View style={[cardStyles.imageShadow, { shadowColor: isEven ? '#DB2777' : '#16a34a' }]}>
              <Image
                source={
                  item?.image
                    ? { uri: item.image }
                    : require("../../assets/restaurant.png")
                }
                style={cardStyles.roundImage}
              />
            </View>
            <View style={cardStyles.arrowCirc}>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const timeLabel = todayTiming
    ? todayTiming.is_active
      ? `${formatTime(todayTiming.opening_time)} - ${formatTime(
        todayTiming.closing_time
      )}`
      : "Closed Today"
    : "Loading...";

  const highlightAmount = (text) => {
    if (!settings) return <Text style={styles.offerText}>{text}</Text>;
    const regex = new RegExp(`(£\\s?${Number(settings.signup_bonus_amount).toFixed(2)}|£${Number(settings.signup_bonus_amount).toFixed(2)}|£\\s?${Number(settings.referral_bonus_amount).toFixed(2)}|£${Number(settings.referral_bonus_amount).toFixed(2)}|£\\s?${Number(settings.earn_per_order_amount).toFixed(2)}|£${Number(settings.earn_per_order_amount).toFixed(2)})`, 'i');
    const parts = text.split(regex);

    return (
      <Text style={[styles.offerText, { color: "#FFFFFF" }]} numberOfLines={1}>
        {parts[0]}
        {parts[1] && (
          <Text style={styles.offerAmount}>{parts[1]}</Text>
        )}
        {parts[2]}
      </Text>
    );
  };

  return (
    // 🔧 only left/right safe insets so we don't double-pad top/bottom
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View style={styles.brandSection}>
        <LinearGradient
          colors={["#FF2B5C", "#FF6B8B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <AppHeader
          user={user}
          navigation={navigation}
          onMenuPress={() => setMenuVisible(true)}
          cartItems={cartItems}
          transparent
          textColor="#FFFFFF"
          barStyle="light-content"
          statusColor="#FF2B5C"
        />

        {/* DYNAMIC COLOR OFFER PILL */}
        {settings && animatedTexts.length > 0 && (
          <Animated.View style={[styles.premiumOfferWrap, { opacity: fadeAnim }]}>
            <LinearGradient
              colors={offers[activeIndex]?.colors || ["#FF2B5C", "#FF6B8B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.premiumOfferInner}
            >
              <View style={styles.offerIconBadge}>
                <Ionicons name={offers[activeIndex]?.icon || "gift"} size={18 * scale} color="#FFFFFF" />
              </View>
              <View style={styles.offerTextContainer}>
                {highlightAmount(animatedTexts[textIndex])}
              </View>
              <View style={[styles.glowingDot, { backgroundColor: '#FFFFFF' }]} />
            </LinearGradient>
          </Animated.View>
        )}

        {/* EXECUTIVE RESTAURANT CARD (The Boutique Experience) */}
        {restaurant && (
          <View style={styles.infoCardWrapper}>
            <View style={styles.executiveCard}>
              <View style={styles.cardHeader}>
                <View style={styles.imageContainer}>
                  <Image
                    source={
                      restaurant?.restaurant_photo
                        ? { uri: restaurant.restaurant_photo }
                        : require("../../assets/restaurant.png")
                    }
                    style={styles.boutiqueImage}
                  />
                  <View style={styles.vegFloatingTag}>
                    <Ionicons name="leaf" size={10} color="#16a34a" />
                    <Text style={styles.vegBadgeText}>PURE VEG</Text>
                  </View>
                </View>

                <View style={styles.executiveInfo}>
                  <Text style={styles.boutiqueName}>{restaurant.restaurant_name}</Text>

                  <View style={styles.infoRow}>
                    <View style={styles.locIconBtn}>
                      <Ionicons name="location" size={14} color="#FF2B5C" />
                    </View>
                    <Text style={styles.locText} numberOfLines={4}>
                      {restaurant.restaurant_address}
                    </Text>
                  </View>

                  <View style={styles.serviceRow}>
                    {restaurant.instore && (
                      <View style={styles.serviceChip}>
                        <Ionicons name="storefront" size={16 * scale} color="#FF2B5C" />
                        <Text style={styles.serviceChipText}>In-store</Text>
                      </View>
                    )}
                    {restaurant.kerbside && (
                      <View style={styles.serviceChip}>
                        <Ionicons name="car-sport" size={18 * scale} color="#16a34a" />
                        <Text style={[styles.serviceChipText, { color: '#16a34a' }]}>Kerbside</Text>
                      </View>
                    )}
                    {Boolean(restaurant.delivery) && (
                      <View style={styles.serviceChip}>
                        <Ionicons name="bicycle" size={18 * scale} color="#2563EB" />
                        <Text style={[styles.serviceChipText, { color: '#2563EB' }]}>Delivery</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.footerCol}>
                  <View style={styles.footerIconRow}>
                    <Ionicons name="call" size={14 * scale} color="#FF2B5C" />
                    <Text style={styles.footerValLarge}>{restaurant.restaurant_phonenumber}</Text>
                  </View>
                </View>
                <View style={styles.footerDivider} />
                <View style={styles.footerCol}>
                  <View style={styles.footerIconRow}>
                    <Ionicons name="time" size={14 * scale} color="#FF2B5C" />
                    <Text style={styles.footerValLarge}>{timeLabel}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.detailsCirc} onPress={openTimingsModal}>
                  <Ionicons name="chevron-forward" size={18} color="#FF2B5C" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        style={styles.mainScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* SEARCH BOX */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#777" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search categories..."
            placeholderTextColor="#aaaaaa"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* CATEGORY GRID */}
        {loading ? (
          <ActivityIndicator size="large" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={filteredCategories}
            numColumns={1}
            renderItem={renderCategory}
            scrollEnabled={false}
            keyExtractor={(i) => i.id.toString()}
            contentContainerStyle={styles.listContainer}
          />
        )}
      </ScrollView>

      {/* Voice Overlay - Modal for absolute visibility */}

      <MenuModal
        visible={menuVisible}
        setVisible={setMenuVisible}
        user={user}
        navigation={navigation}
      />
      <BottomBar navigation={navigation} />

      {/* TIMINGS MODAL */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalWrapper}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Restaurant Timings</Text>
            {timingsLoading ? (
              <ActivityIndicator size="large" />
            ) : (
              <FlatList
                data={timings}
                keyExtractor={(i) => i.day}
                renderItem={({ item }) => (
                  <View style={styles.modalRow}>
                    <Text style={styles.dayText}>{item.day}</Text>
                    <Text style={styles.timeText}>
                      {item.is_active
                        ? `${formatTime(item.opening_time)} - ${formatTime(
                          item.closing_time
                        )}`
                        : "Closed"}
                    </Text>
                  </View>
                )}
              />
            )}
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },
  mainScroll: {
    marginTop: 0,
  },
  offerAmount: {
    color: "#FBFF00",
    fontWeight: "900",
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  // IMMERSIVE BRAND SECTION
  brandSection: {
    paddingBottom: 0,
    borderBottomLeftRadius: 45,
    borderBottomRightRadius: 45,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    zIndex: 10,
  },
  premiumOfferWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 50,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  premiumOfferInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  offerIconBadge: {
    width: 32 * scale,
    height: 32 * scale,
    borderRadius: 16 * scale,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  offerText: {
    fontSize: 16 * scale,
    fontFamily: "PoppinsBold",
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  glowingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E23744",
    marginLeft: 10,
  },

  // EXECUTIVE BOUTIQUE CARD
  infoCardWrapper: {
    paddingHorizontal: 16,
    marginTop: 15,
  },
  executiveCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  imageContainer: {
    position: 'relative',
  },
  boutiqueImage: {
    width: 110 * scale,
    height: 110 * scale,
    borderRadius: 22,
    backgroundColor: "#F0F0F0",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  vegFloatingTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vegBadgeText: {
    fontSize: 8 * scale,
    fontFamily: "PoppinsBold",
    color: "#16a34a",
    marginLeft: 3,
  },
  executiveInfo: {
    flex: 1,
    marginLeft: 18,
  },
  boutiqueName: {
    fontSize: 20 * scale,
    fontFamily: "PoppinsBold",
    fontWeight: '900',
    color: "#1C1C1C",
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  locIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,43,92,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  locText: {
    fontSize: 12 * scale,
    fontFamily: "PoppinsMedium",
    color: "#666",
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingVertical: 4,
    marginRight: 15,
  },
  serviceChipText: {
    marginLeft: 6,
    fontSize: 14 * scale,
    fontFamily: "PoppinsBold",
    color: "#FF2B5C",
    letterSpacing: 0.3,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
  },
  footerCol: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 9 * scale,
    fontFamily: "PoppinsBold",
    color: "#AAA",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  footerVal: {
    fontSize: 11 * scale,
    fontFamily: "PoppinsSemiBold",
    color: "#333",
  },
  footerValLarge: {
    fontSize: 13.5 * scale,
    fontFamily: "PoppinsBold",
    color: "#1C1C1C",
    marginLeft: 6,
  },
  footerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerDivider: {
    width: 1,
    height: 20,
    backgroundColor: "#EEE",
    marginHorizontal: 15,
  },
  detailsCirc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,43,92,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  // SEARCH BOX
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 18,
    height: 56,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  searchInput: {
    marginLeft: 12,
    fontSize: 14 * scale,
    fontFamily: "PoppinsMedium",
    flex: 1,
    color: "#1C1C1C",
  },

  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  modalWrapper: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    elevation: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 20 * scale,
    fontFamily: "PoppinsSemiBold",
    color: "#1C1C1C",
    textAlign: "center",
    marginBottom: 20,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F0F0F0",
  },
  dayText: {
    fontSize: 14 * scale,
    fontFamily: "PoppinsMedium",
    color: "#444",
  },
  timeText: {
    fontSize: 14 * scale,
    fontFamily: "PoppinsBold",
    color: "#1C1C1C",
  },
  closeBtn: {
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: "#FF2B5C",
    borderRadius: 14,
  },
  closeText: {
    textAlign: "center",
    fontSize: 15 * scale,
    fontFamily: "PoppinsBold",
    color: "#FFFFFF",
  },
  voiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  voiceOverlayInner: {
    width: '100%',
    height: '100%',
    justifyContent: "center",
    alignItems: "center",
  },
  voiceText: {
    fontSize: 24 * scale,
    fontFamily: "PoppinsBold",
    color: "#FFF",
    marginTop: 20,
  },
  voiceSubtext: {
    fontSize: 14 * scale,
    fontFamily: "PoppinsMedium",
    color: "rgba(255,255,255,0.8)",
    marginTop: 10,
  },
  voiceClose: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
  },
  voiceCloseInner: {
    width: 60 * scale,
    height: 60 * scale,
    borderRadius: 30 * scale,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  voicePulseCircle: {
    width: 140 * scale,
    height: 140 * scale,
    borderRadius: 70 * scale,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  }
});

const cardStyles = StyleSheet.create({
  wideCard: {
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
    paddingRight: 15,
  },
  categoryName: {
    fontSize: 19 * scale,
    fontFamily: "PoppinsBold",
    color: "#0F172A",
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  floatingImageContainer: {
    position: 'relative',
  },
  imageShadow: {
    width: 85 * scale,
    height: 85 * scale,
    borderRadius: 42.5 * scale,
    backgroundColor: '#FFF',
    padding: 6,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  roundImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40 * scale,
    resizeMode: 'contain',
  },
  arrowCirc: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 4,
  },
});
