import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import Icon from "@react-native-vector-icons/material-design-icons";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="fork.knife" />
          <NativeTabs.Trigger.Label>Eat</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="trips">
          <NativeTabs.Trigger.Icon sf="airplane" />
          <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="saved">
          <NativeTabs.Trigger.Icon sf="heart.fill" />
          <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: "800", fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Eat", tabBarButtonTestID: "tab-eat", tabBarIcon: ({ color }) => <Icon name="silverware-fork-knife" size={24} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: "Trips", tabBarButtonTestID: "tab-trips", tabBarIcon: ({ color }) => <Icon name="airplane" size={24} color={color} /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarButtonTestID: "tab-saved", tabBarIcon: ({ color }) => <Icon name="heart" size={24} color={color} /> }} />
    </Tabs>
  );
}
