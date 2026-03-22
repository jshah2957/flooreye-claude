import { useState, useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import api from "../services/api";
import { NOTIFICATION_CHANNELS, APP, TIMEOUTS } from "@/constants/config";
import { BRAND } from "@/constants/theme";

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function setupAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS === "android") {
    const ch = NOTIFICATION_CHANNELS;
    await Notifications.setNotificationChannelAsync(ch.SPILL_ALERTS.id, {
      name: ch.SPILL_ALERTS.name,
      importance: ch.SPILL_ALERTS.importance as Notifications.AndroidImportance,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: BRAND.primary,
      sound: "default",
      enableVibrate: true,
      enableLights: true,
    });

    await Notifications.setNotificationChannelAsync(ch.INCIDENT_UPDATES.id, {
      name: ch.INCIDENT_UPDATES.name,
      importance: ch.INCIDENT_UPDATES.importance as Notifications.AndroidImportance,
      sound: "default",
      enableVibrate: true,
    });

    await Notifications.setNotificationChannelAsync(ch.SYSTEM.id, {
      name: ch.SYSTEM.name,
      importance: ch.SYSTEM.importance as Notifications.AndroidImportance,
      sound: "default",
    });
  }
}

/**
 * Request push notification permissions and register the token with the backend.
 * Returns the Expo push token or null if permissions are denied / device is a simulator.
 * Never throws — push registration failure should not block the app.
 */
export async function registerPushTokenWithBackend(): Promise<string | null> {
  try {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
      return null;
    }

    // Set up Android notification channels before requesting permissions
    await setupAndroidNotificationChannel();

    // Check existing permissions
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowProvisional: false,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      // Permission denied — don't block login
      return null;
    }

    // Get the Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      ...(projectId ? { projectId } : {}),
    });
    const token = tokenResponse.data;

    // Register with the backend
    const platform: "ios" | "android" =
      Platform.OS === "ios" ? "ios" : "android";

    await api.post("/auth/device-token", {
      token,
      platform,
      app_version: APP.VERSION,
      device_model: Device.modelName ?? undefined,
    });

    return token;
  } catch (err: unknown) {
    // Retry once silently after a short delay
    console.warn(
      "Push registration failed, retrying:",
      err instanceof Error ? err.message : err,
    );
    try {
      await new Promise((r) => setTimeout(r, TIMEOUTS.PUSH_RETRY_DELAY_MS));

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        ...(projectId ? { projectId } : {}),
      });
      const token = tokenResponse.data;

      const platform: "ios" | "android" =
        Platform.OS === "ios" ? "ios" : "android";

      await api.post("/auth/device-token", {
        token,
        platform,
        app_version: APP.VERSION,
        device_model: Device.modelName ?? undefined,
      });

      return token;
    } catch {
      // Give up silently — don't block the user
      return null;
    }
  }
}

/**
 * Unregister the device push token from the backend.
 * Never throws — called during logout, errors are swallowed.
 */
export async function unregisterPushTokenFromBackend(): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      ...(projectId ? { projectId } : {}),
    });
    const token = tokenResponse.data;

    if (token) {
      await api.delete("/auth/device-token", {
        params: { token },
      });
    }
  } catch (err: unknown) {
    // Best-effort removal — don't throw on failure
    console.warn(
      "Failed to unregister push token:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Hook that manages push notification state and listeners.
 * Used in the root layout for foreground notification display.
 */
export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Listen for notifications received while the app is in the foreground
    notificationListener.current =
      Notifications.addNotificationReceivedListener(
        (incomingNotification: Notifications.Notification) => {
          setNotification(incomingNotification);
        },
      );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current,
        );
      }
    };
  }, []);

  return {
    expoPushToken,
    setExpoPushToken,
    notification,
  };
}

/**
 * Hook that sets up notification response listeners for deep linking.
 * Handles 3 states:
 * 1. App foregrounded — addNotificationResponseReceivedListener fires on tap
 * 2. App backgrounded — same listener fires when app resumes from notification tap
 * 3. App killed — checks getLastNotificationResponseAsync() on mount
 */
export function useNotificationDeepLinking() {
  const router = useRouter();
  const lastProcessedId = useRef<string | null>(null);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (!data) return;

      const incidentId = data.incident_id as string | undefined;
      if (incidentId && incidentId !== lastProcessedId.current) {
        lastProcessedId.current = incidentId;
        router.push(`/incident/${incidentId}`);
      }
    },
    [router],
  );

  useEffect(() => {
    // State 3: App was killed — check if it was launched from a notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    // States 1 & 2: App foregrounded or backgrounded — listen for notification taps
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => subscription.remove();
  }, [handleNotificationResponse]);
}
