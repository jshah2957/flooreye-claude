import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  usePushNotifications,
  useNotificationDeepLinking,
} from "@/hooks/usePushNotifications";

export default function RootLayout() {
  // Set up foreground notification display
  usePushNotifications();

  // Set up deep linking: navigate to /alert/[id] when user taps a notification
  // Handles foregrounded, backgrounded, and cold-start (app killed) states
  useNotificationDeepLinking();

  return (
    <>
      <StatusBar style="auto" />
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
