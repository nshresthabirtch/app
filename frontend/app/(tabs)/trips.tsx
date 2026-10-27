import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { api, haptic, Meal, Trip } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { mealTimeLabel } from "@/src/calendar";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MEALS: { key: Meal; icon: "coffee" | "food" | "glass-wine" }[] = [
  { key: "breakfast", icon: "coffee" },
  { key: "lunch", icon: "food" },
  { key: "dinner", icon: "glass-wine" },
];

export default function TripsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(new Date(), i + 1)), []);
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(format(days[0], "yyyy-MM-dd"));
  const [meal, setMeal] = useState<Meal>("dinner");
  const [craving, setCraving] = useState("");

  const trips = useQuery({ queryKey: ["trips"], queryFn: () => api<Trip[]>("/trips") });
  const create = useMutation({
    mutationFn: () => api<Trip>("/trips", { method: "POST", body: { destination: destination.trim(), date, meal, craving: craving.trim() } }),
    onSuccess: (t) => {
      haptic("success");
      toast(`Your ${t.meal} in ${t.destination} is ready!`, "success");
      setDestination("");
      setCraving("");
      qc.invalidateQueries({ queryKey: ["trips"] });
      router.push(`/trip/${t.id}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const submit = () => {
    if (!destination.trim()) return toast("Where are you headed?", "error");
    create.mutate();
  };

  const upcoming = (trips.data ?? []).filter((t) => t.date >= format(new Date(), "yyyy-MM-dd"));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title} testID="trips-title">Hungry later</Text>
        <Text style={styles.sub}>Travelling? We’ll book a meal in your calendar.</Text>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.form} testID="trip-form">
          <Text style={styles.label}>Where to?</Text>
          <View style={styles.inputWrap}>
            <Icon name="map-marker-radius" size={20} color={colors.brandPrimary} />
            <TextInput testID="trip-destination-input" style={styles.input} placeholder="e.g. Tokyo, Shibuya" placeholderTextColor={colors.muted} value={destination} onChangeText={setDestination} />
          </View>

          <Text style={styles.label}>When?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const on = iso === date;
              return (
                <Pressable key={iso} testID={`trip-date-${iso}`} onPress={() => { haptic(); setDate(iso); }} style={[styles.day, on && styles.dayOn]}>
                  <Text style={[styles.dayDow, on && styles.dayTextOn]}>{format(d, "EEE")}</Text>
                  <Text style={[styles.dayNum, on && styles.dayTextOn]}>{format(d, "d")}</Text>
                  <Text style={[styles.dayDow, on && styles.dayTextOn]}>{format(d, "MMM")}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Which meal?</Text>
          <View style={styles.mealRow}>
            {MEALS.map((m) => {
              const on = m.key === meal;
              return (
                <Pressable key={m.key} testID={`trip-meal-${m.key}`} onPress={() => { haptic(); setMeal(m.key); }} style={[styles.meal, on && styles.mealOn]}>
                  <Icon name={m.icon} size={22} color={on ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                  <Text style={[styles.mealText, on && styles.dayTextOn]}>{m.key[0].toUpperCase() + m.key.slice(1)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Craving anything? (optional)</Text>
          <View style={styles.inputWrap}>
            <Icon name="silverware-fork-knife" size={20} color={colors.brandPrimary} />
            <TextInput testID="trip-craving-input" style={styles.input} placeholder="ramen, seafood, local classics…" placeholderTextColor={colors.muted} value={craving} onChangeText={setCraving} returnKeyType="done" onSubmitEditing={submit} />
          </View>

          <Pressable testID="trip-submit-button" style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.98 }] }]} onPress={submit} disabled={create.isPending}>
            {create.isPending ? (
              <>
                <ActivityIndicator color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>Packing your appetite…</Text>
              </>
            ) : (
              <>
                <Icon name="airplane-takeoff" size={22} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>Plan my meal</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.section}>Upcoming food adventures</Text>
        {trips.isLoading && <ActivityIndicator color={colors.brandPrimary} testID="trips-loading" />}
        {trips.isError && (
          <Pressable testID="trips-retry-button" onPress={() => trips.refetch()}>
            <Text style={styles.empty}>Failed to load trips. Tap to retry.</Text>
          </Pressable>
        )}
        {!trips.isLoading && upcoming.length === 0 && !trips.isError && (
          <Text style={styles.empty} testID="trips-empty">No trips yet. Plan your next food adventure above.</Text>
        )}
        {upcoming.map((t) => (
          <Pressable key={t.id} testID={`trip-item-${t.id}`} style={({ pressed }) => [styles.tripCard, pressed && { opacity: 0.85 }]} onPress={() => router.push(`/trip/${t.id}`)}>
            <View style={styles.tripDate}>
              <Text style={styles.tripMonth}>{format(parseISO(t.date), "MMM")}</Text>
              <Text style={styles.tripDay}>{format(parseISO(t.date), "d")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripDest} numberOfLines={1}>{t.destination}</Text>
              <Text style={styles.tripMeta} numberOfLines={1}>
                {t.meal[0].toUpperCase() + t.meal.slice(1)} · {mealTimeLabel[t.meal]} · {t.options.length} picks
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={colors.muted} />
          </Pressable>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { fontSize: 32, fontWeight: "900", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, fontWeight: "700", marginTop: spacing.xs },
  content: { padding: spacing.lg },
  form: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, borderBottomWidth: 4, borderBottomColor: c.borderStrong },
  label: { fontWeight: "900", color: c.onSurface, fontSize: 15, marginTop: spacing.md, marginBottom: spacing.sm },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 52, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: spacing.md },
  input: { flex: 1, height: "100%", fontSize: 16, fontWeight: "600", color: c.onSurface },
  dayRow: { gap: spacing.sm },
  day: { width: 60, height: 76, flexShrink: 0, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.surfaceTertiary },
  dayOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayDow: { fontSize: 12, fontWeight: "700", color: c.onSurfaceTertiary },
  dayNum: { fontSize: 22, fontWeight: "900", color: c.onSurface },
  dayTextOn: { color: c.onBrandPrimary },
  mealRow: { flexDirection: "row", gap: spacing.sm },
  meal: { flex: 1, height: 72, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  mealOn: { backgroundColor: c.brandPrimary },
  mealText: { fontWeight: "800", color: c.onSurfaceTertiary },
  cta: { marginTop: spacing.xl, height: 56, borderRadius: radius.pill, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderBottomWidth: 4, borderBottomColor: c.onBrandTertiary },
  ctaText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 17 },
  section: { fontSize: 20, fontWeight: "900", color: c.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { color: c.muted, fontWeight: "600", fontSize: 15 },
  tripCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: c.border },
  tripDate: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  tripMonth: { fontSize: 12, fontWeight: "800", color: c.onBrandTertiary, textTransform: "uppercase" },
  tripDay: { fontSize: 20, fontWeight: "900", color: c.onBrandTertiary },
  tripDest: { fontSize: 17, fontWeight: "900", color: c.onSurface },
  tripMeta: { color: c.muted, fontWeight: "600", marginTop: 2 },
}));
