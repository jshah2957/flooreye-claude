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
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }}>
        {/* Branding */}
        <View style={{ alignItems: "center", marginBottom: 48 }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: "#0D9488", letterSpacing: -0.5 }}>
            FloorEye
          </Text>
          <Text style={{ fontSize: 14, color: "#78716C", marginTop: 6, letterSpacing: 0.2 }}>
            See Every Drop. Stop Every Slip.
          </Text>
        </View>

        {/* Email */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>
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
            height: 52,
            borderWidth: 1,
            borderColor: "#E7E5E0",
            borderRadius: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            backgroundColor: "#FFFFFF",
            marginBottom: 20,
            color: "#1C1917",
          }}
        />

        {/* Password */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#1C1917", marginBottom: 8 }}>
          Password
        </Text>
        <View style={{ position: "relative", marginBottom: 20 }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword}
            style={{
              height: 52,
              borderWidth: 1,
              borderColor: "#E7E5E0",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingRight: 72,
              fontSize: 16,
              backgroundColor: "#FFFFFF",
              color: "#1C1917",
            }}
          />
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              paddingHorizontal: 16,
              minHeight: 48,
              minWidth: 48,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0D9488" }}>
              {showPassword ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>

        {/* Error */}
        {error ? (
          <View
            style={{
              backgroundColor: "#FEE2E2",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              borderLeftWidth: 4,
              borderLeftColor: "#DC2626",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>{error}</Text>
          </View>
        ) : null}

        {/* Sign In */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            height: 52,
            backgroundColor: loading ? "#5EEAD4" : "#0D9488",
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
          }}
        >
          {loading ? (
            <>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                Signing in...
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
              Sign In
            </Text>
          )}
        </TouchableOpacity>

        {/* Forgot password */}
        <TouchableOpacity
          style={{ alignItems: "center", marginTop: 20, minHeight: 48, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#0D9488" }}>
            Forgot password?
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
