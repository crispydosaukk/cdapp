import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { width } = Dimensions.get('window');
const scale = width / 400;

export default function DeliveryHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20);

  const [partner, setPartner] = useState(null);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'active' | 'completed'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Delivery Handover Confirmation Modal State
  const [confirmOrder, setConfirmOrder] = useState(null);

  // Success Celebration Modal State
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationMsg, setCelebrationMsg] = useState('');
  const scaleCelebration = React.useRef(new Animated.Value(0)).current;

  // Custom Alert Modal State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState('info');
  const alertScale = React.useRef(new Animated.Value(0)).current;

  // Logout Modal State
  const [logoutVisible, setLogoutVisible] = useState(false);

  const showAlert = (title, msg, type = 'info') => {
    setAlertTitle(title);
    setAlertMsg(msg);
    setAlertType(type);
    setAlertVisible(true);
    Animated.spring(alertScale, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const hideAlert = () => {
    Animated.timing(alertScale, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setAlertVisible(false));
  };

  const showCelebration = (msg) => {
    setCelebrationMsg(msg);
    setCelebrationVisible(true);
    Animated.spring(scaleCelebration, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  const hideCelebration = () => {
    Animated.timing(scaleCelebration, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setCelebrationVisible(false));
  };

  // Load saved partner session
  useEffect(() => {
    const loadSession = async () => {
      try {
        const stored = await AsyncStorage.getItem('delivery_partner');
        if (stored) {
          setPartner(JSON.parse(stored));
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'DeliveryLogin' }] });
        }
      } catch (e) {
        console.log('Session load error:', e);
      }
    };
    loadSession();
  }, []);

  // Real-time Firestore subscription to delivery orders
  useEffect(() => {
    setLoading(true);
    const unsubscribe = firestore()
      .collection('orders')
      .onSnapshot(
        (snapshot) => {
          if (!snapshot) return;
          const list = snapshot.docs.map((doc) => {
            const data = doc.data();
            let createdAtDate = null;
            if (data.created_at?.toDate) {
              createdAtDate = data.created_at.toDate();
            } else if (data.created_at) {
              createdAtDate = new Date(data.created_at);
            }
            return {
              id: doc.id,
              ...data,
              created_at: createdAtDate,
            };
          });

          // Filter to only delivery orders
          const deliveryOnly = list.filter(
            (o) => o.order_type === 'delivery' || o.delivery_address || o.delivery_type === 'home'
          );

          // Sort newest first
          deliveryOnly.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          setOrders(deliveryOnly);
          setLoading(false);
          setRefreshing(false);
        },
        (err) => {
          console.log('Orders snapshot error:', err);
          setLoading(false);
          setRefreshing(false);
        }
      );

    return () => unsubscribe();
  }, []);

  // Logout handler
  const confirmSignOut = async () => {
    try {
      setLogoutVisible(false);
      await auth().signOut();
      await AsyncStorage.removeItem('delivery_partner');
      await AsyncStorage.removeItem('user_type');
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  // 1. Available (Unassigned) Orders - Scoped to Driver's Restaurant
  const availableOrders = orders.filter((o) => {
    const isUnassigned = !o.assigned_delivery_boy_id || o.delivery_status === 'unassigned';
    const isActive = o.order_status !== 4 && o.order_status !== 2 && o.order_status !== 5;
    const matchesRestaurant =
      !partner?.restaurant_id ||
      String(o.user_id) === String(partner.restaurant_id) ||
      String(o.restaurant_id) === String(partner.restaurant_id);
    return isUnassigned && isActive && matchesRestaurant;
  });

  // 2. Active Deliveries for Current Partner
  const myActiveOrders = orders.filter((o) => {
    const isMine =
      partner &&
      (String(o.assigned_delivery_boy_id) === String(partner.id) ||
       String(o.assigned_delivery_boy_id) === String(partner.uid));
    const notDone = o.delivery_status !== 'delivered' && o.order_status !== 4;
    return isMine && notDone;
  });

  // 3. Completed Deliveries for Current Partner
  const myCompletedOrders = orders.filter((o) => {
    const isMine =
      partner &&
      (String(o.assigned_delivery_boy_id) === String(partner.id) ||
       String(o.assigned_delivery_boy_id) === String(partner.uid));
    const isDone = o.delivery_status === 'delivered' || o.order_status === 4;
    return isMine && isDone;
  });

  // Action: Accept Order
  const handleAcceptOrder = async (order) => {
    if (!partner) return;
    try {
      setActionLoading(true);
      const orderRef = firestore().collection('orders').doc(order.id);

      // Verify if another driver already accepted it
      const currentSnap = await orderRef.get();
      const currentData = currentSnap.data();
      if (currentData.assigned_delivery_boy_id && currentData.assigned_delivery_boy_id !== partner.id) {
        setActionLoading(false);
        showAlert('Order Taken', 'Another delivery partner has already accepted this order.', 'info');
        return;
      }

      await orderRef.update({
        assigned_delivery_boy_id: partner.id,
        delivery_boy_name: partner.name || 'Delivery Partner',
        delivery_boy_phone: partner.mobile_number || '',
        delivery_boy_email: partner.email || '',
        delivery_status: 'accepted',
        accepted_at: firestore.FieldValue.serverTimestamp(),
      });

      setActionLoading(false);
      setActiveTab('active');
      showCelebration('Order accepted! Head to the restaurant or customer destination.');
    } catch (e) {
      setActionLoading(false);
      console.log('Accept order error:', e);
      showAlert('Error', 'Failed to accept order. Please try again.', 'error');
    }
  };

  // Action: Out for Delivery
  const handleStartDelivery = async (order) => {
    try {
      setActionLoading(true);
      await firestore().collection('orders').doc(order.id).update({
        delivery_status: 'out_for_delivery',
      });
      setActionLoading(false);
      showCelebration('Order is now Out for Delivery! Drive safely 🛵');
    } catch (e) {
      setActionLoading(false);
      showAlert('Error', 'Failed to update delivery status.', 'error');
    }
  };

  // Action: Mark as Delivered (Triggers confirmation modal)
  const initiateMarkDelivered = (order) => {
    setConfirmOrder(order);
  };

  const handleConfirmDelivered = async () => {
    if (!confirmOrder) return;
    try {
      setActionLoading(true);
      const targetId = confirmOrder.id;
      setConfirmOrder(null);

      await firestore().collection('orders').doc(targetId).update({
        delivery_status: 'delivered',
        order_status: 4,
        delivered_at: firestore.FieldValue.serverTimestamp(),
      });

      setActionLoading(false);
      setActiveTab('completed');
      showCelebration('Order marked as Delivered! Great work 🎉');
    } catch (e) {
      setActionLoading(false);
      showAlert('Error', 'Failed to complete delivery submission.', 'error');
    }
  };

  // Action: Call Customer
  const handleCallCustomer = (phone) => {
    if (!phone) {
      showAlert('No Phone Number', 'Customer phone number is not available for this order.', 'info');
      return;
    }
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      showAlert('Call Failed', 'Unable to initiate phone call on this device.', 'error');
    });
  };

  // Action: Open Maps Directions
  const handleOpenMaps = (address, coords) => {
    let url = '';
    const lat = coords?.lat ?? coords?.latitude;
    const lng = coords?.lng ?? coords?.longitude;

    if (lat && lng) {
      url =
        Platform.select({
          ios: `maps://app?daddr=${lat},${lng}`,
          android: `google.navigation:q=${lat},${lng}`,
        }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    } else if (address) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    } else {
      showAlert('No Address', 'Delivery destination coordinates or address are missing.', 'error');
      return;
    }

    Linking.openURL(url).catch(() => {
      // Web fallback
      if (lat && lng) {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
      }
    });
  };

  // Render Available Order Card
  const renderAvailableCard = ({ item }) => {
    const items = item.items || item.order_items || [];
    const totalQty = items.reduce((s, i) => s + (Number(i.quantity || i.product_quantity) || 1), 0);
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);
    const isCOD = item.payment_mode === 0;

    return (
      <View style={styles.card}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View>
            <View style={styles.orderNumberRow}>
              <Text style={styles.orderNumber}>{item.order_number || `#ORD-${item.id.slice(-5)}`}</Text>
              <View style={styles.readyBadge}>
                <View style={styles.readyDot} />
                <Text style={styles.readyText}>READY FOR PICKUP</Text>
              </View>
            </View>
            <Text style={styles.timeText}>
              {item.created_at
                ? item.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Recently placed'}
            </Text>
          </View>
          <Text style={styles.priceTag}>£{amount}</Text>
        </View>

        {/* Destination Box */}
        <View style={styles.destinationBox}>
          <Ionicons name="location" size={20} color="#15803d" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={styles.destHeaderRow}>
              <Text style={styles.destLabel}>DELIVERY ADDRESS</Text>
              {(item.postcode || item.pincode) ? (
                <View style={styles.postcodeBadge}>
                  <Text style={styles.postcodeBadgeText}>{item.postcode || item.pincode}</Text>
                </View>
              ) : null}
            </View>

            {item.house_flat_no ? (
              <Text style={styles.destHouseText}>
                🏠 Flat/House: <Text style={{ fontWeight: '800' }}>{item.house_flat_no}</Text>
              </Text>
            ) : null}

            <Text style={styles.destAddress} numberOfLines={2}>
              {item.street_landmark
                ? `${item.street_landmark}${item.city ? `, ${item.city}` : ''}`
                : item.delivery_address || 'Address provided at checkout'}
            </Text>

            {item.delivery_instructions ? (
              <View style={styles.riderInstructionTag}>
                <Ionicons name="bicycle" size={13} color="#D97706" />
                <Text style={styles.riderInstructionText} numberOfLines={1}>
                  Note: {item.delivery_instructions}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Meta Bar */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={15} color="#64748B" />
            <Text style={styles.metaText}>{item.customer_name || 'Customer'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="bag-handle-outline" size={15} color="#64748B" />
            <Text style={styles.metaText}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>
          </View>
          <View
            style={[
              styles.paymentPill,
              { backgroundColor: isCOD ? '#FEF3C7' : '#ECFDF5' },
            ]}
          >
            <Text style={[styles.paymentPillText, { color: isCOD ? '#B45309' : '#15803d' }]}>
              {isCOD ? '💵 Cash on Delivery' : '✅ Paid Online'}
            </Text>
          </View>
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={styles.actionBtnPrimary}
          onPress={() => handleAcceptOrder(item)}
          disabled={actionLoading}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#1a8b50', '#21a863', '#34c87c']}
            style={styles.btnGradient}
          >
            <MaterialIcons name="delivery-dining" size={22} color="#FFF" />
            <Text style={styles.btnTextWhite}>ACCEPT ORDER</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  // Render My Active Order Card
  const renderActiveCard = ({ item }) => {
    const items = item.items || item.order_items || [];
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);
    const customerPhone = item.mobile_number || item.customer_phone || item.phone;
    const isOut = item.delivery_status === 'out_for_delivery';
    const isCOD = item.payment_mode === 0;

    return (
      <View style={[styles.card, styles.activeCardBorder]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.order_number || `#ORD-${item.id.slice(-5)}`}</Text>
            <View
              style={[
                styles.statusBadge,
                isOut ? styles.statusBadgeOut : styles.statusBadgeAccepted,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isOut ? styles.statusTextOut : styles.statusTextAccepted,
                ]}
              >
                {isOut ? '🛵 OUT FOR DELIVERY' : '⚡ ACCEPTED — HEAD TO DESTINATION'}
              </Text>
            </View>
          </View>
          <Text style={styles.priceTag}>£{amount}</Text>
        </View>

        {/* Customer Bar */}
        <View style={styles.customerBox}>
          <View style={styles.customerInfo}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>
                {(item.customer_name || 'C').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.customerName}>{item.customer_name || 'Customer'}</Text>
              <Text style={styles.customerPhone}>{customerPhone || 'Phone hidden'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => handleCallCustomer(customerPhone)}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={16} color="#FFF" />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        </View>

        {/* Destination & Navigation */}
        <View style={styles.destinationBoxActive}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Ionicons name="location" size={22} color="#2563EB" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <View style={styles.destHeaderRow}>
                <Text style={styles.destLabelActive}>DELIVERY DESTINATION</Text>
                {(item.postcode || item.pincode) ? (
                  <View style={styles.activePostcodeBadge}>
                    <Text style={styles.activePostcodeBadgeText}>
                      {item.postcode || item.pincode}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.house_flat_no ? (
                <View style={styles.activeHouseBadge}>
                  <Ionicons name="home" size={14} color="#2563EB" />
                  <Text style={styles.activeHouseText}>Flat / House: {item.house_flat_no}</Text>
                </View>
              ) : null}

              <Text style={styles.destAddressActive}>
                {item.street_landmark
                  ? `${item.street_landmark}${item.city ? `, ${item.city}` : ''}${
                      item.postcode ? ` - ${item.postcode}` : ''
                    }`
                  : item.delivery_address || 'Address provided at checkout'}
              </Text>

              {item.delivery_instructions ? (
                <View style={styles.activeRiderInstructionBox}>
                  <Ionicons name="bicycle" size={16} color="#D97706" />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.activeRiderInstructionTitle}>CUSTOMER NOTE</Text>
                    <Text style={styles.activeRiderInstructionDesc}>
                      {item.delivery_instructions}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Navigation Button */}
          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={() => handleOpenMaps(item.delivery_address, item.delivery_coords)}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              style={styles.navigateGrad}
            >
              <Ionicons name="navigate" size={18} color="#FFF" />
              <Text style={styles.navigateBtnText}>Open in Google Maps / Directions</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Order Items Preview */}
        <View style={styles.itemsBox}>
          <Text style={styles.itemsHeading}>ORDER ITEMS ({items.length})</Text>
          {items.map((it, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.itemQty}>{it.quantity || it.product_quantity || 1}x</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {it.product_name || it.name}
              </Text>
              <Text style={styles.itemPrice}>
                £
                {(
                  Number(it.price || it.product_price || 0) *
                  Number(it.quantity || it.product_quantity || 1)
                ).toFixed(2)}
              </Text>
            </View>
          ))}
          {item.allergy_note ? (
            <View style={styles.noteBox}>
              <Ionicons name="warning-outline" size={14} color="#D97706" />
              <Text style={styles.noteText}>Allergy alert: {item.allergy_note}</Text>
            </View>
          ) : null}
        </View>

        {/* Payment Mode Alert */}
        <View
          style={[
            styles.paymentAlertBox,
            { backgroundColor: isCOD ? '#FEF3C7' : '#ECFDF5', borderColor: isCOD ? '#FCD34D' : '#A7F3D0' },
          ]}
        >
          <Ionicons
            name={isCOD ? 'cash-outline' : 'checkmark-circle-outline'}
            size={18}
            color={isCOD ? '#B45309' : '#15803d'}
          />
          <Text
            style={[
              styles.paymentAlertText,
              { color: isCOD ? '#B45309' : '#15803d' },
            ]}
          >
            {isCOD
              ? `COLLECT CASH ON DELIVERY: £${amount}`
              : 'PREPAID ONLINE — DO NOT COLLECT CASH'}
          </Text>
        </View>

        {/* Progression Action Buttons */}
        <View style={styles.actionButtonsWrap}>
          {!isOut ? (
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => handleStartDelivery(item)}
              disabled={actionLoading}
              activeOpacity={0.88}
            >
              <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.btnGradient}>
                <MaterialIcons name="two-wheeler" size={22} color="#FFF" />
                <Text style={styles.btnTextWhite}>Picked Up & Out for Delivery</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => initiateMarkDelivered(item)}
              disabled={actionLoading}
              activeOpacity={0.88}
            >
              <LinearGradient colors={['#16a34a', '#15803d']} style={styles.btnGradient}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={styles.btnTextWhite}>Mark as Delivered</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render Completed Order Card
  const renderCompletedCard = ({ item }) => {
    const items = item.items || item.order_items || [];
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.order_number || `#ORD-${item.id.slice(-5)}`}</Text>
            <View style={styles.deliveredBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#15803d" />
              <Text style={styles.deliveredText}>DELIVERED</Text>
            </View>
          </View>
          <Text style={styles.priceTag}>£{amount}</Text>
        </View>
        <Text style={styles.completedAddress} numberOfLines={1}>
          {item.delivery_address || 'Delivered to Customer'}
        </Text>
        <View style={styles.completedMeta}>
          <Text style={styles.completedCustomer}>{item.customer_name || 'Customer'}</Text>
          <Text style={styles.completedItems}>{items.length} items</Text>
        </View>
      </View>
    );
  };

  const getListForTab = () => {
    if (activeTab === 'available') return availableOrders;
    if (activeTab === 'active') return myActiveOrders;
    return myCompletedOrders;
  };

  const renderItemForTab = (params) => {
    if (activeTab === 'available') return renderAvailableCard(params);
    if (activeTab === 'active') return renderActiveCard(params);
    return renderCompletedCard(params);
  };

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#15803d"
        translucent={Platform.OS === 'android'}
      />

      {/* TOP HEADER */}
      <LinearGradient
        colors={['#15803d', '#16a34a', '#22c55e']}
        style={[
          styles.topBar,
          { paddingTop: topPadding + 10 }
        ]}
      >
        <View style={styles.topBarLeft}>
          <View style={styles.partnerAvatar}>
            <Text style={styles.partnerAvatarText}>
              {(partner?.name || 'R').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: 10 }}>
            <View style={styles.riderBranchRow}>
              <Text style={styles.riderBranchText} numberOfLines={1}>
                {partner?.restaurant_name || 'Crispy Dosa Branch'}
              </Text>
            </View>
            <Text style={styles.partnerName}>{partner?.name || 'Delivery Partner'}</Text>
          </View>
        </View>

        <View style={styles.topBarRight}>
          <View style={styles.onDutyBadge}>
            <View style={styles.onDutyDot} />
            <Text style={styles.onDutyText}>ON DUTY</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setLogoutVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* SEGMENTED TABS */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'available' && styles.tabActive]}
            onPress={() => setActiveTab('available')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
              Available ({availableOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.tabActive]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
              Active ({myActiveOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
            onPress={() => setActiveTab('completed')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
              Completed ({myCompletedOrders.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MAIN ORDERS LIST */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#15803d" />
          <Text style={styles.loadingText}>Loading delivery orders...</Text>
        </View>
      ) : (
        <FlatList
          data={getListForTab()}
          keyExtractor={(item) => item.id}
          renderItem={renderItemForTab}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 40 + (insets.bottom || 12) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
              tintColor="#15803d"
              colors={['#15803d']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name={
                    activeTab === 'available'
                      ? 'bicycle-outline'
                      : activeTab === 'active'
                      ? 'navigate-circle-outline'
                      : 'checkmark-done-circle-outline'
                  }
                  size={50 * scale}
                  color="#15803d"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'available'
                  ? 'No Orders Available'
                  : activeTab === 'active'
                  ? 'No Active Deliveries'
                  : 'No Completed Deliveries Yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'available'
                  ? 'New customer home delivery orders will appear here automatically.'
                  : activeTab === 'active'
                  ? 'Accept orders from the Available tab to start delivering.'
                  : 'Orders you successfully deliver will be archived here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* DELIVERY HANDOVER CONFIRMATION MODAL */}
      <Modal visible={!!confirmOrder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmHeader}>
              <View style={styles.confirmIconRing}>
                <Ionicons name="checkmark-done" size={36 * scale} color="#15803d" />
              </View>
              <Text style={styles.confirmTitle}>Confirm Handover</Text>
              <Text style={styles.confirmSubtitle}>
                Order {confirmOrder?.order_number || ''}
              </Text>
            </View>

            <View style={styles.confirmBody}>
              <Text style={styles.confirmMsg}>
                Have you successfully handed over the order to{' '}
                <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                  {confirmOrder?.customer_name || 'the customer'}
                </Text>
                ?
              </Text>

              {confirmOrder?.payment_mode === 0 ? (
                <View style={styles.confirmCodBox}>
                  <Ionicons name="cash" size={18} color="#B45309" />
                  <Text style={styles.confirmCodText}>
                    Did you collect £{Number(confirmOrder?.grand_total || confirmOrder?.total_amount || 0).toFixed(2)} in cash?
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setConfirmOrder(null)}
                disabled={actionLoading}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitDeliverBtn}
                onPress={handleConfirmDelivered}
                disabled={actionLoading}
              >
                <LinearGradient
                  colors={['#16a34a', '#15803d']}
                  style={styles.submitDeliverGrad}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitDeliverText}>Yes, Delivered</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CELEBRATION MODAL */}
      <Modal visible={celebrationVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.celebrationCard, { transform: [{ scale: scaleCelebration }] }]}>
            <LinearGradient
              colors={['#16a34a', '#15803d', '#14532d']}
              style={styles.celebrationGrad}
            >
              <View style={styles.celebrationRing}>
                <Ionicons name="sparkles" size={42 * scale} color="#FFF" />
              </View>
              <Text style={styles.celebrationTitle}>Great Job! 🎉</Text>
              <Text style={styles.celebrationMsgText}>{celebrationMsg}</Text>

              <TouchableOpacity
                style={styles.celebrationBtn}
                onPress={hideCelebration}
                activeOpacity={0.85}
              >
                <Text style={styles.celebrationBtnText}>Continue</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal visible={logoutVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmHeader}>
              <View style={[styles.confirmIconRing, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={36 * scale} color="#DC2626" />
              </View>
              <Text style={styles.confirmTitle}>Sign Out</Text>
              <Text style={styles.confirmSubtitle}>
                Are you sure you want to exit your delivery session?
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setLogoutVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Stay On Duty</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitDeliverBtn}
                onPress={confirmSignOut}
              >
                <LinearGradient
                  colors={['#DC2626', '#B91C1C']}
                  style={styles.submitDeliverGrad}
                >
                  <Text style={styles.submitDeliverText}>Log Out</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOM ALERT MODAL */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.confirmCard, { transform: [{ scale: alertScale }] }]}>
            <View style={styles.confirmHeader}>
              <View
                style={[
                  styles.confirmIconRing,
                  { backgroundColor: alertType === 'error' ? '#FEE2E2' : '#E0F2FE' },
                ]}
              >
                <Ionicons
                  name={alertType === 'error' ? 'alert-circle' : 'information-circle'}
                  size={36 * scale}
                  color={alertType === 'error' ? '#DC2626' : '#0284C7'}
                />
              </View>
              <Text style={styles.confirmTitle}>{alertTitle}</Text>
              <Text style={styles.confirmSubtitle}>{alertMsg}</Text>
            </View>

            <TouchableOpacity style={styles.alertDoneBtn} onPress={hideAlert}>
              <LinearGradient
                colors={alertType === 'error' ? ['#DC2626', '#B91C1C'] : ['#1a8b50', '#15803d']}
                style={styles.alertDoneGrad}
              >
                <Text style={styles.submitDeliverText}>Understood</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  /* TOP HEADER */
  topBar: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  partnerAvatar: {
    width: 44 * scale,
    height: 44 * scale,
    borderRadius: 22 * scale,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerAvatarText: {
    fontSize: 20 * scale,
    fontWeight: '900',
    color: '#15803d',
  },
  riderBranchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderBranchText: {
    fontSize: 11 * scale,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  partnerName: {
    fontSize: 16 * scale,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  onDutyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFD700',
  },
  onDutyText: {
    fontSize: 10 * scale,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  logoutBtn: {
    width: 36 * scale,
    height: 36 * scale,
    borderRadius: 18 * scale,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* SEGMENTED TABS */
  tabsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#F8FAFC',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: '#15803d',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 12 * scale,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* LIST & CARDS */
  listContainer: {
    padding: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  activeCardBorder: {
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNumber: {
    fontSize: 16 * scale,
    fontWeight: '900',
    color: '#0F172A',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803d',
  },
  readyText: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 11 * scale,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  priceTag: {
    fontSize: 18 * scale,
    fontWeight: '900',
    color: '#15803d',
  },

  /* DESTINATION */
  destinationBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  destHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  destLabel: {
    fontSize: 10 * scale,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.5,
  },
  postcodeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  postcodeBadgeText: {
    fontSize: 11 * scale,
    fontWeight: '900',
    color: '#1D4ED8',
  },
  destHouseText: {
    fontSize: 13 * scale,
    color: '#0F172A',
    fontWeight: '600',
    marginBottom: 2,
  },
  destAddress: {
    fontSize: 12 * scale,
    color: '#475569',
    lineHeight: 17 * scale,
  },
  riderInstructionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    gap: 6,
  },
  riderInstructionText: {
    fontSize: 11 * scale,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },

  /* META ROW */
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12 * scale,
    color: '#64748B',
    fontWeight: '600',
  },
  paymentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  paymentPillText: {
    fontSize: 10 * scale,
    fontWeight: '800',
  },

  /* BUTTONS */
  actionBtnPrimary: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13 * scale,
    gap: 8,
  },
  btnTextWhite: {
    color: '#FFF',
    fontSize: 14 * scale,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  /* ACTIVE CARD STYLES */
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeAccepted: {
    backgroundColor: '#EFF6FF',
  },
  statusBadgeOut: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 10 * scale,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusTextAccepted: {
    color: '#1D4ED8',
  },
  statusTextOut: {
    color: '#B45309',
  },
  customerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerAvatar: {
    width: 38 * scale,
    height: 38 * scale,
    borderRadius: 19 * scale,
    backgroundColor: '#15803d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 16 * scale,
    fontWeight: '800',
    color: '#FFF',
  },
  customerName: {
    fontSize: 14 * scale,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerPhone: {
    fontSize: 12 * scale,
    color: '#64748B',
    fontWeight: '500',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  callBtnText: {
    color: '#FFF',
    fontSize: 12 * scale,
    fontWeight: '800',
  },

  destinationBoxActive: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  destLabelActive: {
    fontSize: 10 * scale,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  activePostcodeBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePostcodeBadgeText: {
    fontSize: 11 * scale,
    fontWeight: '900',
    color: '#FFF',
  },
  activeHouseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  activeHouseText: {
    fontSize: 13 * scale,
    color: '#1E3A8A',
    fontWeight: '800',
  },
  destAddressActive: {
    fontSize: 12 * scale,
    color: '#1E293B',
    lineHeight: 18 * scale,
  },
  activeRiderInstructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  activeRiderInstructionTitle: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#92400E',
  },
  activeRiderInstructionDesc: {
    fontSize: 11 * scale,
    color: '#78350F',
    fontWeight: '600',
  },
  navigateBtn: {
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  navigateGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10 * scale,
    gap: 8,
  },
  navigateBtnText: {
    color: '#FFF',
    fontSize: 12 * scale,
    fontWeight: '800',
  },

  /* ITEMS BOX */
  itemsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemsHeading: {
    fontSize: 10 * scale,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemQty: {
    fontSize: 12 * scale,
    fontWeight: '800',
    color: '#15803d',
    width: 24,
  },
  itemName: {
    flex: 1,
    fontSize: 12 * scale,
    color: '#334155',
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 12 * scale,
    fontWeight: '700',
    color: '#0F172A',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
    gap: 6,
  },
  noteText: {
    fontSize: 10 * scale,
    color: '#92400E',
    fontWeight: '600',
  },

  paymentAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  paymentAlertText: {
    fontSize: 11 * scale,
    fontWeight: '800',
    flex: 1,
  },
  actionButtonsWrap: {
    marginTop: 4,
  },

  /* COMPLETED CARD */
  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  deliveredText: {
    fontSize: 10 * scale,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: 0.5,
  },
  completedAddress: {
    fontSize: 12 * scale,
    color: '#475569',
    marginTop: 8,
  },
  completedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  completedCustomer: {
    fontSize: 11 * scale,
    color: '#64748B',
    fontWeight: '600',
  },
  completedItems: {
    fontSize: 11 * scale,
    color: '#64748B',
  },

  /* EMPTY STATES */
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13 * scale,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 90 * scale,
    height: 90 * scale,
    borderRadius: 45 * scale,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17 * scale,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12 * scale,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18 * scale,
    maxWidth: 280,
  },

  /* MODALS */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 10,
  },
  confirmHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmIconRing: {
    width: 68 * scale,
    height: 68 * scale,
    borderRadius: 34 * scale,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 20 * scale,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 13 * scale,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  confirmBody: {
    marginBottom: 20,
  },
  confirmMsg: {
    fontSize: 14 * scale,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 20 * scale,
  },
  confirmCodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  confirmCodText: {
    flex: 1,
    fontSize: 12 * scale,
    fontWeight: '800',
    color: '#B45309',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12 * scale,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13 * scale,
    fontWeight: '700',
    color: '#475569',
  },
  submitDeliverBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitDeliverGrad: {
    paddingVertical: 12 * scale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDeliverText: {
    color: '#FFF',
    fontSize: 13 * scale,
    fontWeight: '800',
  },
  alertDoneBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },
  alertDoneGrad: {
    paddingVertical: 12 * scale,
    alignItems: 'center',
  },

  /* CELEBRATION MODAL */
  celebrationCard: {
    width: '85%',
    borderRadius: 26,
    overflow: 'hidden',
    elevation: 20,
  },
  celebrationGrad: {
    padding: 26,
    alignItems: 'center',
  },
  celebrationRing: {
    width: 76 * scale,
    height: 76 * scale,
    borderRadius: 38 * scale,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  celebrationTitle: {
    fontSize: 22 * scale,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 6,
  },
  celebrationMsgText: {
    fontSize: 14 * scale,
    color: '#FFF',
    opacity: 0.95,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20 * scale,
  },
  celebrationBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  celebrationBtnText: {
    fontSize: 13 * scale,
    fontWeight: '900',
    color: '#15803d',
  },
});
