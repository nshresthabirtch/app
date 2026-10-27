import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming, withSpring } from "react-native-reanimated";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useQueryClient } from "@tanstack/react-query";
import { api, haptic, HungryResult, Restaurant, todayISO } from "@/src/api";
import { RestaurantCard } from "@/src/components/RestaurantCard";
import { VoiceSheet } from "@/src/components/VoiceSheet";
import { StartVoteButton } from "@/src/components/StartVoteButton";
import { useToast } from "@/src/components/Toast";
import { useLocation } from "@/src/useLocation";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const CRAVINGS = ["Pizza", "Sushi", "Tacos", "Ramen", "Burgers", "Soup", "Curry", "Brunch", "Dessert", "Salad", "BBQ", "Dumplings"];
const BUDGETS = [null, "$", "$$", "$$$"] as const;
const LOADING_LINES = ["Sniffing out the good stuff…", "Asking the locals…", "Checking who's got the crispiest fries…", "Warming up the plates…"];
const SURPRISE = "I'm hungry for something surprising! Pick a random delicious craving for me.";

export default function EatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ q?: string }>();
  const loc = useLocation();
  const [text, setText] = useState("");
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]>(null);
  const [voice, setVoice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [result, setResult] = useState<{ craving: string; headline: string; options: Restaurant[] } | null>(null);
  const lastQuery = useRef("");
  const dice = useSharedValue(0);
  const diceStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${dice.value}deg` }] }));

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1600);
    return () => clearInterval(t);
  }, [loading]);

  const run = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query) return;
      lastQuery.current = query;
      setSaid(query === SURPRISE ? "Surprise me!" : query);
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await api<HungryResult>("/hungry", {
          method: "POST",
          body: { text: query, lat: loc.coords?.lat, lng: loc.coords?.lng, place: loc.place, today: todayISO(), budget },
        });
        if (res.intent === "trip") {
          haptic("success");
          toast(`Trip to ${res.trip.destination} planned!`, "success");
          qc.invalidateQueries({ queryKey: ["trips"] });
          router.push(`/trip/${res.trip.id}`);
        } else {
          setResult(res);
          qc.invalidateQueries({ queryKey: ["history"] });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't fetch that");
      } finally {
        setLoading(false);
      }
    },
    [loc.coords, loc.place, budget, toast, qc, router],
  );

  useEffect(() => {
    if (params.q) {
      run(params.q);
      router.setParams({ q: undefined });
    }
  }, [params.q, run, router]);

  const submit = () => {
    if (!text.trim()) return;
    const q = /hungry|travel|going|trip|visit/i.test(text) ? text : `I'm hungry for ${text}`;
    setText("");
    run(q);
  };

  const surprise = () => {
    haptic("medium");
    dice.value = withSequence(withTiming(dice.value + 720, { duration: 700 }), withSpring(dice.value + 720));
    run(SURPRISE);
  };

  const locLabel =
    loc.status === "granted" ? loc.place ?? "Near you" : loc.status === "blocked" ? "Location off · Settings" : loc.status === "checking" ? "Locating…" : "Use my location";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.topRow}>
          <Text style={styles.brand} testID="app-title">I'm Hungry</Text>
          <Pressable testID="budget-toggle" style={styles.pill} onPress={() => { haptic(); setBudget(BUDGETS[(BUDGETS.indexOf(budget) + 1) % BUDGETS.length]); }}>
            <Icon name="cash" size={16} color={colors.onSurfaceTertiary} />
            <Text style={styles.pillText}>{budget ?? "Any $"}</Text>
          </Pressable>
        </View>
        <Pressable testID="location-pill" style={styles.locRow} onPress={loc.status === "granted" ? undefined : loc.request}>
          <Icon name="map-marker" size={16} color={colors.brandPrimary} />
          <Text style={styles.locText} numberOfLines={1} testID="location-label">{locLabel}</Text>
        </Pressable>
        <View style={styles.inputRow}>
          <TextInput
            testID="craving-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="I'm hungry for…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={submit}
          />
          <Pressable testID="craving-submit-button" style={styles.send} onPress={submit}>
            <Icon name="arrow-right" size={22} color={colors.onSurfaceInverse} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent} keyboardShouldPersistTaps="handled">
          {CRAVINGS.map((c) => (
            <Pressable key={c} testID={`craving-chip-${c.toLowerCase()}`} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} onPress={() => { haptic(); run(`I'm hungry for ${c.toLowerCase()}`); }}>
              <Text style={styles.chipText}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 120 }]} keyboardShouldPersistTaps="handled" testID="eat-scroll">
        {!!said && (
          <Animated.View entering={FadeIn} style={styles.bubble} testID="you-said-bubble">
            <Text style={styles.bubbleText}>{"\u201C"}{said}{"\u201D"}</Text>
          </Animated.View>
        )}
        {loading && (
          <View style={styles.center} testID="results-loading">
            <ActivityIndicator color={colors.brandPrimary} size="large" />
            <Text style={styles.loadingText}>{LOADING_LINES[line]}</Text>
          </View>
        )}
        {!!error && !loading && (
          <View style={styles.center} testID="results-error">
            <Icon name="cup-off" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Oops, spilled that one.</Text>
            <Text style={styles.emptySub}>{error}</Text>
            <Pressable testID="results-retry-button" style={styles.retry} onPress={() => run(lastQuery.current)}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {result && !loading && (
          <View testID="results-list">
            <Text style={styles.headline} testID="results-headline">{result.headline || `Hungry for ${result.craving}?`}</Text>
            <Text style={styles.subhead}>{result.options.length} spots for {result.craving}{loc.place ? ` near ${loc.place}` : ""}</Text>
            <StartVoteButton title={`Where should we get ${result.craving}?`} craving={result.craving} place={loc.place ?? ""} options={result.options} />
            {result.options.map((r, i) => (
              <RestaurantCard key={r.name + i} r={r} index={i} craving={result.craving} place={loc.place ?? undefined} />
            ))}
          </View>
        )}
        {!said && !loading && (
          <View style={styles.empty} testID="results-empty">
            <View style={styles.plate}>
              <Icon name="silverware-variant" size={56} color={colors.brandPrimary} />
            </View>
            <Text style={styles.emptyTitle}>What are you hungry for?</Text>
            <Text style={styles.emptySub}>Tap the mic and say {"\u201C"}I'm hungry for soup{"\u201D"} — or plan ahead with {"\u201C"}I'm going to Lisbon Saturday, hungry for dinner{"\u201D"}.</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.fabRow, { bottom: bottomChrome + spacing.lg }]} pointerEvents="box-none">
        <Pressable testID="surprise-me-button" style={({ pressed }) => [styles.dice, pressed && { transform: [{ scale: 0.92 }] }]} onPress={surprise} disabled={loading}>
          <Animated.View style={diceStyle}>
            <Icon name="dice-5" size={28} color={colors.onBrandSecondary} />
          </Animated.View>
        </Pressable>
        <Pressable testID="mic-fab" style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]} onPress={() => { haptic("medium"); setVoice(true); }}>
          <Icon name="microphone" size={30} color={colors.onBrandPrimary} />
          <Text style={styles.fabText}>I'm hungry…</Text>
        </Pressable>
      </View>

      <VoiceSheet
        visible={voice}
        onClose={() => setVoice(false)}
        onTranscript={(t) => {
          setVoice(false);
          run(t);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 32, fontWeight: "900", color: c.onSurface, letterSpacing: -0.5 },
  pill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  pillText: { fontWeight: "800", color: c.onSurfaceTertiary },
  locRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 32, alignSelf: "flex-start" },
  locText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 14 },
  inputRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  input: { flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: "600", color: c.onSurface },
  send: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  chipRow: { height: 56, flexGrow: 0, marginHorizontal: -spacing.lg },
  chipContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: c.brandTertiary, justifyContent: "center" },
  chipText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 14 },
  content: { padding: spacing.lg },
  bubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: c.brandSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, borderBottomRightRadius: spacing.xs, marginBottom: spacing.lg },
  bubbleText: { color: c.onBrandSecondary, fontWeight: "800", fontSize: 15 },
  center: { alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.md },
  loadingText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 16 },
  headline: { fontSize: 24, fontWeight: "900", color: c.onSurface },
  subhead: { color: c.muted, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.lg },
  empty: { alignItems: "center", paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.md },
  plate: { width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 6, borderColor: c.surfaceSecondary },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: c.onSurface, textAlign: "center" },
  emptySub: { fontSize: 15, color: c.muted, textAlign: "center", lineHeight: 22 },
  retry: { height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: c.surfaceInverse, justifyContent: "center" },
  retryText: { color: c.onSurfaceInverse, fontWeight: "800" },
  fabRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.md },
  fab: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 64, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: c.brandPrimary, borderBottomWidth: 4, borderBottomColor: c.onBrandTertiary, shadowColor: c.brandPrimary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 18 },
  dice: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: c.warning, elevation: 6, shadowColor: c.onSurface, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
}));
