// screens/Orders.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";

import AppHeader from "./AppHeader";
import { AuthRequiredInline } from "./AuthRequired";
import BottomBar from "./BottomBar";
import MenuModal from "./MenuModal";
import { Modal, ScrollView, Image, Dimensions, Platform, Linking } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { useIsFocused, useFocusEffect } from "@react-navigation/native";
import { getOrders } from "../services/orderService";
import { getOrder } from "../services/orderService";
import { getCart } from "../services/cartService";

const { width } = Dimensions.get("window");
const scale = width / 400;

export default function Orders({ navigation, route }) {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [cartItems, setCartItems] = useState({});
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);

  const isFocused = useIsFocused();
  const ORDER_STATUS = {
    0: { label: "Placed", color: "#f59e0b", icon: "paper-plane" }, // Amber
    1: { label: "Accepted", color: "#3b82f6", icon: "checkmark-circle" }, // Blue
    2: { label: "Rejected", color: "#ef4444", icon: "close-circle" }, // Red
    3: { label: "Ready", color: "#8b5cf6", icon: "gift" }, // Purple
    4: { label: "Collected", color: "#16a34a", icon: "checkmark-done-circle" }, // Vibrant Green
    5: { label: "Cancelled", color: "#6b7280", icon: "ban" } // Gray
  };

  const getOrderUIState = (status, etaTime, orderType, deliveryStatus, driverName) => {
    const s = Number(status);
    const isDelivery = String(orderType || '').toLowerCase() === 'delivery';

    if (isDelivery) {
      if (s === 4 || deliveryStatus === 'delivered') return { state: "DELIVERED" };
      if (deliveryStatus === 'out_for_delivery') return { state: "OUT_FOR_DELIVERY", driverName };
      if (deliveryStatus === 'accepted') return { state: "DRIVER_ASSIGNED", driverName };
    }

    if (s === 4) return { state: isDelivery ? "DELIVERED" : "COLLECTED" };
    if (s === 2) return { state: "REJECTED" };
    if (s === 5) return { state: "CANCELLED" };
    if (s === 3) return { state: isDelivery ? "OUT_FOR_DELIVERY" : "READY", driverName };
    if (s === 1 && etaTime) {
      const eta = new Date(etaTime.replace(" ", "T")).getTime();
      const now = Date.now();
      if (!isNaN(eta)) {
        const diffMin = Math.ceil((eta - now) / 60000);
        if (diffMin > 0) return { state: "COUNTDOWN", minutes: diffMin };
      }
    }
    return { state: "PREPARING" };
  };

  useEffect(() => {
    if (!isFocused) return;
    const timer = setInterval(() => { fetchOrders(true); }, 60000);
    return () => clearInterval(timer);
  }, [isFocused]);

  useEffect(() => {
    const loadUser = async () => {
      const stored = await AsyncStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    };
    loadUser();
  }, []);

  useEffect(() => {
    const fetchCart = async () => {
      if (!user) return;
      const customerId = user.id ?? user.customer_id;
      if (!customerId) return;
      try {
        const res = await getCart(customerId);
        if (res && res.status === 1 && Array.isArray(res.data)) {
          const map = {};
          res.data.forEach((item) => {
            const qty = item.product_quantity || 0;
            if (qty > 0) map[item.product_id] = (map[item.product_id] || 0) + qty;
          });
          setCartItems(map);
        } else setCartItems({});
      } catch (err) { console.log("Cart fetch error", err); }
    };
    if (isFocused && user) fetchCart();
  }, [isFocused, user]);

  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!user) return;
    const customerId = user.id ?? user.customer_id;
    if (!customerId) return;
    if (isRefresh) setRefreshing(true);
    else if (orders.length === 0) setLoading(true);

    try {
      const newOrderId = route?.params?.newOrderId;
      if (newOrderId) {
        const cachedSingle = await AsyncStorage.getItem(`order_${newOrderId}`);
        if (cachedSingle) {
          const parsed = JSON.parse(cachedSingle);
          setOrders(prev => {
            const exists = prev.find(o => (o.order_id || o.id) == (parsed.order_id || parsed.id));
            if (exists) return prev;
            return [parsed].concat(prev || []);
          });
        }
        navigation.setParams({ newOrderId: undefined });
      }

      let cachedArr = [];
      const cached = await AsyncStorage.getItem("orders_cache");
      if (cached) {
        cachedArr = JSON.parse(cached) || [];
        if (cachedArr.length > 0) {
          cachedArr.sort((a, b) => new Date(b.created_at || b.order_date || 0) - new Date(a.created_at || a.order_date || 0));
          setOrders(cachedArr);
          setLoading(false);
        }
      }

      const res = await getOrders(customerId);
      let fresh = null;
      if (res && res.status === 1) {
        fresh = res.data || res.orders || res.data?.data;
      }
      if (fresh && Array.isArray(fresh)) {
        fresh.sort((a, b) => new Date(b.created_at || b.order_date || 0) - new Date(a.created_at || a.order_date || 0));
        setOrders(fresh);
        await AsyncStorage.setItem("orders_cache", JSON.stringify(fresh));
      }
    } catch (err) { console.log("Orders fetch error", err); }
    finally { setRefreshing(false); setLoading(false); }
  }, [user, route, navigation]);

  useFocusEffect(useCallback(() => {
    if (!global.lastOrderUpdate) return;
    const { order_number, status } = global.lastOrderUpdate;
    setOrders(prev => prev.map(o => (o.order_no === order_number || o.order_number === order_number) ? { ...o, order_status: status, status } : o));
    global.lastOrderUpdate = null;
  }, []));

  useEffect(() => { if (isFocused && user) fetchOrders(); }, [isFocused, user, fetchOrders]);

  const renderStatusChip = (status, orderType, deliveryStatus) => {
    const isDelivery = String(orderType || '').toLowerCase() === 'delivery';
    if (isDelivery) {
      if (deliveryStatus === 'out_for_delivery') {
        return (
          <View style={[styles.statusChip, { backgroundColor: "#2563EB15", flexDirection: 'row', alignItems: 'center' }]}>
            <Ionicons name="bicycle" size={13} color="#2563EB" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: "#2563EB" }]}>Out for Delivery</Text>
          </View>
        );
      }
      if (deliveryStatus === 'accepted' && Number(status) !== 4) {
        return (
          <View style={[styles.statusChip, { backgroundColor: "#7C3AED15", flexDirection: 'row', alignItems: 'center' }]}>
            <Ionicons name="person" size={13} color="#7C3AED" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: "#7C3AED" }]}>Rider Assigned</Text>
          </View>
        );
      }
      if (Number(status) === 4 || deliveryStatus === 'delivered') {
        return (
          <View style={[styles.statusChip, { backgroundColor: "#16a34a15", flexDirection: 'row', alignItems: 'center' }]}>
            <Ionicons name="checkmark-done-circle" size={13} color="#16a34a" style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: "#16a34a" }]}>Delivered</Text>
          </View>
        );
      }
    }
    const cfg = ORDER_STATUS[Number(status)] || { label: "Processing", color: "#555", icon: "sync" };
    return (
      <View style={[styles.statusChip, { backgroundColor: cfg.color + "15", flexDirection: 'row', alignItems: 'center' }]}>
        <Ionicons name={cfg.icon} size={13} color={cfg.color} style={{ marginRight: 4 }} />
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    );
  };

  const renderOrder = ({ item }) => {
    const orderId = item.order_id || item.id;
    const orderNo = item.order_number || item.order_no || `#${orderId}`;
    const createdAt = item.created_at || item.order_date;
    let dateStr = "";
    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        dateStr =
          d.toLocaleDateString("en-GB") +
          ", " +
          d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      }
    }
    const total =
      item.net_amount ??
      item.total_amount ??
      item.grand_total ??
      item.amount ??
      0;
    const itemsCount =
      item.items_count || item.items?.length || item.item_count || 0;

    const ui = getOrderUIState(
      item.order_status ?? item.status,
      item.delivery_estimate_time,
      item.order_type,
      item.delivery_status,
      item.delivery_boy_name
    );
    const isEven = orderId % 2 === 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => openOrderDetails(orderId, item)}
      >
        <LinearGradient
          colors={
            isEven
              ? ["#FFFFFF", "rgba(255,43,92,0.03)"]
              : ["#FFFFFF", "rgba(22,163,74,0.03)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardInner}
        >
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.receiptIconBg}>
                <Ionicons name="receipt" size={16 * scale} color="#FF2B5C" />
              </View>
              <Text style={styles.orderNo}>{orderNo}</Text>
            </View>
            {renderStatusChip(item.order_status ?? item.status, item.order_type, item.delivery_status)}
          </View>

          <View style={styles.cardContent}>
            {dateStr ? (
              <View style={styles.infoRow}>
                <Ionicons
                  name="calendar-outline"
                  size={14 * scale}
                  color="#64748B"
                />
                <Text style={styles.dateText}>{dateStr}</Text>
              </View>
            ) : null}

            <View style={styles.mainInfoRow}>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>ITEMS</Text>
                <Text style={styles.infoValue}>
                  {itemsCount} {itemsCount === 1 ? "Item" : "Items"}
                </Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>TOTAL AMOUNT</Text>
                <Text style={styles.totalText}>£{Number(total).toFixed(2)}</Text>
              </View>
            </View>

            {item.special_instruction ? (
              <View style={styles.listInstructionBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={14 * scale} color="#F59E0B" style={{ marginRight: 6 }} />
                <Text style={styles.listInstructionText} numberOfLines={2}>
                  <Text style={{ fontFamily: 'PoppinsBold' }}>Note: </Text>{item.special_instruction}
                </Text>
              </View>
            ) : null}

            {ui.state === "COUNTDOWN" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#FFF9E5", borderColor: "#FFECB3" },
                ]}
              >
                <Ionicons
                  name="time"
                  size={16 * scale}
                  color="#f59e0b"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#f59e0b" }]}>
                  Estimated ready in {ui.minutes} min
                </Text>
              </View>
            )}
            {ui.state === "PREPARING" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },
                ]}
              >
                <Ionicons
                  name="restaurant"
                  size={16 * scale}
                  color="#64748B"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#64748B" }]}>
                  Your order is being prepared
                </Text>
              </View>
            )}
            {ui.state === "READY" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F3E5F5", borderColor: "#E1BEE7" },
                ]}
              >
                <Ionicons
                  name="gift"
                  size={16 * scale}
                  color="#8b5cf6"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#8b5cf6" }]}>
                  Order is ready for pickup
                </Text>
              </View>
            )}
            {ui.state === "OUT_FOR_DELIVERY" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
                ]}
              >
                <Ionicons
                  name="bicycle"
                  size={16 * scale}
                  color="#2563EB"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#2563EB", fontWeight: "700" }]}>
                  🛵 Out for Delivery — {ui.driverName ? `${ui.driverName} is ` : ''}on the way to you!
                </Text>
              </View>
            )}
            {ui.state === "DRIVER_ASSIGNED" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE" },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={16 * scale}
                  color="#7C3AED"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#7C3AED", fontWeight: "700" }]}>
                  🛵 Rider Assigned: {ui.driverName || 'Delivery Partner'} (Heading to restaurant)
                </Text>
              </View>
            )}
            {ui.state === "DELIVERED" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" },
                ]}
              >
                <Ionicons
                  name="checkmark-done-circle"
                  size={16 * scale}
                  color="#16a34a"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#16a34a", fontWeight: "700" }]}>
                  Order delivered successfully to your door 🎉
                </Text>
              </View>
            )}
            {ui.state === "COLLECTED" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" },
                ]}
              >
                <Ionicons
                  name="checkmark-done-circle"
                  size={16 * scale}
                  color="#16a34a"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#16a34a" }]}>
                  Order collected successfully
                </Text>
              </View>
            )}
            {ui.state === "REJECTED" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#FEF2F2", borderColor: "#FEE2E2" },
                ]}
              >
                <Ionicons
                  name="close-circle"
                  size={16 * scale}
                  color="#ef4444"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#ef4444" }]}>
                  Order was rejected
                </Text>
              </View>
            )}
            {ui.state === "CANCELLED" && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },
                ]}
              >
                <Ionicons
                  name="ban"
                  size={16 * scale}
                  color="#94A3B8"
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.statusBadgeText, { color: "#94A3B8" }]}>
                  Order cancelled
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const openOrderDetails = async (orderId, item = null) => {
    setDetailsLoading(true); setDetailsVisible(true);
    try {
      const key = `order_${orderId}`;
      const cached = await AsyncStorage.getItem(key);
      if (cached) { setOrderDetails(JSON.parse(cached)); setDetailsLoading(false); }
      const res = await getOrder(orderId);
      if (res?.status === 1 && res.data) {
        setOrderDetails(res.data);
        await AsyncStorage.setItem(key, JSON.stringify(res.data));
      } else if (!orderDetails) setOrderDetails(item);
    } catch (e) { console.warn(e); } finally { setDetailsLoading(false); }
  };

  return (
    <View style={styles.root}>
      <AppHeader user={user} navigation={navigation} cartItems={cartItems} onMenuPress={() => setMenuVisible(true)} />
      {!user ? (
        <View style={styles.centerBox}><AuthRequiredInline onSignIn={() => navigation.replace("Login")} description={"Sign in to view your orders."} /></View>
      ) : loading ? (
        <View style={styles.centerBox}><ActivityIndicator size="large" /><Text style={styles.loadingText}>Loading orders...</Text></View>
      ) : orders.length === 0 ? (
        <View style={styles.centerBox}><Ionicons name="receipt-outline" size={60} color="#d0d0d0" /><Text style={styles.emptyTitle}>No orders yet</Text></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item, index) => String(item.order_id || item.id || index)}
          renderItem={renderOrder}
          refreshing={refreshing}
          onRefresh={() => fetchOrders(true)}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ListHeaderComponent={<View style={styles.headerRow}><Ionicons name="bag-check-outline" size={20} color="#16a34a" /><Text style={styles.headerTitle}>Your Orders</Text></View>}
        />
      )}
      <MenuModal visible={menuVisible} setVisible={setMenuVisible} user={user} navigation={navigation} />
      <Modal visible={detailsVisible} transparent animationType="slide" onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setDetailsVisible(false)} />
          <View style={styles.bottomSheet}>
            <LinearGradient
              colors={['#1e293b', '#334155', '#1e293b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>{orderDetails?.order_number || orderDetails?.order_no || "Order Details"}</Text>
                  {orderDetails?.created_at && (
                    <Text style={styles.sheetSubtitle}>
                      {new Date(orderDetails.created_at).toLocaleString()}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setDetailsVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
                {detailsLoading ? <ActivityIndicator size="large" style={{ marginTop: 20 }} /> : orderDetails ? (
                  <>
                    {/* ORDER INFO CARD */}
                    <View style={styles.orderInfoCard}>
                      <View style={styles.orderInfoRow}>
                        <View style={styles.orderInfoItem}>
                          <Text style={styles.orderInfoLabel}>TYPE</Text>
                          <View style={[styles.orderInfoValueBox, { backgroundColor: (orderDetails.order_type === 'kerbside' || orderDetails.delivery_type === 'kerbside') ? '#DBEAFE' : '#DCFCE7' }]}>
                            <Ionicons
                              name={(orderDetails.order_type === 'kerbside' || orderDetails.delivery_type === 'kerbside') ? "car-sport" : (orderDetails.order_type === 'delivery' || orderDetails.shipping_method === 'delivery' ? "bicycle" : "storefront")}
                              size={14}
                              color={(orderDetails.order_type === 'kerbside' || orderDetails.delivery_type === 'kerbside') ? "#1E40AF" : "#15803d"}
                              style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.orderInfoValue, { color: (orderDetails.order_type === 'kerbside' || orderDetails.delivery_type === 'kerbside') ? '#1E40AF' : '#15803d' }]}>
                              {(() => {
                                const type = (orderDetails.order_type || orderDetails.shipping_method || orderDetails.delivery_type || "").toLowerCase();
                                if (type.includes('kerb') || type.includes('curb')) return "KERBSIDE";
                                if (type.includes('deliver')) return "DELIVERY";
                                return "IN-STORE";
                              })()}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.verticalDivider} />
                        <View style={styles.orderInfoItem}>
                          <Text style={styles.orderInfoLabel}>PAYMENT</Text>
                          <Text style={styles.orderInfoValueBasic}>
                            {(orderDetails.payment_method || orderDetails.payment_type || "Paid").toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.verticalDivider} />
                        <View style={styles.orderInfoItem}>
                          <Text style={styles.orderInfoLabel}>STATUS</Text>
                          <Text style={[styles.orderInfoValueBasic, { color: ORDER_STATUS[Number(orderDetails.order_status ?? orderDetails.status)]?.color || '#333' }]}>
                            {ORDER_STATUS[Number(orderDetails.order_status ?? orderDetails.status)]?.label || "Unknown"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* KERBSIDE VEHICLE DETAILS */}
                    {((orderDetails.order_type || orderDetails.delivery_type || "").toLowerCase().includes('kerb') || (orderDetails.order_type || orderDetails.delivery_type || "").toLowerCase().includes('curb')) && (
                      <View style={styles.kerbsideBox}>
                        <View style={styles.kerbsideHeader}>
                          <Ionicons name="car-sport" size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                          <Text style={styles.kerbsideTitle}>Vehicle Details</Text>
                        </View>
                        <View style={styles.kerbsideDetailsRow}>
                          {(orderDetails.car_number || orderDetails.vehicle_number) ? (
                            <View style={styles.kerbsideDetailItem}>
                              <Text style={styles.kerbsideLabel}>NUMBER</Text>
                              <Text style={styles.kerbsideValue}>{(orderDetails.car_number || orderDetails.vehicle_number).toUpperCase()}</Text>
                            </View>
                          ) : null}
                          {(orderDetails.car_model || orderDetails.vehicle_model) ? (
                            <View style={styles.kerbsideDetailItem}>
                              <Text style={styles.kerbsideLabel}>MODEL</Text>
                              <Text style={styles.kerbsideValue}>{orderDetails.car_model || orderDetails.vehicle_model}</Text>
                            </View>
                          ) : null}
                          {(orderDetails.car_color || orderDetails.vehicle_color) ? (
                            <View style={styles.kerbsideDetailItem}>
                              <Text style={styles.kerbsideLabel}>COLOR</Text>
                              <Text style={styles.kerbsideValue}>{orderDetails.car_color || orderDetails.vehicle_color}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    )}

                    {/* ASSIGNED DELIVERY PARTNER */}
                    {(orderDetails.delivery_boy_name || orderDetails.delivery_status === 'out_for_delivery' || orderDetails.delivery_status === 'accepted') && (
                      <View style={[styles.kerbsideBox, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4', marginBottom: 14 }]}>
                        <View style={styles.kerbsideHeader}>
                          <Ionicons name="bicycle" size={18} color="#15803d" style={{ marginRight: 8 }} />
                          <Text style={[styles.kerbsideTitle, { color: '#15803d' }]}>Delivery Partner</Text>
                          <View style={{ marginLeft: 'auto', backgroundColor: orderDetails.delivery_status === 'out_for_delivery' ? '#DBEAFE' : '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                            <Text style={{ fontSize: 10 * scale, fontWeight: '800', color: orderDetails.delivery_status === 'out_for_delivery' ? '#1D4ED8' : '#15803d' }}>
                              {orderDetails.delivery_status === 'out_for_delivery' ? '🛵 OUT FOR DELIVERY' : '⚡ ASSIGNED'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ fontSize: 15 * scale, fontWeight: '800', color: '#0F172A' }}>
                              {orderDetails.delivery_boy_name || 'Delivery Partner'}
                            </Text>
                            <Text style={{ fontSize: 12 * scale, color: '#64748B', marginTop: 2 }}>
                              {orderDetails.delivery_status === 'out_for_delivery'
                                ? 'Rider is on the way to your delivery address'
                                : 'Assigned to your order and heading to branch'}
                            </Text>
                          </View>
                          {orderDetails.delivery_boy_phone ? (
                            <TouchableOpacity
                              style={{ backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                              onPress={() => Linking.openURL(`tel:${orderDetails.delivery_boy_phone.replace(/[^0-9+]/g, '')}`)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="call" size={14} color="#FFF" />
                              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 * scale }}>Call</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    )}

                    {/* HOME DELIVERY DETAILS */}
                    {(orderDetails.delivery_address || orderDetails.order_type === 'delivery' || orderDetails.delivery_type === 'home') && (
                      <View style={[styles.kerbsideBox, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                        <View style={styles.kerbsideHeader}>
                          <Ionicons name="bicycle" size={16} color="#2563EB" style={{ marginRight: 8 }} />
                          <Text style={[styles.kerbsideTitle, { color: '#1D4ED8' }]}>Delivery Address</Text>
                          {(orderDetails.postcode || orderDetails.pincode) ? (
                            <View style={{ marginLeft: 'auto', backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10 * scale, fontWeight: '800', color: '#1D4ED8' }}>
                                {orderDetails.postcode || orderDetails.pincode}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={{ padding: 12 }}>
                          {orderDetails.house_flat_no ? (
                            <Text style={{ fontSize: 14 * scale, fontWeight: '700', color: '#0F172A', marginBottom: 2 }}>
                              {orderDetails.house_flat_no}
                            </Text>
                          ) : null}
                          <Text style={{ fontSize: 13 * scale, color: '#334155', lineHeight: 18 * scale }}>
                            {orderDetails.street_landmark
                              ? `${orderDetails.street_landmark}${orderDetails.city ? `, ${orderDetails.city}` : ''}`
                              : orderDetails.delivery_address}
                          </Text>
                          {orderDetails.delivery_instructions ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#FEF3C7', padding: 8, borderRadius: 6 }}>
                              <Ionicons name="chatbubble-outline" size={12} color="#D97706" style={{ marginRight: 6 }} />
                              <Text style={{ fontSize: 11 * scale, color: '#92400E', fontWeight: '600' }}>
                                Note: {orderDetails.delivery_instructions}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    )}

                    <Text style={styles.sectionHeader}>ITEMS</Text>
                    <View style={styles.itemsList}>
                      {(orderDetails.items || orderDetails.order_items || orderDetails.products || []).map((it, idx) => (
                        <View key={idx} style={styles.itemRowContainer}>
                          <View style={styles.itemRow}>
                            <View style={styles.itemInfo}>
                              <Text style={styles.itemName}>{it.name || it.product_name}</Text>
                              {it.contains ? <Text style={styles.itemMeta}>{it.contains}</Text> : null}
                            </View>
                            <Text style={styles.itemQty}>x{it.quantity || it.product_quantity}</Text>
                            <Text style={styles.itemPrice}>£{(Number(it.price || it.product_price) * (it.quantity || it.product_quantity)).toFixed(2)}</Text>
                          </View>
                          {(it.special_instruction || it.notes || it.instruction || it.special_instructions || it.note || it.textfield || (it.pivot && it.pivot.special_instruction)) ? (
                            <View style={styles.specialInstructionBox}>
                              <Ionicons name="chatbox-ellipses-outline" size={12 * scale} color="#94A3B8" style={{ marginRight: 6, marginTop: 2 }} />
                              <Text style={styles.specialInstruction}>
                                {it.special_instruction || it.notes || it.instruction || it.special_instructions || it.note || it.textfield || (it.pivot && it.pivot.special_instruction)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>

                    {orderDetails.special_instruction ? (
                      <View style={styles.globalInstructionBox}>
                        <View style={styles.instructionHeader}>
                          <Ionicons name="warning" size={16 * scale} color="#047857" style={{ marginRight: 6 }} />
                          <Text style={styles.globalInstructionLabel}>SPECIAL INSTRUCTION</Text>
                        </View>
                        <Text style={styles.globalInstructionText}>{orderDetails.special_instruction}</Text>
                      </View>
                    ) : null}

                    <View style={styles.divider} />

                    <View style={styles.billSection}>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>Subtotal</Text>
                        <Text style={styles.billValue}>£{Number(orderDetails.sub_total || orderDetails.total_amount || orderDetails.grand_total || (orderDetails.items || orderDetails.order_items || []).reduce((sum, item) => sum + (Number(item.price || item.product_price) * (item.quantity || item.product_quantity)), 0)).toFixed(2)}</Text>
                      </View>
                      {Number(orderDetails.wallet_used || 0) > 0 && (
                        <View style={styles.billRow}>
                          <Text style={[styles.billLabel, { color: '#16a34a' }]}>Wallet Used</Text>
                          <Text style={[styles.billValue, { color: '#16a34a' }]}>-£{Number(orderDetails.wallet_used).toFixed(2)}</Text>
                        </View>
                      )}
                      {Number(orderDetails.loyalty_used || 0) > 0 && (
                        <View style={styles.billRow}>
                          <Text style={[styles.billLabel, { color: '#0EA5E9' }]}>Loyalty Discount</Text>
                          <Text style={[styles.billValue, { color: '#0EA5E9' }]}>-£{Number(orderDetails.loyalty_used).toFixed(2)}</Text>
                        </View>
                      )}
                      <View style={styles.divider} />
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Grand Total</Text>
                        <Text style={styles.totalValue}>
                          £{Number(orderDetails.net_amount || orderDetails.total_amount || orderDetails.grand_total || orderDetails.amount || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </LinearGradient>
          </View>
        </View>
      </Modal>
      <BottomBar navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 4,
  },
  headerTitle: {
    marginLeft: 12,
    fontSize: 22 * scale,
    fontFamily: "PoppinsBold",
    color: "#0F172A",
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30 },
  loadingText: { marginTop: 10, fontSize: 14 * scale, color: "#64748B", fontFamily: 'PoppinsMedium' },
  emptyTitle: { marginTop: 12, fontSize: 20 * scale, fontFamily: "PoppinsBold", color: "#94A3B8" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginBottom: 16,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  receiptIconBg: {
    width: 32 * scale,
    height: 32 * scale,
    borderRadius: 10,
    backgroundColor: 'rgba(255,43,92,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  orderNo: {
    fontSize: 16 * scale,
    fontFamily: "PoppinsBold",
    color: "#0F172A",
    fontWeight: '800',
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11 * scale,
    fontFamily: 'PoppinsBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '900', // Enforce bold
  },
  cardContent: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  dateText: {
    fontSize: 13 * scale,
    color: "#64748B",
    marginLeft: 8,
    fontFamily: 'PoppinsMedium',
  },
  mainInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,250,252,0.8)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
  },
  infoDivider: {
    width: 1,
    height: 25,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  infoLabel: {
    fontSize: 9 * scale,
    fontFamily: 'PoppinsBold',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14 * scale,
    fontFamily: 'PoppinsBold',
    color: '#1E293B',
  },
  totalText: {
    fontSize: 18 * scale,
    fontFamily: 'PoppinsBold',
    color: '#16a34a',
    fontWeight: '900',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsBold',
    flex: 1,
    fontWeight: '800', // Enforce bold
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  // PREMIUM MODAL STYLES
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    // backgroundColor: '#fff', // Removed to let gradient show
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '90%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
    overflow: 'hidden', // Ensure gradient stays inside bounds
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', // Subtle separator
  },
  sheetTitle: {
    fontSize: 18 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
    fontWeight: '900',
  },
  sheetSubtitle: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsMedium',
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
  },
  itemsList: {
    paddingBottom: 8,
  },
  itemRowContainer: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  specialInstructionBox: {
    flexDirection: 'row',
    marginTop: 6,
    paddingLeft: 2,
    alignItems: 'flex-start',
  },
  listInstructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 251, 235, 0.6)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.4)',
  },
  listInstructionText: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsMedium',
    color: '#92400E',
    flex: 1,
  },
  globalInstructionBox: {
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  globalInstructionLabel: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsBold',
    color: '#047857',
    letterSpacing: 1,
    fontWeight: '900',
  },
  globalInstructionText: {
    fontSize: 14 * scale,
    fontFamily: 'PoppinsMedium',
    color: '#064E3B',
    lineHeight: 22,
  },
  orderInfoCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  verticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  orderInfoLabel: {
    fontSize: 10 * scale,
    fontFamily: 'PoppinsBold',
    color: '#94A3B8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  orderInfoValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  orderInfoValue: {
    fontSize: 12 * scale,
    fontFamily: 'PoppinsBold',
    color: '#15803d',
    fontWeight: '800',
  },
  orderInfoValueBasic: {
    fontSize: 13 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
  },
  sectionHeader: {
    fontSize: 13 * scale,
    fontFamily: 'PoppinsBold',
    color: '#94A3B8',
    marginBottom: 10,
    letterSpacing: 1,
    marginLeft: 4,
  },
  specialInstruction: {
    fontSize: 11 * scale,
    fontFamily: 'PoppinsMedium', // Italic style handled by font or just normal
    fontStyle: 'italic',
    color: '#CBD5E1',
    flexShrink: 1,
    lineHeight: 16,
  },
  itemInfo: {
    flex: 1,
    paddingRight: 10,
  },
  itemName: {
    fontSize: 15 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 12 * scale,
    color: '#94A3B8',
  },
  itemQty: {
    fontSize: 14 * scale,
    fontFamily: 'PoppinsBold',
    color: '#CBD5E1',
    marginRight: 16,
    width: 30,
    textAlign: 'center',
  },
  itemPrice: {
    fontSize: 15 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
    minWidth: 60,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1,
  },
  billSection: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)', // Semi-transparent to blend with gradient
    borderRadius: 16,
    padding: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  billLabel: {
    fontSize: 14 * scale,
    fontFamily: 'PoppinsMedium',
    color: '#94A3B8',
  },
  billValue: {
    fontSize: 14 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
    fontWeight: '900',
  },
  totalValue: {
    fontSize: 20 * scale,
    fontFamily: 'PoppinsBold',
    color: '#4ade80',
    fontWeight: '900',
  },
  kerbsideBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  kerbsideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59, 130, 246, 0.1)',
    paddingBottom: 8,
  },
  kerbsideTitle: {
    fontSize: 13 * scale,
    fontFamily: 'PoppinsBold',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  kerbsideDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kerbsideDetailItem: {
    flex: 1,
    marginRight: 8,
  },
  kerbsideLabel: {
    fontSize: 10 * scale,
    fontFamily: 'PoppinsBold',
    color: '#94A3B8',
    marginBottom: 2,
  },
  kerbsideValue: {
    fontSize: 13 * scale,
    fontFamily: 'PoppinsBold',
    color: '#F8FAFC',
  },
});
