import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { BRAND } from "@/constants/colors";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 28, height: 28 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: focused ? "700" : "500",
          color: focused ? BRAND.primary : BRAND.textSecondary,
        }}
      >
        {label}
      </Text>
    </View>
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
          tabBarIcon: ({ focused }) => <TabIcon label="H" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarLabel: "Alerts",
          tabBarIcon: ({ focused }) => <TabIcon label="!" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: ({ focused }) => <TabIcon label="=" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarLabel: "Analytics",
          tabBarIcon: ({ focused }) => <TabIcon label="#" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon label="*" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
