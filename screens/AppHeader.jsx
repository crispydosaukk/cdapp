import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar, ActivityIndicator, Animated } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { getWalletSummary } from "../services/walletService";
import { AuthRequiredModal } from "./AuthRequired";
import { getNotifications } from "../services/notificationService";
import messaging from "@react-native-firebase/messaging";

const { width } = Dimensions.get("window");
// Scale factor for responsiveness
const scale = width / 375;

export default function AppHeader({ user, onMenuPress, navigation, cartItems, transparent, statusColor, textColor, barStyle, disableSafeArea }) {
  const insets = useSafeAreaInsets();
  const totalItems = cartItems ? Object.values(cartItems).reduce((a, b) => a + b, 0) : 0;

  const [walletBalance, setWalletBalance] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const userId = user.id || user.customer_id;
      const res = await getNotifications("customer", userId);

      if (res?.status === 1) {
        const uniqueUnread = new Set();
        (res.data || []).forEach(item => {
          const key = [
            item.order_number || 'NO_ORDER',
            item.title || 'NO_TITLE',
            item.body || 'NO_BODY'
          ].join('|');

          // Only count if it's unread and we haven't seen this content before
          if (item.is_read === 0) {
            uniqueUnread.add(key);
          }
        });
        setUnreadCount(uniqueUnread.size);
      }
    } catch (e) {
      console.log("Notification count error", e);
    }
  }, [user]);

  // LIVE LISTENER for header badge
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async () => {
      fetchUnreadCount();
    });
    return unsubscribe;
  }, [fetchUnreadCount]);


  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWalletBalance(null);
      return;
    }
    if (walletBalance === null) setLoadingWallet(true);
    try {
      const data = await getWalletSummary();
      const wb = Number(data.wallet_balance || 0);
      const lc = (data.loyalty_expiry_list || []).reduce(
        (sum, item) => sum + Number(item.credit_value || 0),
        0
      );
      setWalletBalance(wb + lc);
    } catch (e) {
      console.warn("Failed to fetch wallet summary", e);
      setWalletBalance(null);
    } finally {
      setLoadingWallet(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useFocusEffect(
    useCallback(() => {
      fetchWallet();
      fetchUnreadCount();
    }, [fetchWallet, fetchUnreadCount])
  );

  useEffect(() => {
    if (global.lastOrderUpdate) {
      fetchUnreadCount();
      global.lastOrderUpdate = null;
    }
  });


  const username = user?.full_name ? user.full_name.split(" ")[0] : "Guest";

  return (
    <>
      <StatusBar
        backgroundColor={statusColor || (transparent ? "#FFF9E0" : "#FFFFFF")}
        barStyle={barStyle || (statusColor ? "light-content" : "dark-content")}
      />

      {/* Container with top padding for status bar */}
      <View style={[
        styles.headerContainer,
        { paddingTop: disableSafeArea ? 0 : insets.top },
        transparent && { backgroundColor: "transparent", elevation: 0, shadowOpacity: 0 }
      ]}>
        <View style={styles.headerContent}>

          {/* LEFT: User Info Only */}
          <TouchableOpacity
            style={styles.profileContainer}
            activeOpacity={0.7}
            onPress={() => {
              if (!user) setAuthModalVisible(true);
              else navigation.navigate("Profile");
            }}
          >
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={18 * scale} color="#FFFFFF" />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.greetingText, textColor && { color: textColor }]}>Hello,</Text>
              <Text style={[styles.usernameText, textColor && { color: textColor }]} numberOfLines={1}>{username}</Text>
            </View>
          </TouchableOpacity>

          {/* RIGHT: Actions */}
          <View style={styles.rightActions}>

            <TouchableOpacity
              style={[styles.iconButton, { marginLeft: 0 }]}
              onPress={() => {
                if (!user) setAuthModalVisible(true);
                else navigation.navigate("Notifications");
              }}
            >
              <Ionicons name="notifications-outline" size={26 * scale} color={textColor || "#1C1C1C"} />

              {unreadCount > 0 && (
                <View style={[styles.badge, textColor === '#FFFFFF' && { backgroundColor: '#FFD700' }]}>
                  <Text style={[styles.badgeText, textColor === '#FFFFFF' && { color: '#000' }]}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (!user) setAuthModalVisible(true);
                else navigation.navigate("Credits");
              }}
              style={[styles.walletTouch, { marginLeft: 12 * scale }]}
            >
              {walletBalance !== null && walletBalance > 0 ? (
                <PremiumAnimatedBadge balance={walletBalance} loading={loadingWallet} />
              ) : (
                <View style={styles.emptyWallet}>
                  <Ionicons name="wallet-outline" size={22 * scale} color="#333" />
                </View>
              )}
            </TouchableOpacity>

            {/* Cart Icon */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => { if (!user) setAuthModalVisible(true); else navigation.navigate("CartSummary"); }}
            >
              <Ionicons name="cart-outline" size={26 * scale} color={textColor || "#1C1C1C"} />
              {totalItems > 0 && (
                <View style={[styles.badge, textColor === '#FFFFFF' && { backgroundColor: '#FFD700' }]}>
                  <Text style={[styles.badgeText, textColor === '#FFFFFF' && { color: '#000' }]}>{totalItems}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Menu Icon */}
            <TouchableOpacity style={[styles.iconButton, { marginRight: 0 }]} onPress={onMenuPress}>
              <Ionicons name="menu-outline" size={30 * scale} color={textColor || "#1C1C1C"} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <AuthRequiredModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSignIn={() => {
          setAuthModalVisible(false);
          try { navigation.replace("Login"); } catch (e) { navigation.navigate("Login"); }
        }}
      />
    </>
  );
}

const PremiumAnimatedBadge = ({ balance, loading }) => {
  return (
    <View style={styles.premiumBadge}>
      <View style={styles.goldTextRow}>
        <Text style={styles.goldSmallText}>WALLET</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#D4AF37" />
      ) : (
        <Text style={styles.premiumBadgeText}>£{balance.toFixed(2)}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Left: Profile / User Info
  profileContainer: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "50%",
  },
  avatarCircle: {
    width: 36 * scale,
    height: 36 * scale,
    borderRadius: 18 * scale,
    backgroundColor: "#C62828", // Match HomeScreen theme
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  textContainer: {
    justifyContent: "center",
  },
  greetingText: {
    fontFamily: "PoppinsMedium",
    fontSize: 11 * scale,
    color: "#1C1C1C", // Set to black as requested
    marginBottom: 0,
    fontWeight: "500",
  },
  usernameText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15 * scale,
    fontWeight: "700",
    color: "#1C1C1C",
  },

  // Right: Actions
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  walletTouch: {
    // No fixed margins here, controlled by inline style for order
  },
  emptyWallet: {
    width: 36 * scale,
    height: 36 * scale,
    borderRadius: 18 * scale,
    backgroundColor: "#F4F4F4",
    justifyContent: "center",
    alignItems: "center",
  },
  premiumBadge: {
    paddingVertical: 4 * scale,
    paddingHorizontal: 12 * scale,
    borderRadius: 100, // Pill shape
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D4AF37", // Gold Color
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  goldTextRow: {
    marginBottom: -2 * scale,
  },
  goldSmallText: {
    fontSize: 8 * scale,
    fontFamily: "PoppinsBold",
    fontWeight: "900",
    color: "#D4AF37",
    letterSpacing: 0.6,
  },

  premiumBadgeText: {
    color: "#1C1C1C",
    fontSize: 14 * scale,
    fontFamily: "PoppinsBold",
    fontWeight: "900",
  },

  iconButton: {
    marginLeft: 12 * scale, // Uniform spacing
    position: "relative",
    padding: 2,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -6,
    backgroundColor: "#E23744",
    minWidth: 18 * scale,
    height: 18 * scale,
    borderRadius: 9 * scale,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9 * scale,
    fontWeight: "bold",
  },
});
