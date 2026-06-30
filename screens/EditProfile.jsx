import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { fetchProfile, updateProfileData } from "../services/profileService";
import { fetchRestaurants } from "../services/restaurantService";

export default function EditProfile({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    gender: "",
    date_of_birth: "",
    preferred_restaurant: "",
  });

  const [restaurants, setRestaurants] = useState([]);
  const [showDobPicker, setShowDobPicker] = useState(false);

  useEffect(() => {
    loadProfile();
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      const data = await fetchRestaurants();
      setRestaurants(data || []);
    } catch (err) {
      console.warn("Failed to load restaurants", err);
    }
  };

  const loadProfile = async () => {
    try {
      const data = await fetchProfile();
      setForm({
        full_name: data.full_name || "",
        email: data.email || "",
        mobile_number: data.mobile_number || "",
        gender: data.gender || "",
        date_of_birth: data.date_of_birth || "",
        preferred_restaurant: data.preferred_restaurant || "",
      });
    } catch (err) {
      Alert.alert("Error", "Unable to load profile");
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!form.full_name.trim()) {
      Alert.alert("Validation", "Full name is required");
      return;
    }

    try {
      setSaving(true);

      await updateProfileData({
        full_name: form.full_name,
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        preferred_restaurant: form.preferred_restaurant,
      });

      Alert.alert("Success", "Profile updated successfully");
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      {/* HEADER */}
      <LinearGradient
        colors={["#16a34a", "#43c76f"]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Profile</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* FULL NAME */}
        <Input
          label="Full Name"
          value={form.full_name}
          onChangeText={(v) => setForm({ ...form, full_name: v })}
          icon="person-outline"
        />

        {/* EMAIL (LOCKED) */}
        <Input
          label="Email"
          value={form.email}
          icon="mail-outline"
          disabled
        />

        {/* MOBILE (LOCKED) */}
        <Input
          label="Mobile Number"
          value={form.mobile_number}
          icon="call-outline"
          disabled
        />

        {/* GENDER */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.inputRow}>
            <Ionicons name="male-female-outline" size={18} color="#777" />
            <Picker
              selectedValue={form.gender}
              onValueChange={(v) => setForm({ ...form, gender: v })}
              style={styles.picker}
            >
              <Picker.Item label="Select Gender" value="" />
              <Picker.Item label="Male" value="male" />
              <Picker.Item label="Female" value="female" />
              <Picker.Item label="Other" value="other" />
            </Picker>
          </View>
        </View>

        {/* DOB */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity
            style={styles.inputRow}
            onPress={() => setShowDobPicker(true)}
          >
            <Ionicons name="calendar-outline" size={18} color="#777" />
            <Text style={[styles.input, !form.date_of_birth && { color: "#aaa" }]}>
              {form.date_of_birth ? new Date(form.date_of_birth).toLocaleDateString("en-GB") : "Select Date"}
            </Text>
          </TouchableOpacity>
        </View>

        {showDobPicker && (
          <DateTimePicker
            mode="date"
            display="default"
            value={form.date_of_birth ? new Date(form.date_of_birth) : new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
            maximumDate={new Date()}
            onChange={(e, selectedDate) => {
              setShowDobPicker(false);
              if (selectedDate) {
                setForm({
                  ...form,
                  date_of_birth: selectedDate.toISOString().split("T")[0],
                });
              }
            }}
          />
        )}

        {/* PREFERRED RESTAURANT */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Preferred Restaurant</Text>
          <View style={styles.inputRow}>
            <Ionicons name="restaurant-outline" size={18} color="#777" />
            <Picker
              selectedValue={form.preferred_restaurant}
              onValueChange={(v) => setForm({ ...form, preferred_restaurant: v })}
              style={styles.picker}
            >
              <Picker.Item label="Select Restaurant" value="" />
              {restaurants.map((r) => (
                <Picker.Item key={r.id || r.name} label={r.name} value={r.name} />
              ))}
            </Picker>
          </View>
        </View>

        {/* SAVE BUTTON */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={updateProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ---------- INPUT COMPONENT ---------- */

const Input = ({
  label,
  icon,
  value,
  onChangeText,
  disabled,
  placeholder,
}) => (
  <View style={styles.inputCard}>
    <Text style={styles.label}>{label}</Text>
    <View
      style={[
        styles.inputRow,
        disabled && { backgroundColor: "#f0f0f0" },
      ]}
    >
      <Ionicons name={icon} size={18} color="#777" />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
      />
      {disabled && (
        <Ionicons name="lock-closed-outline" size={16} color="#999" />
      )}
    </View>
  </View>
);

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
  },

  inputCard: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: "#777",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    elevation: 3,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#000",
    paddingVertical: 10, // Ensure text is centered in TouchableOpacity
  },
  picker: {
    flex: 1,
    marginLeft: 4,
    color: "#000",
  },

  saveBtn: {
    backgroundColor: "#16a34a",
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    elevation: 4,
  },
  saveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
