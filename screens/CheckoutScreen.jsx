import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import Geolocation from "react-native-geolocation-service";
import useRefresh from "../hooks/useRefresh";

import AppHeader from "./AppHeader";
import BottomBar from "./BottomBar";
import MenuModal from "./MenuModal";
import { getCart } from "../services/cartService";
import { createOrder } from "../services/orderService";
import { getWalletSummary } from "../services/walletService";
import { useStripe } from "@stripe/stripe-react-native";
import { fetchStripeKey, fetchRestaurantDetails } from "../services/restaurantService";


const { width, height } = Dimensions.get("window");
const scale = width / 400;

const AnimatedView = Animated.createAnimatedComponent(View);
import functions from '@react-native-firebase/functions';

export default function CheckoutScreen({ route, navigation }) {
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantLoading, setRestaurantLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);

  const [deliveryPopup, setDeliveryPopup] = useState(true);
  const [allergyPopup, setAllergyPopup] = useState(false);

  const [deliveryMethod, setDeliveryMethod] = useState(null);
  const [kerbsideName, setKerbsideName] = useState("");
  const [kerbsideColor, setKerbsideColor] = useState("");
  const [kerbsideReg, setKerbsideReg] = useState("");
  const [allergyNote, setAllergyNote] = useState("");

  const effectiveRestaurantId = route?.params?.restaurantId || cart[0]?.restaurant_id || cart[0]?.user_id;

  useEffect(() => {
    let isMounted = true;
    const loadRestaurantInfo = async () => {
      if (!effectiveRestaurantId) return;
      try {
        setRestaurantLoading(true);
        const data = await fetchRestaurantDetails(effectiveRestaurantId);
        if (isMounted && data) {
          setRestaurant(data);
        }
      } catch (err) {
        console.error("Failed to load restaurant details in Checkout", err);
      } finally {
        if (isMounted) setRestaurantLoading(false);
      }
    };
    loadRestaurantInfo();
    return () => { isMounted = false; };
  }, [effectiveRestaurantId]);

  const isDeliveryEnabled = Boolean(
    restaurant && (Number(restaurant.delivery) === 1 || restaurant.delivery === true || restaurant.delivery === "1")
  );

  useEffect(() => {
    if (restaurant && !isDeliveryEnabled && deliveryMethod === "delivery") {
      setDeliveryMethod(null);
    }
  }, [restaurant, isDeliveryEnabled, deliveryMethod]);

  // Home delivery structured address state (Swiggy / Zomato style)
  const [houseFlatNo, setHouseFlatNo] = useState("");
  const [streetLandmark, setStreetLandmark] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const getFullDeliveryAddress = () => {
    const parts = [
      houseFlatNo.trim(),
      streetLandmark.trim(),
      city.trim(),
      postcode.trim().toUpperCase(),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : deliveryAddress;
  };

  const [orderPlaced, setOrderPlaced] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [walletUsed, setWalletUsed] = useState(0);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [loyaltyCredits, setLoyaltyCredits] = useState([]);
  const [loyaltyUsed, setLoyaltyUsed] = useState(0);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [earnedAmount, setEarnedAmount] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(10);
  const [earnRate, setEarnRate] = useState(1);

  // Premium Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("info"); // info, error, success
  const alertScale = useRef(new Animated.Value(0)).current;

  // Success Toast State
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(-100)).current;

  // Full Screen Success Animation
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [isKeyLoading, setIsKeyLoading] = useState(true);

  const isFocused = useIsFocused();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const walletScale = useRef(new Animated.Value(0)).current;
  const loyaltyScale = useRef(new Animated.Value(0)).current;
  const bottomSheetAnim = useRef(new Animated.Value(height)).current;

  // Helper to open sheet
  const openSheet = () => {
    Animated.spring(bottomSheetAnim, {
      toValue: 0,
      tension: 60,
      friction: 8,
      useNativeDriver: true
    }).start();
  };

  // Helper to close sheet
  const closeSheet = (callback) => {
    Animated.timing(bottomSheetAnim, {
      toValue: height,
      duration: 250,
      useNativeDriver: true
    }).start(callback);
  };

  useEffect(() => {
    if (deliveryPopup || allergyPopup) {
      openSheet();
    }
  }, [deliveryPopup, allergyPopup]);

  const cartItemsMap = useMemo(() => {
    const map = {};
    cart.forEach((item) => {
      const qty = item.product_quantity || 0;
      if (qty > 0) map[item.product_id] = qty;
    });
    return map;
  }, [cart]);

  const visibleCart = useMemo(() => {
    return (cart || []).filter((i) => (i.product_quantity || 0) > 0);
  }, [cart]);

  useEffect(() => {
    if (isFocused) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isFocused]);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    })();
  }, []);

  useEffect(() => {
    if (!user || !isFocused) return;
    (async () => {
      const cid = user.id ?? user.customer_id;
      const res = await getCart(cid);
      if (res?.status === 1) setCart(res.data || []);
    })();
  }, [user, isFocused]);

  // Distance calculation helper (Haversine formula in miles)
  const calculateDistanceMiles = (lat1, lon1, lat2, lon2) => {
    const p1 = Number(lat1);
    const l1 = Number(lon1);
    const p2 = Number(lat2);
    const l2 = Number(lon2);
    if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2) || p1 === 0 || p2 === 0) return null;

    const R = 3958.8; // Radius of the earth in miles
    const dLat = (p2 - p1) * (Math.PI / 180);
    const dLon = (l2 - l1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1 * (Math.PI / 180)) * Math.cos(p2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  // Auto-geocode UK postcode if coordinates are not set or when postcode changes
  const geocodePostcode = async (pc) => {
    if (!pc || typeof pc !== "string") return null;
    const cleanPc = pc.replace(/\s+/g, "").toUpperCase();
    if (cleanPc.length < 4) return null;

    try {
      // 1. Instant lookup via postcodes.io (Official UK Open Postcode API - fast, free, no key)
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPc)}`);
      const data = await res.json();
      if (data?.status === 200 && data?.result) {
        const { latitude, longitude } = data.result;
        const coords = { lat: latitude, lng: longitude, latitude, longitude };
        setDeliveryCoords(coords);
        return coords;
      }
    } catch (e) {
      console.log("postcodes.io lookup error:", e);
    }

    try {
      // 2. Fallback lookup via OpenStreetMap Nominatim
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pc)}&country=GB&format=json&limit=1`,
        { headers: { "Accept-Language": "en", "User-Agent": "CrispyDosaApp" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          const coords = { lat, lng: lon, latitude: lat, longitude: lon };
          setDeliveryCoords(coords);
          return coords;
        }
      }
    } catch (e) {
      console.log("Nominatim geocode fallback error:", e);
    }
    return null;
  };

  // Auto-trigger geocoding when user types or edits postcode
  useEffect(() => {
    if (deliveryMethod === "delivery" && postcode && postcode.trim().length >= 5) {
      const timer = setTimeout(() => {
        geocodePostcode(postcode.trim());
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [deliveryMethod, postcode]);

  const deliveryPricing = useMemo(() => {
    if (deliveryMethod !== 'delivery' || !restaurant) {
      return {
        fee: 0,
        distance: null,
        isOutOfRadius: false,
        isBelowMinOrder: false,
        isFreeDelivery: false,
        maxRadius: 0,
        minOrder: 0,
        freeAbove: 0,
        baseFee: 0,
      };
    }

    // Comprehensive fallback across all possible database field aliases
    const baseFee = Number(
      restaurant.base_delivery_fee ??
      restaurant.delivery_charges ??
      restaurant.delivery_fee ??
      restaurant.base_fee ??
      0
    );
    const baseDist = Number(
      restaurant.base_delivery_distance ??
      restaurant.base_distance ??
      restaurant.delivery_distance ??
      0
    );
    const extraFeePerMile = Number(
      restaurant.extra_fee_per_mile ??
      restaurant.per_mile_charge ??
      restaurant.extra_charge_per_mile ??
      restaurant.extra_fee ??
      0
    );
    const maxRadius = Number(
      restaurant.max_delivery_radius ??
      restaurant.delivery_radius ??
      restaurant.max_radius ??
      0
    );
    const minOrder = Number(
      restaurant.min_order_delivery ??
      restaurant.min_order ??
      restaurant.minimum_order ??
      0
    );
    const freeAbove = Number(
      restaurant.free_delivery_above ??
      restaurant.free_delivery_amount ??
      restaurant.free_delivery ??
      0
    );

    const cartSubtotal = (visibleCart || []).reduce((sum, item) => {
      const p = Number(item.discount_price ?? item.product_price ?? 0);
      return sum + p * (item.product_quantity || 0);
    }, 0);

    let distance = null;
    const custLat = Number(deliveryCoords?.lat ?? deliveryCoords?.latitude);
    const custLng = Number(deliveryCoords?.lng ?? deliveryCoords?.longitude);
    const restLat = Number(restaurant.latitude || restaurant.lat);
    const restLng = Number(restaurant.longitude || restaurant.lng || restaurant.long);

    if (!isNaN(custLat) && !isNaN(custLng) && !isNaN(restLat) && !isNaN(restLng) && custLat !== 0 && restLat !== 0) {
      distance = calculateDistanceMiles(custLat, custLng, restLat, restLng);
    }

    const isBelowMinOrder = minOrder > 0 && cartSubtotal < minOrder;
    const isOutOfRadius = maxRadius > 0 && distance !== null && distance > maxRadius;

    // Free delivery check
    if (freeAbove > 0 && cartSubtotal >= freeAbove) {
      return {
        fee: 0,
        distance,
        isOutOfRadius,
        isBelowMinOrder,
        isFreeDelivery: true,
        maxRadius,
        minOrder,
        freeAbove,
        baseFee,
      };
    }

    let calculatedFee = baseFee;
    if (distance !== null && baseDist > 0 && distance > baseDist && extraFeePerMile > 0) {
      const extraMiles = distance - baseDist;
      calculatedFee = baseFee + (extraMiles * extraFeePerMile);
    } else if (distance !== null && baseDist === 0 && extraFeePerMile > 0) {
      calculatedFee = baseFee + (distance * extraFeePerMile);
    }

    return {
      fee: Math.round(calculatedFee * 100) / 100,
      distance,
      isOutOfRadius,
      isBelowMinOrder,
      isFreeDelivery: false,
      maxRadius,
      minOrder,
      freeAbove,
      baseFee,
    };
  }, [deliveryMethod, restaurant, deliveryCoords, visibleCart]);

  const getCartTotal = () => {
    return (visibleCart || []).reduce((sum, item) => {
      const p = Number(item.discount_price ?? item.product_price ?? 0);
      return sum + p * (item.product_quantity || 0);
    }, 0);
  };

  const getFinalTotal = () => {
    const total = getCartTotal();
    const deliveryFee = deliveryMethod === "delivery" ? (deliveryPricing?.fee || 0) : 0;
    const deductions = (useWallet ? walletUsed : 0) + (useLoyalty ? loyaltyUsed : 0);
    return Math.max(0, parseFloat((total + deliveryFee - deductions).toFixed(2)));
  };

  const showPremiumAlert = (title, msg, type = "info") => {
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

  const hidePremiumAlert = () => {
    Animated.timing(alertScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setAlertVisible(false));
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: 60, useNativeDriver: true, tension: 40, friction: 7 }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: -100, duration: 500, useNativeDriver: true })
    ]).start(() => setToastVisible(false));
  };

  const animateWallet = (show) => {
    Animated.spring(walletScale, {
      toValue: show ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
    if (show) showToast("Congrats! Wallet credits applied.");
  };

  const animateLoyalty = (show) => {
    Animated.spring(loyaltyScale, {
      toValue: show ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
    if (show) showToast("Awesome! Loyalty rewards added.");
  };

  const handleWalletToggle = () => {
    if (useWallet) {
      setUseWallet(false);
      setWalletUsed(0);
      animateWallet(false);
    } else {
      const amount = Math.min(walletBalance, getCartTotal());
      setUseWallet(true);
      setWalletUsed(amount);
      animateWallet(true);
    }
  };

  const handleLoyaltyToggle = () => {
    if (useLoyalty) {
      setUseLoyalty(false);
      setLoyaltyUsed(0);
      animateLoyalty(false);
    } else {
      const totalLoyalty = loyaltyCredits.reduce((sum, c) => sum + Number(c.credit_value), 0);
      const amount = Math.min(totalLoyalty, getCartTotal());
      setUseLoyalty(true);
      setLoyaltyUsed(amount);
      animateLoyalty(true);
    }
  };

  const triggerSuccessAnimation = () => {
    setOrderPlaced(true);
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }),
      Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const preparePayment = async () => {
    if (!user) return;
    try {
      const amount = getFinalTotal();
      if (amount <= 0) return;

      const restaurantId = cart[0]?.restaurant_id || cart[0]?.user_id;
      if (!restaurantId) return;

      const res = await functions().httpsCallable('createPaymentIntent')({
        amount,
        currency: "gbp",
        restaurant_id: restaurantId
      });

      const data = res.data;
      if (data.clientSecret) {
        setPaymentIntent(data);
        await initPaymentSheet({
          paymentIntentClientSecret: data.clientSecret,
          merchantDisplayName: "Crispy Dosa",
        });
      }
    } catch (e) {
      console.log("Pre-payment init failed", e);
    }
  };

  useEffect(() => {
    if (isFocused && user && cart.length > 0) {
      const initStripeKey = async () => {
        setIsKeyLoading(true);
        const restaurantId = cart[0]?.restaurant_id || cart[0]?.user_id;

        if (!restaurantId) {
          showPremiumAlert("Context Error", "We couldn't identify the restaurant for this order. Please try re-adding items.", "error");
          setIsKeyLoading(false);
          return;
        }

        const key = await fetchStripeKey(restaurantId);
        if (key && key.trim() !== "") {
          global.updateStripeKey(key);
          setStripeConfigured(true);
          // Wait briefly for Provider to catch up
          setTimeout(() => {
            preparePayment();
            setIsKeyLoading(false);
          }, 800);
        } else {
          setStripeConfigured(false);
          setIsKeyLoading(false);
          showPremiumAlert(
            "Payments Unavailable",
            "This restaurant does not currently support online payments. Please choose another location or contact the store directly.",
            "error"
          );
        }
      };
      initStripeKey();
    }
  }, [isFocused, user, cart.length, useWallet, useLoyalty, deliveryMethod, deliveryCoords]);

  const placeOrder = async () => {
    if (processingPayment) return;
    if (!user) {
      showPremiumAlert("Sign In Required", "Please sign in to place an order.", "info");
      setTimeout(() => {
        hidePremiumAlert();
        navigation.navigate("Login");
      }, 2000);
      return;
    }

    try {
      setProcessingPayment(true);
      let activeIntent = paymentIntent;

      // If intent not ready or amount changed, fetch fresh one
      if (!activeIntent || activeIntent.amount !== getFinalTotal()) {
        const amount = getFinalTotal();
        const restaurantId = cart[0]?.restaurant_id || cart[0]?.user_id;

        const res = await functions().httpsCallable('createPaymentIntent')({
          amount,
          currency: "gbp",
          restaurant_id: restaurantId
        });
        activeIntent = res.data;
        if (!activeIntent.clientSecret) {
          showPremiumAlert("Payment Error", activeIntent.message || "Payment initialization failed. Please try again.", "error");
          setProcessingPayment(false);
          return;
        }

        await initPaymentSheet({
          paymentIntentClientSecret: activeIntent.clientSecret,
          merchantDisplayName: "Crispy Dosa",
        });
      }

      if (deliveryMethod === 'delivery') {
        if (!houseFlatNo.trim()) {
          showPremiumAlert("House / Flat Required", "Please enter your House, Flat, or Building number.", "error");
          setProcessingPayment(false);
          return;
        }
        if (!postcode.trim()) {
          showPremiumAlert("Postcode / PIN Required", "Please enter your Postcode / Pincode.", "error");
          setProcessingPayment(false);
          return;
        }
        const fullAddr = getFullDeliveryAddress();
        if (!fullAddr) {
          showPremiumAlert("Address Required", "Please complete your delivery address details.", "error");
          setProcessingPayment(false);
          return;
        }
        if (deliveryPricing?.isOutOfRadius) {
          showPremiumAlert(
            "Out of Delivery Range",
            `Your address is ${deliveryPricing.distance} miles away. This restaurant only delivers up to ${deliveryPricing.maxRadius} miles.`,
            "error"
          );
          setProcessingPayment(false);
          return;
        }
        if (deliveryPricing?.isBelowMinOrder) {
          showPremiumAlert(
            "Minimum Order Required",
            `Minimum order amount for delivery from this restaurant is £${deliveryPricing.minOrder.toFixed(2)}. Your current food total is £${getCartTotal().toFixed(2)}.`,
            "error"
          );
          setProcessingPayment(false);
          return;
        }
      }

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        setProcessingPayment(false);
        return;
      }

      const restaurantId = cart[0]?.restaurant_id || cart[0]?.user_id;
      const fullDeliveryAddr = getFullDeliveryAddress();

      const payload = {
        user_id: String(restaurantId), // this must be the restaurant ID!
        restaurant_id: String(restaurantId),
        restaurant_name: restaurant?.name || restaurant?.restaurant_name || "",
        customer_id: String(user.customer_id ?? user.id),
        customer_name: user.full_name || "",
        customer_email: user.email || "",
        customer_phone: user.mobile_number || "",
        payment_mode: 1,
        payment_request_id: activeIntent.payment_intent_id,
        instore: deliveryMethod === "instore" ? 1 : 0,
        order_type: deliveryMethod === "delivery" ? "delivery" : deliveryMethod === "instore" ? "takeaway" : "kerbside",
        ...(deliveryMethod === "delivery" && {
          delivery_address: fullDeliveryAddr,
          house_flat_no: houseFlatNo.trim(),
          street_landmark: streetLandmark.trim(),
          city: city.trim(),
          postcode: postcode.trim().toUpperCase(),
          pincode: postcode.trim().toUpperCase(),
          delivery_instructions: deliveryInstructions.trim(),
          delivery_coords: deliveryCoords,
          delivery_status: "unassigned",
          delivery_fee: deliveryPricing?.fee || 0,
          delivery_distance: deliveryPricing?.distance || null,
        }),
        allergy_note: allergyNote,
        car_color: kerbsideColor,
        reg_number: kerbsideReg,
        owner_name: kerbsideName,
        mobile_number: user.mobile_number || "",
        wallet_used: useWallet ? walletUsed : 0,
        loyalty_used: useLoyalty ? loyaltyUsed : 0,
        total_amount: getCartTotal(),
        grand_total: getFinalTotal(),
        items: (visibleCart || []).map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          price: i.product_price,
          discount_amount: i.discount_price ? i.product_price - i.discount_price : 0,
          vat: 0,
          quantity: Number(i.product_quantity) || 0,
          textfield: i.textfield || i.special_instruction || "",
        })),
      };

      const orderRes = await createOrder(payload);
      if (orderRes.status === 1) {
        // 1. Initial calculation based on current cart
        const paidTotal = getFinalTotal();
        const pts = Math.floor(paidTotal * earnRate);
        let calculatedEarned = ((pts / redeemPoints) * 1).toFixed(2);
        setEarnedAmount(calculatedEarned);

        // 2. Refresh wallet data to get the EXACT amount from backend
        try {
          const walletData = await getWalletSummary();
          // Backend returns newest first at index 0
          if (walletData?.loyalty_pending_list?.length > 0) {
            const currentOrderCredits = walletData.loyalty_pending_list[0];
            if (currentOrderCredits?.credit_value) {
              setEarnedAmount(Number(currentOrderCredits.credit_value).toFixed(2));
            }
          }
        } catch (e) {
          console.log("Post-order wallet sync failed:", e);
        }

        // Show success animation
        triggerSuccessAnimation();
        setCart([]);
        await AsyncStorage.removeItem("cart");
        setTimeout(() => {
          Animated.timing(successOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
            setOrderPlaced(false);
            navigation.reset({
              index: 0,
              routes: [{ name: "Orders", params: orderRes.data?.order_id ? { newOrderId: orderRes.data.order_id } : {} }],
            });
          });
        }, 3000);
      } else {
        showPremiumAlert("Order Failed", orderRes.message || "Something went wrong while placing your order.", "error");
      }
      setProcessingPayment(false);
    } catch (err) {
      setProcessingPayment(false);
      showPremiumAlert("System Error", "An unexpected error occurred. Please check your connection.", "error");
    }
  };

  const fetchCurrentLocation = () => {
    setLocationLoading(true);
    Geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setDeliveryCoords({ lat: latitude, lng: longitude });
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
          const d = await r.json();
          if (d) {
            const addr = d.address || {};
            const streetParts = [addr.road, addr.suburb || addr.neighbourhood].filter(Boolean).join(", ");
            if (streetParts) setStreetLandmark(streetParts);
            const cityPart = addr.city || addr.town || addr.village || addr.county || "";
            if (cityPart) setCity(cityPart);
            if (addr.postcode) setPostcode(addr.postcode.toUpperCase());
            if (addr.house_number && !houseFlatNo) setHouseFlatNo(addr.house_number);

            const display = d.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            setDeliveryAddress(display);
          }
        } catch {
          setDeliveryAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        setLocationLoading(false);
      },
      () => { setLocationLoading(false); showPremiumAlert('Location Error', 'Cannot get location. Type your address manually.', 'error'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const { refreshing, onRefresh } = useRefresh(async () => {
    if (!user) return;
    const cid = user.id ?? user.customer_id;
    const res = await getCart(cid);
    if (res?.status === 1) setCart(res.data || []);
  });

  useEffect(() => {
    if (!isFocused) return;
    (async () => {
      const data = await getWalletSummary();
      setWalletBalance(Number(data.wallet_balance || 0));
      setRedeemPoints(Number(data.loyalty_redeem_points || 10));
      setEarnRate(Number(data.loyalty_points_per_gbp || 1));

      const usableCredits = (data.loyalty_expiry_list || []).filter(c => new Date(c.expires_at) > new Date());
      setLoyaltyCredits(usableCredits);
      setUseLoyalty(false);
      setLoyaltyUsed(0);
    })();
  }, [isFocused]);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <AppHeader user={user} navigation={navigation} cartItems={cartItemsMap} onMenuPress={() => setMenuVisible(true)} />

      {/* Congrats Animated Toast */}
      {toastVisible && (
        <AnimatedView style={[styles.premiumToast, { transform: [{ translateY: toastAnim }] }]}>
          <LinearGradient colors={["#10B981", "#059669"]} style={styles.toastInner}>
            <Ionicons name="sparkles" size={20} color="#FFF" />
            <Text style={styles.toastText}>{toastMsg}</Text>
          </LinearGradient>
        </AnimatedView>
      )}

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.mainContent}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.mainTitle}>Review Order</Text>
                <Text style={styles.subTitle}>{visibleCart.length} {visibleCart.length === 1 ? 'item' : 'items'} in your bucket</Text>
              </View>
            </View>

            {/* SERVICE INFO & ETA - COMPOSITE CARD */}
            <View style={styles.serviceCompositeCard}>
              <View style={styles.serviceRow}>
                <View style={styles.serviceIconFrame}>
                  <Ionicons name={deliveryMethod === 'delivery' ? "bicycle" : deliveryMethod === 'kerbside' ? "car-sport" : "walk"} size={26} color="#FF2B5C" />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.serviceLabel}>{deliveryMethod === 'delivery' ? "Home Delivery" : deliveryMethod === 'instore' ? "Takeaway" : "Kerbside"}</Text>
                  <Text style={styles.serviceSub}>Estimated Prep: 20 - 25 Mins</Text>
                </View>
                <TouchableOpacity style={styles.changeBtn} onPress={() => { setDeliveryPopup(true); openSheet(); }}>
                  <Text style={styles.changeBtnText}>Change</Text>
                </TouchableOpacity>
              </View>

              {(deliveryMethod === 'kerbside' && (kerbsideName || kerbsideReg || kerbsideColor)) && (
                <View style={[styles.kerbsideInfoDetail, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
                  {kerbsideName ? <Text style={styles.kerbsideText}><Text style={{ fontWeight: '700', color: '#0F172A' }}>Car Name:</Text> {kerbsideName}</Text> : null}
                  {kerbsideColor ? <Text style={styles.kerbsideText}><Text style={{ fontWeight: '700', color: '#0F172A' }}>Color:</Text> {kerbsideColor}</Text> : null}
                  {kerbsideReg ? <Text style={styles.kerbsideText}><Text style={{ fontWeight: '700', color: '#0F172A' }}>Reg No:</Text> {kerbsideReg}</Text> : null}
                </View>
              )}

              {(deliveryMethod === 'delivery' && (houseFlatNo || deliveryAddress)) && (
                <View style={[styles.deliveryAddressBar, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Ionicons name="location" size={16} color="#2563EB" />
                    <Text style={{ fontSize: 13 * scale, fontWeight: '700', color: '#1E3A8A', marginLeft: 6 }}>
                      Home Delivery Address
                    </Text>
                    {postcode.trim() ? (
                      <View style={{ marginLeft: 'auto', backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10 * scale, fontWeight: '800', color: '#1D4ED8' }}>{postcode.trim().toUpperCase()}</Text>
                      </View>
                    ) : null}
                  </View>
                  {houseFlatNo.trim() ? (
                    <Text style={{ fontSize: 13 * scale, fontWeight: '700', color: '#0F172A', marginLeft: 22 }}>
                      {houseFlatNo.trim()}
                    </Text>
                  ) : null}
                  {streetLandmark.trim() || city.trim() ? (
                    <Text style={{ fontSize: 12 * scale, color: '#475569', marginLeft: 22, marginTop: 1 }}>
                      {[streetLandmark.trim(), city.trim()].filter(Boolean).join(", ")}
                    </Text>
                  ) : deliveryAddress ? (
                    <Text style={{ fontSize: 12 * scale, color: '#475569', marginLeft: 22, marginTop: 1 }} numberOfLines={2}>
                      {deliveryAddress}
                    </Text>
                  ) : null}
                  {deliveryInstructions.trim() ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 22, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Ionicons name="bicycle" size={13} color="#D97706" />
                      <Text style={{ fontSize: 11 * scale, color: '#92400E', marginLeft: 5, fontWeight: '600' }}>
                        Rider Note: {deliveryInstructions.trim()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {allergyNote ? (
                <TouchableOpacity activeOpacity={0.8} style={styles.allergyBar} onPress={() => { setAllergyPopup(true); openSheet(); }}>
                  <Ionicons name="warning" size={18} color="#EA580C" />
                  <Text style={styles.allergyText} numberOfLines={1}>Note: {allergyNote}</Text>
                  <Ionicons name="pencil" size={14} color="#EA580C" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.8} style={styles.addAllergyLink} onPress={() => { setAllergyPopup(true); openSheet(); }}>
                  <Ionicons name="medical-outline" size={16} color="#64748B" />
                  <Text style={styles.addAllergyText}>Add allergy instructions</Text>
                  <Ionicons name="chevron-forward" size={14} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* BASKET ITEMS */}
            <View style={styles.basketContainer}>
              <View style={styles.basketHeader}>
                <Ionicons name="basket" size={20} color="#0F172A" />
                <Text style={styles.basketTitle}>Basket Items</Text>
              </View>

              <View style={styles.basketCard}>
                {visibleCart.map((item, index) => (
                  <View key={item.product_id ?? index}>
                    <View style={styles.cartItemRow}>
                      <View style={styles.cartItemInfo}>
                        <View style={styles.itemNameWrapper}>
                          <View style={[styles.vegStatus, { borderColor: '#16A34A' }]}>
                            <View style={[styles.vegInner, { backgroundColor: '#16A34A' }]} />
                          </View>
                          <Text style={styles.itemNameText} numberOfLines={2}>{item.product_name}</Text>
                        </View>
                        {item.textfield ? (
                          <Text style={styles.itemNoteText}>“{item.textfield}”</Text>
                        ) : null}
                      </View>
                      <View style={styles.cartItemPriceCol}>
                        <Text style={styles.itemTotalPriceText}>£{(Number(item.discount_price ?? item.product_price) * item.product_quantity).toFixed(2)}</Text>
                        <Text style={styles.itemQtyText}>Qty: {item.product_quantity}</Text>
                      </View>
                    </View>
                    {index < visibleCart.length - 1 && <View style={styles.itemDivider} />}
                  </View>
                ))}
              </View>
            </View>

            {/* SAVINGS & REWARDS */}
            <View style={styles.savingsSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="gift-outline" size={20} color="#0F172A" />
                <Text style={styles.sectionTitle}>Savings & Rewards</Text>
              </View>

              <View style={styles.premiumCreditCard}>
                {/* WALLET */}
                <View style={styles.creditItem}>
                  <View style={[styles.creditIconBox, { backgroundColor: 'rgba(22, 163, 74, 0.08)' }]}>
                    <Ionicons name="wallet" size={22} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.creditLabelText}>Wallet Balance</Text>
                    <Text style={[styles.creditValueText, useWallet && { color: '#16A34A' }]}>£{walletBalance.toFixed(2)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.premiumApplyBtn, useWallet && styles.premiumAppliedBtn, walletBalance <= 0 && { opacity: 0.4 }]}
                    disabled={walletBalance <= 0}
                    onPress={handleWalletToggle}
                  >
                    <Text style={[styles.premiumApplyBtnText, useWallet && { color: "#FFF" }]}>{useWallet ? "Remove" : "Apply"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.itemSeparatorLine} />

                {/* LOYALTY */}
                <View style={styles.creditItem}>
                  <View style={[styles.creditIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.08)' }]}>
                    <Ionicons name="star" size={22} color="#0EA5E9" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.creditLabelText}>Loyalty Credits</Text>
                    <Text style={[styles.creditValueText, useLoyalty && { color: '#16A34A' }]}>
                      £{loyaltyCredits.reduce((sum, c) => sum + Number(c.credit_value || 0), 0).toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.premiumApplyBtn, useLoyalty && styles.premiumAppliedBtn, loyaltyCredits.length <= 0 && { opacity: 0.4 }]}
                    disabled={loyaltyCredits.length <= 0}
                    onPress={handleLoyaltyToggle}
                  >
                    <Text style={[styles.premiumApplyBtnText, useLoyalty && { color: "#FFF" }]}>{useLoyalty ? "Remove" : "Apply"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* BILLING BREAKDOWN */}
            <View style={styles.billingSection}>
              <Text style={styles.sectionTitleSmall}>Invoice Summary</Text>
              <View style={styles.invoiceCard}>
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceLabel}>Subtotal</Text>
                  <Text style={styles.invoiceValue}>£{getCartTotal().toFixed(2)}</Text>
                </View>

                {deliveryMethod === "delivery" && (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>
                      Delivery Fee {deliveryPricing?.distance !== null && deliveryPricing?.distance !== undefined ? `(${deliveryPricing.distance} mi)` : ""}
                    </Text>
                    <Text style={[styles.invoiceValue, deliveryPricing?.isFreeDelivery && { color: "#16A34A", fontWeight: "bold" }]}>
                      {deliveryPricing?.isFreeDelivery ? "FREE" : `£${(deliveryPricing?.fee || 0).toFixed(2)}`}
                    </Text>
                  </View>
                )}

                {deliveryMethod === "delivery" && deliveryPricing?.isOutOfRadius && (
                  <View style={{ backgroundColor: "#FEE2E2", borderRadius: 8, padding: 8, marginVertical: 6 }}>
                    <Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "600" }}>
                      ⚠️ Address is {deliveryPricing.distance} mi away (max delivery radius: {deliveryPricing.maxRadius} mi)
                    </Text>
                  </View>
                )}

                {useWallet && walletUsed > 0 && (
                  <AnimatedView style={[styles.invoiceRow, { transform: [{ scale: walletScale }], opacity: walletScale }]}>
                    <Text style={styles.invoiceLabelDeduct}>Wallet Savings</Text>
                    <Text style={styles.invoiceValueDeduct}>-£{walletUsed.toFixed(2)}</Text>
                  </AnimatedView>
                )}

                {useLoyalty && loyaltyUsed > 0 && (
                  <AnimatedView style={[styles.invoiceRow, { transform: [{ scale: loyaltyScale }], opacity: loyaltyScale }]}>
                    <Text style={styles.invoiceLabelDeduct}>Loyalty Discount</Text>
                    <Text style={styles.invoiceValueDeduct}>-£{loyaltyUsed.toFixed(2)}</Text>
                  </AnimatedView>
                )}

                <View style={styles.invoiceDivider} />
                <View style={styles.invoiceRow}>
                  <Text style={styles.grandTotalLabel}>Payable amount</Text>
                  <Text style={styles.grandTotalValue}>£{getFinalTotal().toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* SAFETY BADGE */}
            <View style={styles.premiumSafetyBar}>
              <Ionicons name="shield-checkmark" size={22} color="#16A34A" />
              <Text style={styles.premiumSafetyText}>Crispy Dosa’s Kitchen Safety & Hygiene Assured</Text>
            </View>
          </View>
        </ScrollView>

        {/* ULTIMATE BUSINESS CHECKOUT BAR (Sticky bottom like Cart Summary) */}
        {!deliveryPopup && !allergyPopup && visibleCart.length > 0 && (
          <View style={styles.stickyFooter}>
            <View style={[styles.premiumStickyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 5 : 15 }]}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.actionBtnPremium, (!stripeConfigured || isKeyLoading) && { opacity: 0.5 }]}
                onPress={placeOrder}
                disabled={processingPayment || !stripeConfigured || isKeyLoading}
              >
                <LinearGradient
                  colors={!stripeConfigured || isKeyLoading ? ["#94a3b8", "#64748b"] : ["#16a34a", "#15803d"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnGradient}
                >
                  {processingPayment || isKeyLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.btnTextPremium}>
                        {!stripeConfigured ? "Payment Unavailable" : "Place Order"}
                      </Text>
                      <Ionicons name={!stripeConfigured ? "lock-closed" : "arrow-forward"} size={20} color="#FFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Delivery sheet */}
      < Modal visible={deliveryPopup} transparent animationType="fade" >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeSheet(() => setDeliveryPopup(false))} />
          <Animated.View style={[styles.sheetContent, { transform: [{ translateY: bottomSheetAnim }], paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={() => closeSheet(() => navigation.goBack())} style={styles.modalBackBtn}>
                <Ionicons name="arrow-back" size={22} color="#1C1C1C" />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Pickup details</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setDeliveryMethod("kerbside")}
            >
              <LinearGradient
                colors={deliveryMethod === 'kerbside' ? ["#F0FDF4", "#DCFCE7"] : ["#F8FAFC", "#F8FAFC"]}
                style={[styles.optionCard, deliveryMethod === 'kerbside' && styles.optionSelected]}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name="car" size={26} color={deliveryMethod === 'kerbside' ? "#16a34a" : "#999"} />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionTitle}>Kerbside Delivery</Text>
                  <Text style={styles.optionSub}>We bring it to your car</Text>
                </View>
                <Ionicons name={deliveryMethod === 'kerbside' ? "radio-button-on" : "radio-button-off"} size={22} color={deliveryMethod === 'kerbside' ? "#16a34a" : "#DDD"} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setDeliveryMethod("instore")}
            >
              <LinearGradient
                colors={deliveryMethod === 'instore' ? ["#F0FDF4", "#DCFCE7"] : ["#F8FAFC", "#F8FAFC"]}
                style={[styles.optionCard, deliveryMethod === 'instore' && styles.optionSelected]}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name="walk" size={26} color={deliveryMethod === 'instore' ? "#16a34a" : "#999"} />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionTitle}>Takeaway</Text>
                  <Text style={styles.optionSub}>Collect from our counter</Text>
                </View>
                <Ionicons name={deliveryMethod === 'instore' ? "radio-button-on" : "radio-button-off"} size={22} color={deliveryMethod === 'instore' ? "#16a34a" : "#DDD"} />
              </LinearGradient>
            </TouchableOpacity>

            {/* Home Delivery */}
            {isDeliveryEnabled && (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setDeliveryMethod("delivery")}>
                <LinearGradient
                  colors={deliveryMethod === 'delivery' ? ["#EFF6FF", "#DBEAFE"] : ["#F8FAFC", "#F8FAFC"]}
                  style={[styles.optionCard, deliveryMethod === 'delivery' && styles.optionSelectedBlue]}
                >
                  <View style={[styles.optionIconContainer, deliveryMethod === 'delivery' && { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="bicycle" size={26} color={deliveryMethod === 'delivery' ? "#2563EB" : "#999"} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={styles.optionTitle}>Home Delivery</Text>
                    <Text style={styles.optionSub}>Delivered to your address</Text>
                  </View>
                  <Ionicons name={deliveryMethod === 'delivery' ? "radio-button-on" : "radio-button-off"} size={22} color={deliveryMethod === 'delivery' ? "#2563EB" : "#DDD"} />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {deliveryMethod === 'kerbside' && (
              <View style={styles.kerbsideFields}>
                <TextInput style={styles.kInput} placeholder="Car Name / Make" value={kerbsideName} onChangeText={setKerbsideName} placeholderTextColor="#BCBCBC" />
                <TextInput style={styles.kInput} placeholder="Car Color" value={kerbsideColor} onChangeText={setKerbsideColor} placeholderTextColor="#BCBCBC" />
                <TextInput style={styles.kInput} placeholder="Reg Number" value={kerbsideReg} onChangeText={setKerbsideReg} placeholderTextColor="#BCBCBC" />
              </View>
            )}

            {/* Home Delivery address inputs (Swiggy / Zomato style) */}
            {deliveryMethod === 'delivery' && (
              <View style={styles.kerbsideFields}>
                <TouchableOpacity style={styles.locationBtn} onPress={fetchCurrentLocation} disabled={locationLoading} activeOpacity={0.8}>
                  <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.locationBtnGrad}>
                    {locationLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name="navigate" size={18} color="#FFF" />
                    )}
                    <Text style={styles.locationBtnText}>
                      {locationLoading ? '  Fetching location...' : '  Use My Current Location'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* House / Flat / Floor / Building */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    HOUSE / FLAT / FLOOR / BUILDING NO. <Text style={{ color: '#EF4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.kInput}
                    placeholder="e.g. Flat 4B, 2nd Floor, Oak Heights"
                    value={houseFlatNo}
                    onChangeText={setHouseFlatNo}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {/* Street / Area / Landmark */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>APARTMENT / ROAD / LANDMARK</Text>
                  <TextInput
                    style={styles.kInput}
                    placeholder="e.g. High Street, Opposite Central Park"
                    value={streetLandmark}
                    onChangeText={setStreetLandmark}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {/* City & Postcode in 2 columns */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>CITY / TOWN</Text>
                    <TextInput
                      style={styles.kInput}
                      placeholder="e.g. Hounslow"
                      value={city}
                      onChangeText={setCity}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>
                      POSTCODE / PIN <Text style={{ color: '#EF4444' }}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.kInput}
                      placeholder="e.g. TW3 3AA"
                      value={postcode}
                      onChangeText={(val) => setPostcode(val.toUpperCase())}
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                {/* Rider delivery instructions (Swiggy/Zomato style) */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DELIVERY INSTRUCTIONS FOR RIDER (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.kInput, { height: 65, textAlignVertical: 'top', paddingTop: 10 }]}
                    placeholder="e.g. Ring bell twice, leave at reception / doorstep"
                    value={deliveryInstructions}
                    onChangeText={setDeliveryInstructions}
                    placeholderTextColor="#94A3B8"
                    multiline
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.sheetActionBtn, (!deliveryMethod || (deliveryMethod === 'delivery' && (!houseFlatNo.trim() || !postcode.trim()))) && { opacity: 0.5 }]}
              disabled={!deliveryMethod || (deliveryMethod === 'delivery' && (!houseFlatNo.trim() || !postcode.trim()))}
              onPress={() => {
                if (deliveryMethod === 'delivery' && postcode && (!deliveryCoords || !deliveryCoords.lat)) {
                  geocodePostcode(postcode.trim());
                }
                closeSheet(() => {
                  setDeliveryPopup(false);
                  setTimeout(() => setAllergyPopup(true), 100);
                });
              }}
            >
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.sheetActionGrad}>
                <Text style={styles.sheetActionText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal >

      {/* Allergy sheet */}
      < Modal visible={allergyPopup} transparent animationType="fade" >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeSheet(() => setAllergyPopup(false))} />
          <Animated.View style={[styles.sheetContent, { transform: [{ translateY: bottomSheetAnim }], paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={() => closeSheet(() => { setAllergyPopup(false); setTimeout(() => setDeliveryPopup(true), 100); })} style={styles.modalBackBtn}>
                <Ionicons name="arrow-back" size={22} color="#1C1C1C" />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Food Allergies?</Text>
            </View>
            <Text style={styles.sheetDesc}>Tell us if we need to be careful with any specific ingredients.</Text>
            <TextInput
              style={styles.allergyInput}
              placeholder="e.g. No Peanuts, No Dairy..."
              multiline
              value={allergyNote}
              onChangeText={setAllergyNote}
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.sheetActionBtn} onPress={() => closeSheet(() => setAllergyPopup(false))}>
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.sheetActionGrad}>
                <Text style={styles.sheetActionText}>Review Order Summary</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal >

      {/* Full Screen High-End Order Success Modal */}
      < Modal visible={orderPlaced} transparent animationType="none" >
        <View style={styles.successFullOverlay}>
          <LinearGradient colors={["#16A34A", "#15803D"]} style={styles.successGrad}>
            <Animated.View style={[styles.successContent, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
              <View style={styles.successIconRing}>
                <Ionicons name="checkmark-sharp" size={84} color="#10B981" />
              </View>
              <Text style={styles.fullSuccessTitle}>Order Placed!</Text>
              <Text style={styles.fullSuccessSub}>Your delicious meal is on its way.</Text>

              <View style={styles.rewardCard}>
                <Ionicons name="gift" size={30} color="#EAB308" />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.rewardTitle}>Congrats! £{earnedAmount} Earned</Text>
                  <Text style={styles.rewardSub}>Check details in your Credits screen</Text>
                </View>
              </View>

              <View style={styles.confettiContainer}>
                {[...Array(6)].map((_, i) => (
                  <View key={i} style={[styles.confetti, { top: Math.random() * 200, left: Math.random() * 300 }]} />
                ))}
              </View>
            </Animated.View>
          </LinearGradient>
        </View>
      </Modal >

      <MenuModal visible={menuVisible} setVisible={setMenuVisible} user={user} navigation={navigation} />

      {/* PREMIUM ALERT MODAL */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <Animated.View style={[styles.alertCard, { transform: [{ scale: alertScale }] }]}>
            <LinearGradient
              colors={alertType === 'error' ? ["#FFF5F5", "#FFFFFF"] : ["#F0FDF4", "#FFFFFF"]}
              style={styles.alertContent}
            >
              <View style={[styles.alertIconRing, { backgroundColor: alertType === 'error' ? '#FEE2E2' : '#DCFCE7' }]}>
                <Ionicons
                  name={alertType === 'error' ? "close-circle" : "information-circle"}
                  size={40}
                  color={alertType === 'error' ? "#EF4444" : "#16A34A"}
                />
              </View>
              <Text style={styles.alertTitleText}>{alertTitle}</Text>
              <Text style={styles.alertMsgText}>{alertMsg}</Text>
              <TouchableOpacity style={styles.alertBtn} onPress={hidePremiumAlert}>
                <LinearGradient
                  colors={alertType === 'error' ? ["#EF4444", "#DC2626"] : ["#16A34A", "#15803D"]}
                  style={styles.alertBtnGrad}
                >
                  <Text style={styles.alertBtnText}>Got it</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  mainContent: { paddingBottom: 0 },

  /* HEADER */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  mainTitle: { fontSize: 28 * scale, fontFamily: "PoppinsBold", color: "#0F172A", fontWeight: '900', letterSpacing: -0.8 },
  subTitle: { fontSize: 13 * scale, fontFamily: "PoppinsMedium", color: "#64748B", marginTop: 2 },
  miniAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  miniAddText: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#FF2B5C', marginLeft: 4 },

  /* COMPOSITE CARD */
  serviceCompositeCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 20,
    elevation: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  serviceRow: { flexDirection: 'row', alignItems: 'center' },
  serviceIconFrame: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,43,92,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: { fontSize: 17 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '900' },
  serviceSub: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#64748B', marginTop: 2 },
  changeBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  changeBtnText: { fontSize: 12 * scale, fontFamily: 'PoppinsBold', color: '#FF2B5C' },

  kerbsideInfoDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kerbsideText: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#475569', marginLeft: 8 },

  allergyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    marginTop: 15,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  allergyText: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#EA580C', marginLeft: 10, flex: 1 },
  addAllergyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  addAllergyText: { flex: 1, marginLeft: 10, fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#64748B' },

  /* BASKET */
  basketContainer: { paddingHorizontal: 16, marginBottom: 20 },
  basketHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingLeft: 4 },
  basketTitle: { fontSize: 18 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', marginLeft: 10, fontWeight: '900' },

  basketCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cartItemRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    width: '100%',
  },
  cartItemInfo: { flex: 1, paddingRight: 10 },
  itemNameWrapper: { flexDirection: 'row', alignItems: 'flex-start' },
  vegStatus: { width: 14, height: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginRight: 8 },
  vegInner: { width: 6, height: 6, borderRadius: 3 },
  itemNameText: { fontSize: 16 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '800', lineHeight: 22 },
  itemNoteText: { fontSize: 12 * scale, fontFamily: 'PoppinsMedium', color: '#64748B', fontStyle: 'italic', marginTop: 8 },
  cartItemPriceCol: { alignItems: 'flex-end', justifyContent: 'center' },
  itemTotalPriceText: { fontSize: 17 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '900' },
  itemQtyText: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#94A3B8', marginTop: 4 },

  /* PREMIUM ADD MORE CARD */
  addMorePremiumCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginTop: 5,
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

  /* SAVINGS */
  savingsSection: { paddingHorizontal: 16, marginBottom: 25 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingLeft: 4 },
  sectionTitle: { fontSize: 18 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', marginLeft: 10, fontWeight: '900' },
  premiumCreditCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 15,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  creditItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  creditIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  creditLabelText: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', fontWeight: '900', color: '#1E293B', letterSpacing: 0.5, textTransform: 'uppercase' },
  creditValueText: { fontSize: 19 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '900', marginTop: 1 },
  premiumApplyBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30, borderWidth: 1.5, borderColor: '#16A34A', backgroundColor: '#FFF' },
  premiumAppliedBtn: { backgroundColor: '#16A34A' },
  premiumApplyBtnText: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#16A34A' },
  itemSeparatorLine: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },

  /* BILLING */
  billingSection: { paddingHorizontal: 16, marginBottom: 30 },
  sectionTitleSmall: { fontSize: 14 * scale, fontFamily: 'PoppinsBold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 15, paddingLeft: 4, letterSpacing: 0.5 },
  invoiceCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, elevation: 2, shadowColor: "#000", shadowOpacity: 0.02, shadowRadius: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  invoiceLabel: { fontSize: 15 * scale, fontFamily: 'PoppinsMedium', color: '#64748B' },
  invoiceValue: { fontSize: 16 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '800' },
  invoiceLabelDeduct: { fontSize: 15 * scale, fontFamily: 'PoppinsBold', color: '#16A34A' },
  invoiceValueDeduct: { fontSize: 16 * scale, fontFamily: 'PoppinsBold', color: '#16A34A', fontWeight: '900' },
  invoiceDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  grandTotalLabel: { fontSize: 18 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '900' },
  grandTotalValue: { fontSize: 24 * scale, fontFamily: 'PoppinsBold', color: '#16A34A', fontWeight: '900' },

  premiumSafetyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  premiumSafetyText: { flex: 1, marginLeft: 12, fontSize: 12 * scale, fontFamily: 'PoppinsMedium', color: '#166534', opacity: 0.8 },

  /* STICKY FOOTER */
  stickyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 },
  premiumStickyBar: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Centered
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 25,
    elevation: 30,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F1F5F9',
  },
  // stickyLeft: { flex: 0.45, justifyContent: 'center' }, deleted
  // stickyItemCount: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '800' }, deleted
  // stickyPriceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 }, deleted
  // stickyTotalLabel: { fontSize: 13 * scale, fontFamily: 'PoppinsBold', color: '#1E293B', marginRight: 6, opacity: 0.9, fontWeight: '700' }, deleted
  // stickyTotalValue: { fontSize: 20 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '900' }, deleted
  actionBtnPremium: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  btnTextPremium: { color: '#FFF', fontFamily: 'PoppinsBold', fontSize: 16 * scale, fontWeight: '900' },

  /* MODALS & SHEETS */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 30, elevation: 20 },
  sheetHandle: { width: 45, height: 5, backgroundColor: '#E2E8F0', borderRadius: 5, alignSelf: 'center', marginBottom: 25 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  modalBackBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  sheetTitle: { fontSize: 22 * scale, fontFamily: "PoppinsBold", color: "#0F172A", marginLeft: 15, fontWeight: '900' },
  optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 20, padding: 18, marginBottom: 15, borderWidth: 1.5, borderColor: '#F1F5F9' },
  optionSelected: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  optionIconContainer: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  optionTitle: { fontSize: 16 * scale, fontFamily: 'PoppinsBold', color: '#0F172A', fontWeight: '800' },
  optionSub: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#64748B', marginTop: 2 },
  kerbsideFields: { marginTop: 10, marginBottom: 20 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10 * scale, fontFamily: 'PoppinsBold', color: '#64748B', fontWeight: '800', letterSpacing: 0.5, marginBottom: 5 },
  kInput: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, marginBottom: 4, borderWidth: 1, borderColor: '#E2E8F0', fontFamily: 'PoppinsMedium', color: '#0F172A', fontSize: 14 * scale },
  optionSelectedBlue: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  locationBtn: { marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  locationBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  locationBtnText: { color: '#FFF', fontFamily: 'PoppinsBold', fontSize: 14 * scale, fontWeight: '800' },
  deliveryAddressBar: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EFF6FF', marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  deliveryAddressText: { flex: 1, fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: '#1D4ED8', lineHeight: 20, marginLeft: 8 },
  sheetActionBtn: { marginTop: 10 },
  sheetActionGrad: { borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  sheetActionText: { color: '#FFF', fontSize: 16 * scale, fontFamily: 'PoppinsBold', fontWeight: '800' },

  sheetDesc: { fontSize: 14 * scale, fontFamily: 'PoppinsMedium', color: '#64748B', marginBottom: 20, lineHeight: 22 },
  allergyInput: { backgroundColor: '#F8FAFC', borderRadius: 18, padding: 18, height: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E2E8F0', fontFamily: 'PoppinsMedium', color: '#0F172A', marginBottom: 25 },

  /* TOAST */
  premiumToast: { position: 'absolute', top: 50, left: 24, right: 24, zIndex: 1000 },
  toastInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 20, elevation: 10 },
  toastText: { color: '#FFF', fontSize: 14 * scale, fontFamily: 'PoppinsBold', marginLeft: 10 },

  /* SUCCESS MODAL */
  successFullOverlay: { flex: 1 },
  successGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successContent: { alignItems: 'center', width: '90%' },
  successIconRing: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 20 },
  fullSuccessTitle: { fontSize: 32 * scale, fontFamily: 'PoppinsBold', color: '#FFF', fontWeight: '900', marginTop: 30 },
  fullSuccessSub: { fontSize: 16 * scale, fontFamily: 'PoppinsMedium', color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 10 },
  rewardCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', padding: 20, borderRadius: 24, marginTop: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  rewardTitle: { fontSize: 18 * scale, fontFamily: 'PoppinsBold', color: '#FFF' },
  rewardSub: { fontSize: 13 * scale, fontFamily: 'PoppinsMedium', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  confettiContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  confetti: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD700', opacity: 0.8 },

  /* ALERT STYLES */
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertCard: {
    width: "85%",
    borderRadius: 30,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  alertContent: {
    padding: 30,
    alignItems: "center",
  },
  alertIconRing: {
    width: 80 * scale,
    height: 80 * scale,
    borderRadius: 40 * scale,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  alertTitleText: {
    fontSize: 22 * scale,
    fontFamily: "PoppinsBold",
    color: "#0F172A",
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  alertMsgText: {
    fontSize: 14 * scale,
    fontFamily: "PoppinsMedium",
    color: "#475569",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 22 * scale,
  },
  alertBtn: {
    width: "100%",
    borderRadius: 15,
    overflow: "hidden",
  },
  alertBtnGrad: {
    paddingVertical: 14,
    alignItems: "center",
  },
  alertBtnText: {
    fontSize: 15 * scale,
    fontFamily: "PoppinsBold",
    color: "#FFF",
    fontWeight: "800",
  },
});
