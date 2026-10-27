import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, haptic, Poll, Restaurant } from "@/src/api";
import { useToast } from "./Toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "No timer", minutes: null },
];

export function StartVoteButton({ title, craving, place, options }: { title: string; craving: string; place: string; options: Restaurant[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(30);
  const create = useMutation({
    mutationFn: () => api<Poll>("/polls", { method: "POST", body: { title, craving, place, options, duration_minutes: minutes } }),
    onSuccess: (p) => {
      haptic("success");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["polls"] });
      router.push(`/poll/${p.id}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <>
      <Pressable testID="start-group-vote-button" style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => { haptic(); setOpen(true); }} disabled={options.length < 2}>
        <Icon name="account-group" size={22} color={colors.onBrandSecondary} />
        <Text style={styles.text}>Can't decide? Start a group vote</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} testID="vote-timer-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]} testID="vote-timer-sheet">
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>How long should voting last?</Text>
          <Text style={styles.sheetSub}>When time's up we close the vote and announce the winner automatically.</Text>
          <View style={styles.durRow}>
            {DURATIONS.map((d) => {
              const on = d.minutes === minutes;
              return (
                <Pressable key={d.label} testID={`vote-timer-${d.minutes ?? "none"}`} style={[styles.dur, on && styles.durOn]} onPress={() => { haptic(); setMinutes(d.minutes); }}>
                  <Icon name={d.minutes ? "timer-outline" : "timer-off-outline"} size={20} color={on ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                  <Text style={[styles.durText, on && { color: colors.onBrandPrimary }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable testID="vote-timer-start-button" style={styles.start} onPress={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name="vote" size={22} color={colors.onBrandPrimary} />}
            <Text style={styles.startText}>Start the vote</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  btn: { height: 52, borderRadius: radius.pill, backgroundColor: c.brandSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg, borderBottomWidth: 4, borderBottomColor: c.warning },
  text: { color: c.onBrandSecondary, fontWeight: "900", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: spacing.xl },
  sheetTitle: { fontSize: 24, fontWeight: "900", color: c.onSurface },
  sheetSub: { fontSize: 15, color: c.muted, marginTop: spacing.xs, lineHeight: 21 },
  durRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.xl },
  dur: { width: "48%", flexGrow: 1, height: 56, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: c.surfaceTertiary },
  durOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  durText: { fontWeight: "800", fontSize: 16, color: c.onSurfaceTertiary },
  start: { height: 56, borderRadius: radius.pill, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderBottomWidth: 4, borderBottomColor: c.onBrandTertiary },
  startText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 17 },
}));
