import React from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, CravingItem, haptic, mapsUrl, Poll } from "@/src/api";
import { useFavorites } from "@/src/components/RestaurantCard";
import { useToast } from "@/src/components/Toast";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function SavedScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const favs = useFavorites();
  const history = useQuery({ queryKey: ["history"], queryFn: () => api<CravingItem[]>("/history") });
  const polls = useQuery({ queryKey: ["polls"], queryFn: () => api<Poll[]>("/polls") });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/favorites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      haptic();
      toast("Removed from saved");
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const uniqueCravings = Array.from(new Map((history.data ?? []).map((h) => [h.craving.toLowerCase(), h])).values()).slice(0, 12);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title} testID="saved-title">Saved</Text>
        <Text style={styles.sub}>Your go-to spots and recent cravings.</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={favs.isRefetching} onRefresh={() => { favs.refetch(); history.refetch(); }} tintColor={colors.brandPrimary} />}
      >
        <Text style={styles.section}>Crave again</Text>
        {uniqueCravings.length === 0 ? (
          <Text style={styles.empty} testID="history-empty">Your cravings will show up here.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent}>
            {uniqueCravings.map((h) => (
              <Pressable key={h.id} testID={`history-chip-${h.id}`} style={styles.chip} onPress={() => { haptic(); router.navigate({ pathname: "/", params: { q: `I'm hungry for ${h.craving}` } }); }}>
                <Icon name="history" size={16} color={colors.onBrandTertiary} />
                <Text style={styles.chipText}>{h.craving}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {(polls.data ?? []).length > 0 && <Text style={styles.section}>Group votes</Text>}
        {(polls.data ?? []).slice(0, 5).map((p) => (
          <Pressable key={p.id} testID={`poll-item-${p.id}`} style={styles.pollRow} onPress={() => router.push(`/poll/${p.id}`)}>
            <Icon name={p.closed ? "trophy" : "vote"} size={22} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pollTitle} numberOfLines={1}>{p.title}</Text>
              <Text style={styles.favMeta} numberOfLines={1}>
                {p.closed ? (p.winner != null ? `Winner: ${p.options[p.winner].name}` : "Closed") : `${p.total} vote${p.total === 1 ? "" : "s"} · ${p.ends_at ? `ends ${new Date(p.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "live"}`}
              </Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}

        <Text style={styles.section}>Favourite spots</Text>
        {favs.isLoading && <ActivityIndicator color={colors.brandPrimary} />}
        {!favs.isLoading && (favs.data ?? []).length === 0 && (
          <View style={styles.emptyBox} testID="favorites-empty">
            <Icon name="heart-outline" size={44} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>You haven’t saved any spots yet.</Text>
            <Text style={styles.empty}>Tap the heart on any recommendation.</Text>
          </View>
        )}
        <View style={styles.grid}>
          {(favs.data ?? []).map((f) => (
            <View key={f.id} style={styles.fav} testID={`favorite-${f.id}`}>
              <View style={styles.favTop}>
                <Text style={styles.favInitial}>{f.restaurant.name.charAt(0)}</Text>
                <Pressable testID={`favorite-remove-${f.id}`} hitSlop={12} onPress={() => remove.mutate(f.id)}>
                  <Icon name="heart" size={22} color={colors.brandPrimary} />
                </Pressable>
              </View>
              <Text style={styles.favName} numberOfLines={2}>{f.restaurant.name}</Text>
              <Text style={styles.favMeta} numberOfLines={1}>{f.restaurant.cuisine} · {f.restaurant.price}</Text>
              <Pressable testID={`favorite-go-${f.id}`} style={styles.go} onPress={() => Linking.openURL(mapsUrl(f.restaurant, f.place))}>
                <Icon name="navigation-variant" size={16} color={colors.onSurfaceInverse} />
                <Text style={styles.goText}>Go</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  title: { fontSize: 32, fontWeight: "900", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, fontWeight: "700", marginTop: spacing.xs },
  content: { padding: spacing.lg },
  section: { fontSize: 20, fontWeight: "900", color: c.onSurface, marginBottom: spacing.sm, marginTop: spacing.md },
  chipRow: { height: 56, flexGrow: 0, marginHorizontal: -spacing.lg },
  chipContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: c.brandTertiary },
  chipText: { color: c.onBrandTertiary, fontWeight: "800", textTransform: "capitalize" },
  empty: { color: c.muted, fontWeight: "600", textAlign: "center" },
  pollRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: c.border, minHeight: 64 },
  pollTitle: { fontSize: 16, fontWeight: "900", color: c.onSurface },
  emptyBox: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: c.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  fav: { width: "48%", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: c.border, borderBottomWidth: 4, borderBottomColor: c.borderStrong, minHeight: 170 },
  favTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  favInitial: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSecondary, color: c.onBrandSecondary, fontWeight: "900", fontSize: 22, textAlign: "center", lineHeight: 44, overflow: "hidden" },
  favName: { fontSize: 16, fontWeight: "900", color: c.onSurface, marginTop: spacing.sm },
  favMeta: { color: c.muted, fontWeight: "600", fontSize: 13, marginTop: 2, flex: 1 },
  go: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceInverse, marginTop: spacing.sm },
  goText: { color: c.onSurfaceInverse, fontWeight: "800" },
}));
