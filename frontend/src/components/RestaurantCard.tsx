import React from "react";
import { Linking, Pressable, Share, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Favorite, haptic, mapsUrl, Restaurant } from "@/src/api";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "./Toast";

const ACCENTS = ["brandPrimary", "brandSecondary", "success", "info"] as const;

export function useFavorites() {
  return useQuery({ queryKey: ["favorites"], queryFn: () => api<Favorite[]>("/favorites") });
}

export function RestaurantCard({ r, index, craving, place }: { r: Restaurant; index: number; craving?: string; place?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: favs } = useFavorites();
  const fav = favs?.find((f) => f.restaurant.name === r.name);
  const accent = colors[ACCENTS[index % ACCENTS.length]];

  const toggle = useMutation({
    mutationFn: () => (fav ? api(`/favorites/${fav.id}`, { method: "DELETE" }) : api("/favorites", { method: "POST", body: { restaurant: r, craving: craving ?? "", place: place ?? "" } })),
    onSuccess: () => {
      haptic("success");
      toast(fav ? "Removed from saved" : `Saved ${r.name}`, fav ? "info" : "success");
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const share = () =>
    Share.share({ message: `I'm hungry! Let's go to ${r.name} (${r.cuisine}) - try the ${r.signature_dish}. ${mapsUrl(r, place)}` }).catch(() => {});

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()} style={styles.card} testID={`restaurant-card-${index}`}>
      <View style={[styles.band, { backgroundColor: accent }]}>
        <Text style={styles.initial}>{r.name.charAt(0)}</Text>
        <View style={styles.rating}>
          <Icon name="star" size={14} color={colors.brandSecondary} />
          <Text style={styles.ratingText}>{r.rating.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2} testID={`restaurant-name-${index}`}>{r.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[r.cuisine, r.price, r.distance].filter(Boolean).join("  ·  ")}
        </Text>
        {!!r.signature_dish && (
          <View style={styles.mustTry}>
            <Icon name="silverware-fork-knife" size={14} color={colors.onBrandTertiary} />
            <Text style={styles.mustTryText} numberOfLines={1}>Must try: {r.signature_dish}</Text>
          </View>
        )}
        {!!r.why && <Text style={styles.why}>{r.why}</Text>}
        <View style={styles.actions}>
          <Pressable testID={`restaurant-directions-${index}`} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={() => { haptic(); Linking.openURL(mapsUrl(r, place)); }}>
            <Icon name="navigation-variant" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.primaryText}>Let's go</Text>
          </Pressable>
          <Pressable testID={`restaurant-save-${index}`} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => toggle.mutate()} disabled={toggle.isPending}>
            <Icon name={fav ? "heart" : "heart-outline"} size={22} color={colors.brandPrimary} />
          </Pressable>
          <Pressable testID={`restaurant-share-${index}`} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={share}>
            <Icon name="share-variant" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    borderBottomWidth: 4,
    borderBottomColor: c.borderStrong,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  band: { height: 64, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  initial: { fontSize: 34, fontWeight: "900", color: c.onBrand, opacity: 0.9 },
  rating: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceInverse, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  ratingText: { color: c.onSurfaceInverse, fontWeight: "800", fontSize: 13 },
  body: { padding: spacing.lg, gap: spacing.sm },
  name: { fontSize: 20, fontWeight: "900", color: c.onSurface },
  meta: { fontSize: 14, color: c.muted, fontWeight: "600" },
  mustTry: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, maxWidth: "100%" },
  mustTryText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 13, flexShrink: 1 },
  why: { fontSize: 15, color: c.onSurfaceTertiary, lineHeight: 21 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  primaryText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  iconBtn: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
}));
