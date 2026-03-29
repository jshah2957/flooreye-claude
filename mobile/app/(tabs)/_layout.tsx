import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BRAND } from "@/constants/colors";

function TabIcon({ name, focusedName, focused }: { name: keyof typeof Ionicons.glyphMap; focusedName: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <Ionicons
      name={focused ? focusedName : name}
      size={24}
      color={focused ? BRAND.primary : BRAND.textSecondary}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND.primary,
        tabBarInactiveTintColor: BRAND.textSecondary,
        tabBarStyle: {
          backgroundColor: BRAND.surface,
          borderTopWidth: 1,
          borderTopColor: BRAND.border,
          paddingTop: 6,
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name="home-outline" focusedName="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarLabel: "Alerts",
          tabBarIcon: ({ focused }) => <TabIcon name="alert-circle-outline" focusedName="alert-circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: ({ focused }) => <TabIcon name="time-outline" focusedName="time" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarLabel: "Analytics",
          tabBarIcon: ({ focused }) => <TabIcon name="bar-chart-outline" focusedName="bar-chart" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon name="settings-outline" focusedName="settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
