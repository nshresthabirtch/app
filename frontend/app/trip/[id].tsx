import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api, haptic, Trip } from "@/src/api";
import { addToDeviceCalendar, googleCalendarUrl, mealTimeLabel } from "@/src/calendar";
import { RestaurantCard } from "@/src/components/RestaurantCard";
import { StartVoteButton } from "@/src/components/StartVoteButton";
import { useToast } from "@/src/components/Toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [calState, setCalState] = useState<"idle" | "adding" | "added" | "blocked">("idle");
  const trip = useQuery({ queryKey: ["trip", id], queryFn: () => api<Trip>(`/trips/${id}`) });
  const del = useMutation({
    mutationFn: () => api(`/trips/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast("Trip deleted");
      router.back();
    },
  });

  const addCal = async () => {
    if (!trip.data) return;
    if (calState === "blocked") return Linking.openSettings();
    setCalState("adding");
    const r = await addToDeviceCalendar(trip.data);
    if (r === "added") {
      haptic("success");
      setCalState("added");
      toast("Added to your calendar!", "success");
    } else if (r === "unsupported") {
      setCalState("idle");
      Linking.openURL(googleCalendarUrl(trip.data));
    } else if (r === "blocked") {
      setCalState("blocked");
      toast("Calendar access is off. Enable it in Settings.", "error");
    } else {
      setCalState("idle");
      toast(r === "denied" ? "Calendar access needed to save this meal" : "Couldn't add the event", "error");
    }
  };

  const t = trip.data;
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="trip-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/trips"))}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{t?.destination ?? "Trip"}</Text>
        <Pressable testID="trip-delete-button" style={styles.iconBtn} onPress={() => del.mutate()} disabled={!t}>
          <Icon name="trash-can-outline" size={22} color={colors.error} />
        </Pressable>
      </View>
      {trip.isLoading && <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brandPrimary} size="large" testID="trip-loading" />}
      {trip.isError && (
        <Pressable testID="trip-retry-button" onPress={() => trip.refetch()} style={{ padding: spacing.xl }}>
          <Text style={styles.why}>Failed to load itinerary. Tap to retry.</Text>
        </Pressable>
      )}
      {t && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.hero} testID="trip-hero">
            <Text style={styles.heroKicker}>
              {t.meal.toUpperCase()} · {format(parseISO(t.date), "EEE, MMM d")} · {mealTimeLabel[t.meal]}
            </Text>
            <Text style={styles.heroTitle} testID="trip-destination">{t.destination}</Text>
            {!!t.headline && <Text style={styles.heroLine}>{t.headline}</Text>}
            <Pressable testID="trip-add-device-calendar-button" style={({ pressed }) => [styles.calBtn, pressed && { opacity: 0.85 }]} onPress={addCal} disabled={calState === "adding" || calState === "added"}>
              {calState === "adding" ? <ActivityIndicator color={colors.onSurfaceInverse} /> : <Icon name={calState === "added" ? "check-circle" : calState === "blocked" ? "cog" : "calendar-plus"} size={20} color={colors.onSurfaceInverse} />}
              <Text style={styles.calText}>{calState === "added" ? "In your calendar" : calState === "blocked" ? "Open Settings" : "Add to my calendar"}</Text>
            </Pressable>
            <Pressable testID="trip-add-google-calendar-button" style={({ pressed }) => [styles.gBtn, pressed && { opacity: 0.85 }]} onPress={() => Linking.openURL(googleCalendarUrl(t))}>
              <Icon name="google" size={18} color={colors.onSurface} />
              <Text style={styles.gText}>Add to Google Calendar</Text>
            </Pressable>
            <Text style={styles.note}>We’ll ask for calendar access so your meal and picks show up on the day.</Text>
          </View>
          <Text style={styles.section}>Where to eat</Text>
          <StartVoteButton title={`${t.meal[0].toUpperCase()}${t.meal.slice(1)} in ${t.destination} — where to?`} craving={t.craving} place={t.destination} options={t.options} />
          {t.options.map((r, i) => (
            <RestaurantCard key={r.name + i} r={r} index={i} craving={t.craving} place={t.destination} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "900", color: c.onSurface, textAlign: "center" },
  iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg },
  hero: { backgroundColor: c.brandPrimary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, borderBottomWidth: 5, borderBottomColor: c.onBrandTertiary },
  heroKicker: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1, opacity: 0.9 },
  heroTitle: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 32, letterSpacing: -0.5 },
  heroLine: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  calBtn: { marginTop: spacing.md, height: 52, borderRadius: radius.pill, backgroundColor: c.surfaceInverse, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  calText: { color: c.onSurfaceInverse, fontWeight: "900", fontSize: 16 },
  gBtn: { height: 48, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  gText: { color: c.onSurface, fontWeight: "800", fontSize: 15 },
  note: { color: c.onBrandPrimary, opacity: 0.85, fontSize: 12, fontWeight: "600", textAlign: "center" },
  section: { fontSize: 22, fontWeight: "900", color: c.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  why: { color: c.muted, fontWeight: "700", textAlign: "center" },
}));
