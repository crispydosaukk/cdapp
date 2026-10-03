import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { width } = Dimensions.get('window');
const scale = width / 400;

export default function DeliveryHomeScreen({ navigation }) {
  const [partner, setPartner] = useState(null);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'active' | 'completed'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
            (o) => o.order_type === 'delivery' || o.delivery_address
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
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of your Delivery Partner account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth().signOut();
            await AsyncStorage.removeItem('delivery_partner');
            await AsyncStorage.removeItem('user_type');
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (e) {
            console.log('Logout error:', e);
          }
        },
      },
    ]);
  };

  // 1. Available (Unassigned) Orders - Scoped to Driver's Restaurant
  const availableOrders = orders.filter((o) => {
    const isUnassigned = !o.assigned_delivery_boy_id || o.delivery_status === 'unassigned';
    const isActive = o.order_status !== 4 && o.order_status !== 2 && o.order_status !== 5;
    const matchesRestaurant = !partner?.restaurant_id || String(o.user_id) === String(partner.restaurant_id);
    return isUnassigned && isActive && matchesRestaurant;
  });

  // 2. Active Deliveries for Current Partner
  const myActiveOrders = orders.filter((o) => {
    const isMine = partner && String(o.assigned_delivery_boy_id) === String(partner.id);
    const notDone = o.delivery_status !== 'delivered' && o.order_status !== 4;
    return isMine && notDone;
  });

  // 3. Completed Deliveries for Current Partner
  const myCompletedOrders = orders.filter((o) => {
    const isMine = partner && String(o.assigned_delivery_boy_id) === String(partner.id);
    const isDone = o.delivery_status === 'delivered' || o.order_status === 4;
    return isMine && isDone;
  });

  // Action: Accept Order
  const handleAcceptOrder = async (order) => {
    if (!partner) return;
    try {
      setActionLoading(true);
      const orderRef = firestore().collection('orders').doc(order.id);

      // Check if another driver already took it
      const currentSnap = await orderRef.get();
      const currentData = currentSnap.data();
      if (currentData.assigned_delivery_boy_id && currentData.assigned_delivery_boy_id !== partner.id) {
        Alert.alert('Order Taken', 'Another delivery partner has already accepted this order.');
        setActionLoading(false);
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
      Alert.alert('Order Accepted! 🛵', 'You have been assigned this order. Please head to the customer address.');
    } catch (e) {
      setActionLoading(false);
      console.log('Accept order error:', e);
      Alert.alert('Error', 'Failed to accept order. Please try again.');
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
    } catch (e) {
      setActionLoading(false);
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  // Action: Mark as Delivered
  const handleMarkDelivered = (order) => {
    Alert.alert(
      'Confirm Delivery',
      'Have you successfully handed over the order to the customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delivered',
          onPress: async () => {
            try {
              setActionLoading(true);
              await firestore().collection('orders').doc(order.id).update({
                delivery_status: 'delivered',
                order_status: 4,
                delivered_at: firestore.FieldValue.serverTimestamp(),
              });
              setActionLoading(false);
              Alert.alert('Great Job! 🎉', 'Order marked as Delivered.');
            } catch (e) {
              setActionLoading(false);
              Alert.alert('Error', 'Failed to complete delivery.');
            }
          },
        },
      ]
    );
  };

  // Action: Call Customer
  const handleCallCustomer = (phone) => {
    if (!phone) {
      Alert.alert('No Number', 'Customer phone number is not available.');
      return;
    }
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate phone call on this device.');
    });
  };

  // Action: Open Maps Directions
  const handleOpenMaps = (address, coords) => {
    let url = '';
    if (coords && coords.lat && coords.lng) {
      url = Platform.select({
        ios: `maps://app?daddr=${coords.lat},${coords.lng}`,
        android: `google.navigation:q=${coords.lat},${coords.lng}`,
      }) || `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
    } else if (address) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    } else {
      Alert.alert('No Address', 'Delivery address is missing for this order.');
      return;
    }

    Linking.openURL(url).catch(() => {
      // Fallback to web google maps
      if (coords && coords.lat && coords.lng) {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
      }
    });
  };

  // Render Available Order Card
  const renderAvailableCard = ({ item }) => {
    const items = item.items || [];
    const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <View style={styles.orderNumberRow}>
              <Text style={styles.orderNumber}>{item.order_number || 'Order'}</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>READY FOR PICKUP</Text>
              </View>
            </View>
            <Text style={styles.timeText}>
              {item.created_at ? item.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
            </Text>
          </View>
          <Text style={styles.priceTag}>£{amount}</Text>
        </View>

        {/* Address & Destination */}
        <View style={styles.destinationBox}>
          <Ionicons name="location" size={18} color="#10B981" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={styles.destLabel}>DELIVERY ADDRESS</Text>
              {(item.postcode || item.pincode) ? (
                <View style={styles.pincodeTag}>
                  <Text style={styles.pincodeTagText}>{item.postcode || item.pincode}</Text>
                </View>
              ) : null}
            </View>

            {item.house_flat_no ? (
              <Text style={styles.destHouseText}>
                🏠 {item.house_flat_no}
              </Text>
            ) : null}

            <Text style={styles.destAddress} numberOfLines={2}>
              {item.street_landmark
                ? `${item.street_landmark}${item.city ? `, ${item.city}` : ''}`
                : (item.delivery_address || 'Address provided at checkout')}
            </Text>

            {item.delivery_instructions ? (
              <View style={styles.riderInstructionTag}>
                <Ionicons name="bicycle" size={12} color="#F59E0B" />
                <Text style={styles.riderInstructionText} numberOfLines={1}>
                  Note: {item.delivery_instructions}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Customer info preview */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color="#94A3B8" />
            <Text style={styles.metaText}>{item.customer_name || 'Customer'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="bag-handle-outline" size={14} color="#94A3B8" />
            <Text style={styles.metaText}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="card-outline" size={14} color="#94A3B8" />
            <Text style={styles.metaText}>{item.payment_mode === 0 ? 'Cash' : 'Paid'}</Text>
          </View>
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => handleAcceptOrder(item)}
          disabled={actionLoading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.btnGradient}
          >
            <MaterialIcons name="delivery-dining" size={22} color="#FFF" />
            <Text style={styles.acceptBtnText}>ACCEPT ORDER</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  // Render My Active Order Card
  const renderActiveCard = ({ item }) => {
    const items = item.items || [];
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);
    const customerPhone = item.mobile_number || item.customer_phone;
    const isOut = item.delivery_status === 'out_for_delivery';

    return (
      <View style={[styles.card, styles.activeCardBorder]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.order_number || 'Order'}</Text>
            <View style={[styles.statusBadge, isOut ? styles.statusBadgeOut : styles.statusBadgeAccepted]}>
              <Text style={styles.statusBadgeText}>
                {isOut ? '🛵 OUT FOR DELIVERY' : '⚡ ACCEPTED - HEAD TO ADDRESS'}
              </Text>
            </View>
          </View>
          <Text style={styles.priceTag}>£{amount}</Text>
        </View>

        {/* Customer Call Card */}
        <View style={styles.customerBox}>
          <View style={styles.customerInfo}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>
                {(item.customer_name || 'C').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.customerName}>{item.customer_name || 'Customer'}</Text>
              <Text style={styles.customerPhone}>{customerPhone || 'No phone'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => handleCallCustomer(customerPhone)}
          >
            <Ionicons name="call" size={16} color="#FFF" />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        </View>

        {/* Destination & Navigation */}
        <View style={styles.destinationBoxActive}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Ionicons name="location" size={20} color="#3B82F6" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.destLabelActive}>DELIVERY DESTINATION</Text>
                {(item.postcode || item.pincode) ? (
                  <View style={[styles.pincodeTag, { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: 'rgba(59,130,246,0.3)' }]}>
                    <Text style={[styles.pincodeTagText, { color: '#93C5FD' }]}>{item.postcode || item.pincode}</Text>
                  </View>
                ) : null}
              </View>

              {item.house_flat_no ? (
                <View style={styles.activeHouseBadge}>
                  <Ionicons name="home" size={14} color="#60A5FA" />
                  <Text style={styles.activeHouseText}>
                    {item.house_flat_no}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.destAddressActive}>
                {item.street_landmark
                  ? `${item.street_landmark}${item.city ? `, ${item.city}` : ''}${item.postcode ? ` - ${item.postcode}` : ''}`
                  : (item.delivery_address || 'Address provided at checkout')}
              </Text>

              {item.delivery_instructions ? (
                <View style={styles.activeRiderInstructionBox}>
                  <Ionicons name="bicycle" size={15} color="#FBBF24" />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.activeRiderInstructionTitle}>CUSTOMER RIDER NOTE</Text>
                    <Text style={styles.activeRiderInstructionDesc}>{item.delivery_instructions}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={() => handleOpenMaps(item.delivery_address, item.delivery_coords)}
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

        {/* Order Items List */}
        <View style={styles.itemsBox}>
          <Text style={styles.itemsHeading}>ORDER ITEMS ({items.length})</Text>
          {items.map((it, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.itemQty}>{it.quantity}x</Text>
              <Text style={styles.itemName} numberOfLines={1}>{it.product_name}</Text>
              <Text style={styles.itemPrice}>£{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</Text>
            </View>
          ))}
          {item.allergy_note ? (
            <View style={styles.noteBox}>
              <Ionicons name="warning-outline" size={14} color="#F59E0B" />
              <Text style={styles.noteText}>Customer note: {item.allergy_note}</Text>
            </View>
          ) : null}
        </View>

        {/* Payment mode notice */}
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Payment Status:</Text>
          <Text style={[styles.paymentVal, item.payment_mode === 0 ? styles.codColor : styles.paidColor]}>
            {item.payment_mode === 0 ? '💵 COLLECT CASH ON DELIVERY' : '✅ PREPAID ONLINE'}
          </Text>
        </View>

        {/* Status progression buttons */}
        <View style={styles.actionButtonsWrap}>
          {!isOut ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleStartDelivery(item)}
              disabled={actionLoading}
            >
              <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.actionGrad}>
                <MaterialIcons name="two-wheeler" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>Picked Up & Out for Delivery</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleMarkDelivered(item)}
              disabled={actionLoading}
            >
              <LinearGradient colors={['#10B981', '#059669']} style={styles.actionGrad}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>Mark as Delivered</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render Completed Order Card
  const renderCompletedCard = ({ item }) => {
    const items = item.items || [];
    const amount = Number(item.grand_total || item.total_amount || 0).toFixed(2);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.order_number || 'Order'}</Text>
            <View style={styles.deliveredBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
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
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.partnerInfo}>
          <View style={styles.partnerAvatar}>
            <Text style={styles.partnerAvatarText}>
              {(partner?.name || 'D').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.partnerGreeting}>
              {partner?.restaurant_name ? `🛵 ${partner.restaurant_name}` : 'Crispy Dosa Rider'}
            </Text>
            <Text style={styles.partnerName}>{partner?.name || 'Delivery Partner'}</Text>
          </View>
        </View>

        <View style={styles.topRightActions}>
          <View style={styles.onDutyBadge}>
            <View style={styles.onDutyDot} />
            <Text style={styles.onDutyText}>ON DUTY</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Available ({availableOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            My Deliveries ({myActiveOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            Completed ({myCompletedOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Syncing live orders...</Text>
        </View>
      ) : (
        <FlatList
          data={getListForTab()}
          keyExtractor={(item) => item.id}
          renderItem={renderItemForTab}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
              tintColor="#10B981"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons
                name={
                  activeTab === 'available'
                    ? 'delivery-dining'
                    : activeTab === 'active'
                    ? 'motorcycle'
                    : 'check-circle-outline'
                }
                size={60}
                color="#475569"
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'available'
                  ? 'No Orders Available'
                  : activeTab === 'active'
                  ? 'No Active Deliveries'
                  : 'No Completed Deliveries Yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'available'
                  ? 'New delivery orders placed by customers will show up here live.'
                  : activeTab === 'active'
                  ? 'Accept orders from the Available tab to start delivering.'
                  : 'Delivered orders will be archived here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 55 : 20,
    paddingBottom: 16,
    paddingHorizontal: 18,
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: {
    fontSize: 18 * scale,
    fontWeight: '800',
    color: '#FFF',
  },
  partnerGreeting: {
    fontSize: 11 * scale,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  partnerName: {
    fontSize: 15 * scale,
    fontWeight: '700',
    color: '#FFF',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  onDutyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  onDutyText: {
    fontSize: 10 * scale,
    fontWeight: '800',
    color: '#10B981',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tabActive: {
    backgroundColor: '#10B981',
  },
  tabText: {
    fontSize: 12 * scale,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#FFF',
  },
  listContainer: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  activeCardBorder: {
    borderColor: 'rgba(59,130,246,0.4)',
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
    fontWeight: '800',
    color: '#FFF',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#10B981',
  },
  timeText: {
    fontSize: 11 * scale,
    color: '#94A3B8',
    marginTop: 2,
  },
  priceTag: {
    fontSize: 18 * scale,
    fontWeight: '900',
    color: '#10B981',
  },
  destinationBox: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  destinationBoxActive: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  destLabel: {
    fontSize: 10 * scale,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  destLabelActive: {
    fontSize: 10 * scale,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  destAddress: {
    fontSize: 13 * scale,
    fontWeight: '600',
    color: '#E2E8F0',
    marginTop: 2,
    lineHeight: 18 * scale,
  },
  destHouseText: {
    fontSize: 14 * scale,
    fontWeight: '800',
    color: '#34D399',
    marginTop: 2,
  },
  pincodeTag: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pincodeTagText: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#10B981',
  },
  riderInstructionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    gap: 4,
  },
  riderInstructionText: {
    fontSize: 11 * scale,
    color: '#FCD34D',
    fontWeight: '600',
  },
  activeHouseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginVertical: 4,
    gap: 6,
  },
  activeHouseText: {
    fontSize: 14 * scale,
    fontWeight: '800',
    color: '#93C5FD',
  },
  activeRiderInstructionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  activeRiderInstructionTitle: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  activeRiderInstructionDesc: {
    fontSize: 12 * scale,
    fontWeight: '600',
    color: '#FDE68A',
    marginTop: 1,
  },
  destAddressActive: {
    fontSize: 13 * scale,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 2,
    lineHeight: 18 * scale,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12 * scale,
    color: '#94A3B8',
  },
  acceptBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  acceptBtnText: {
    color: '#FFF',
    fontSize: 14 * scale,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  statusBadgeAccepted: {
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
  statusBadgeOut: {
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  statusBadgeText: {
    fontSize: 10 * scale,
    fontWeight: '800',
    color: '#60A5FA',
  },
  customerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 16 * scale,
    fontWeight: '700',
    color: '#FFF',
  },
  customerName: {
    fontSize: 14 * scale,
    fontWeight: '700',
    color: '#FFF',
  },
  customerPhone: {
    fontSize: 12 * scale,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  callBtnText: {
    color: '#FFF',
    fontSize: 13 * scale,
    fontWeight: '700',
  },
  navigateBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
  },
  navigateGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  navigateBtnText: {
    color: '#FFF',
    fontSize: 12 * scale,
    fontWeight: '700',
  },
  itemsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  itemsHeading: {
    fontSize: 10 * scale,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemQty: {
    fontSize: 12 * scale,
    fontWeight: '800',
    color: '#10B981',
    width: 25,
  },
  itemName: {
    flex: 1,
    fontSize: 12 * scale,
    color: '#E2E8F0',
  },
  itemPrice: {
    fontSize: 12 * scale,
    color: '#94A3B8',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.1)',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 11 * scale,
    color: '#F59E0B',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  paymentLabel: {
    fontSize: 12 * scale,
    color: '#94A3B8',
  },
  paymentVal: {
    fontSize: 11 * scale,
    fontWeight: '800',
  },
  codColor: {
    color: '#F59E0B',
  },
  paidColor: {
    color: '#10B981',
  },
  actionButtonsWrap: {
    gap: 8,
  },
  actionBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14 * scale,
    fontWeight: '800',
  },
  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  deliveredText: {
    fontSize: 9 * scale,
    fontWeight: '800',
    color: '#10B981',
  },
  completedAddress: {
    fontSize: 12 * scale,
    color: '#94A3B8',
    marginBottom: 6,
  },
  completedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  completedCustomer: {
    fontSize: 12 * scale,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  completedItems: {
    fontSize: 12 * scale,
    color: '#64748B',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13 * scale,
    color: '#94A3B8',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16 * scale,
    fontWeight: '700',
    color: '#CBD5E1',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12 * scale,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18 * scale,
  },
});
