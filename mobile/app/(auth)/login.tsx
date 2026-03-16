import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#F8F7F4" }}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        {/* Branding */}
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Text style={{ fontSize: 32, fontWeight: "700", color: "#0D9488" }}>
            FloorEye
          </Text>
          <Text style={{ fontSize: 14, color: "#78716C", marginTop: 4 }}>
            See Every Drop. Stop Every Slip.
          </Text>
        </View>

        {/* Email */}
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#1C1917", marginBottom: 6 }}>
          Email address
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: "#E7E5E0",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 14,
            backgroundColor: "#FFFFFF",
            marginBottom: 16,
            color: "#1C1917",
          }}
        />

        {/* Password */}
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#1C1917", marginBottom: 6 }}>
          Password
        </Text>
        <View style={{ position: "relative", marginBottom: 16 }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword}
            style={{
              borderWidth: 1,
              borderColor: "#E7E5E0",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              paddingRight: 60,
              fontSize: 14,
              backgroundColor: "#FFFFFF",
              color: "#1C1917",
            }}
          />
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={{
              position: "absolute",
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 13, color: "#0D9488" }}>
              {showPassword ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>

        {/* Error */}
        {error ? (
          <View
            style={{
              backgroundColor: "#FEE2E2",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, color: "#DC2626" }}>{error}</Text>
          </View>
        ) : null}

        {/* Sign In */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            backgroundColor: loading ? "#5EEAD4" : "#0D9488",
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>
              Sign In
            </Text>
          )}
        </TouchableOpacity>

        {/* Forgot password */}
        <TouchableOpacity style={{ alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 13, color: "#0D9488" }}>
            Forgot password?
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
