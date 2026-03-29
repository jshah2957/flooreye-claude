import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text } from "react-native";
import {
  usePushNotifications,
  useNotificationDeepLinking,
} from "@/hooks/usePushNotifications";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { initLogger, stopLogger } from "@/services/logger";

export default function RootLayout() {
  // Initialize centralized error logger (ships errors to cloud)
  useEffect(() => {
    initLogger();
    return () => stopLogger();
  }, []);

  // Set up foreground notification display
  usePushNotifications();

  // Set up deep linking: navigate to /alert/[id] when user taps a notification
  // Handles foregrounded, backgrounded, and cold-start (app killed) states
  useNotificationDeepLinking();

  const { isConnected } = useNetworkStatus();

  return (
    <>
      <StatusBar style="auto" />
      {!isConnected && (
        <View style={{ backgroundColor: "#DC2626", paddingVertical: 6, alignItems: "center" }}>
          <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>No internet connection</Text>
        </View>
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="alert/[id]"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="incident/[id]"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
      </Stack>
    </>
  );
}
