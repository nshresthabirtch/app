import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatLeft, haptic, mapsUrl, Poll, pollLink } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useToast } from "@/src/components/Toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function useVoterId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    storage.getItem("voter_id", null as string | null).then(async (v) => {
      if (v) return setId(v);
      const n = `a${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await storage.setItem("voter_id", n);
      setId(n);
    });
  }, []);
  return id;
}

export default function PollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const voterId = useVoterId();
  const poll = useQuery({ queryKey: ["poll", id], queryFn: () => api<Poll>(`/polls/${id}`), refetchInterval: (q) => (q.state.data?.closed ? false : 4000) });
  const setPoll = (p: Poll) => {
    qc.setQueryData(["poll", id], p);
    qc.invalidateQueries({ queryKey: ["polls"] });
  };
  const vote = useMutation({
    mutationFn: (choice: number) => api<Poll>(`/polls/${id}/vote`, { method: "POST", body: { voter_id: voterId, name: "Me", choice } }),
    onSuccess: (p) => { haptic("success"); setPoll(p); },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const close = useMutation({
    mutationFn: () => api<Poll>(`/polls/${id}/close`, { method: "POST" }),
    onSuccess: (p) => { haptic("success"); setPoll(p); },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const del = useMutation({
    mutationFn: () => api(`/polls/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["polls"] }); toast("Vote deleted"); router.back(); },
  });

  const p = poll.data;
  const [now, setNow] = useState(Date.now());
  const running = !!p?.ends_at && !p.closed;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const msLeft = p?.ends_at ? new Date(p.ends_at).getTime() - now : null;
  const timeUp = running && msLeft !== null && msLeft <= 0;
  const { refetch } = poll;
  useEffect(() => {
    if (timeUp) refetch();
  }, [timeUp, refetch]);
  // Announce the winner the moment the vote flips to closed while watching.
  const wasOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!p) return;
    if (wasOpen.current && p.closed && p.winner != null) {
      haptic("success");
      const timedOut = !!p.ends_at && new Date(p.ends_at).getTime() <= Date.now();
      toast(`${timedOut ? "Time's up! " : ""}It's ${p.options[p.winner].name}!`, "success");
    }
    wasOpen.current = !p.closed;
  }, [p, toast]);
  const share = () => {
    if (!p) return;
    haptic();
    const message = `${p.title} — help me pick where we eat! Vote here: ${pollLink(p.id)}`;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(pollLink(p.id));
        toast("Link copied — paste it to your friends", "success");
      } catch {
        toast(pollLink(p.id));
      }
    };
    if (Platform.OS === "web" && !(navigator as Navigator & { share?: unknown }).share) return copy();
    Share.share({ message }).catch(() => (Platform.OS === "web" ? copy() : toast("Couldn't open share", "error")));
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onDelete = () => {
    if (confirmDelete) return del.mutate();
    setConfirmDelete(true);
    toast("Tap the trash again to delete this vote");
    setTimeout(() => setConfirmDelete(false), 3000);
  };
  const mine = p?.votes.find((v) => v.voter_id === voterId)?.choice;
  const winner = p?.closed && p.winner != null ? p.options[p.winner] : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="poll-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Group vote</Text>
        <Pressable testID="poll-delete-button" style={styles.iconBtn} onPress={onDelete} disabled={!p}>
          <Icon name="trash-can-outline" size={22} color={colors.error} />
        </Pressable>
      </View>
      {poll.isLoading && <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={colors.brandPrimary} testID="poll-loading" />}
      {poll.isError && !p && (
        <Pressable testID="poll-retry-button" onPress={() => poll.refetch()} style={{ padding: spacing.xl }}>
          <Text style={styles.muted}>Couldn't load this vote. Tap to retry.</Text>
        </Pressable>
      )}
      {p && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.title} testID="poll-title">{p.title}</Text>
          <Text style={styles.muted} testID="poll-total">
            {p.closed ? "Voting closed" : `${p.total} vote${p.total === 1 ? "" : "s"} so far · updates live`}
          </Text>

          {running && msLeft !== null && (
            <View style={styles.timer} testID="poll-countdown">
              <Icon name="timer-outline" size={20} color={colors.onSurfaceInverse} />
              <Text style={styles.timerText} testID="poll-countdown-text">
                {timeUp ? "Time's up! Announcing the winner…" : `Closes in ${formatLeft(msLeft)}`}
              </Text>
            </View>
          )}
          {winner && (
            <Animated.View entering={ZoomIn.springify()} style={styles.winner} testID="poll-winner">
              <Icon name="trophy" size={32} color={colors.onBrandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.winnerKicker}>
                  {p.decided === "tiebreak" ? "TIE BROKEN BY RATING" : p.decided === "no_votes" ? "NO VOTES · TOP-RATED PICK" : "THE GROUP HAS SPOKEN"}
                </Text>
                <Text style={styles.winnerName}>{winner.name}</Text>
              </View>
              <Pressable testID="poll-winner-go-button" style={styles.goBtn} onPress={() => Linking.openURL(mapsUrl(winner, p.place))}>
                <Icon name="navigation-variant" size={20} color={colors.onSurfaceInverse} />
              </Pressable>
            </Animated.View>
          )}

          {!p.closed && (
            <Pressable testID="poll-share-button" style={({ pressed }) => [styles.share, pressed && { transform: [{ scale: 0.98 }] }]} onPress={share}>
              <Icon name="share-variant" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.shareText}>Send link to friends</Text>
            </Pressable>
          )}
          {!p.closed && <Text style={styles.hint}>Friends can vote from any browser — no app needed. Tap a place to cast your own vote.</Text>}

          {p.options.map((r, i) => {
            const pct = p.total ? p.counts[i] / p.total : 0;
            const isMine = mine === i;
            const isWin = p.closed && p.winner === i;
            const names = p.votes.filter((v) => v.choice === i && v.name).map((v) => v.name);
            return (
              <Animated.View key={r.name + i} entering={FadeInDown.delay(i * 60)}>
                <Pressable
                  testID={`poll-option-${i}`}
                  disabled={p.closed || !voterId || vote.isPending}
                  onPress={() => vote.mutate(i)}
                  style={({ pressed }) => [styles.opt, (isMine || isWin) && styles.optOn, pressed && { opacity: 0.85 }]}
                >
                  <View style={[styles.bar, { width: `${Math.round(pct * 100)}%` }]} />
                  <View style={styles.optIn}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optName} numberOfLines={1}>{isMine ? "✓ " : ""}{r.name}</Text>
                      <Text style={styles.optMeta} numberOfLines={1}>
                        {names.length ? names.join(", ") : [r.cuisine, r.price].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text style={styles.count} testID={`poll-option-count-${i}`}>{p.counts[i]}</Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}

          {!p.closed && (
            <Pressable testID="poll-close-button" style={styles.closeBtn} onPress={() => close.mutate()} disabled={close.isPending || p.total === 0}>
              <Text style={[styles.closeText, p.total === 0 && { opacity: 0.4 }]}>End vote & pick the winner</Text>
            </Pressable>
          )}
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
  title: { fontSize: 28, fontWeight: "900", color: c.onSurface, letterSpacing: -0.5 },
  muted: { color: c.muted, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.lg },
  winner: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.brandPrimary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderBottomWidth: 5, borderBottomColor: c.onBrandTertiary },
  timer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", backgroundColor: c.surfaceInverse, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 40, marginBottom: spacing.lg },
  timerText: { color: c.onSurfaceInverse, fontWeight: "900", fontSize: 15, fontVariant: ["tabular-nums"] },
  winnerKicker: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 1, opacity: 0.9 },
  winnerName: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 22 },
  goBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  share: { height: 56, borderRadius: radius.pill, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderBottomWidth: 4, borderBottomColor: c.onBrandTertiary },
  shareText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 17 },
  hint: { color: c.muted, fontWeight: "600", fontSize: 13, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
  opt: { overflow: "hidden", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, borderBottomWidth: 4, marginBottom: spacing.md, minHeight: 68, justifyContent: "center" },
  optOn: { borderColor: c.brandPrimary },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: c.brandTertiary },
  optIn: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  optName: { fontSize: 17, fontWeight: "900", color: c.onSurface },
  optMeta: { color: c.muted, fontWeight: "600", fontSize: 13, marginTop: 2 },
  count: { fontSize: 22, fontWeight: "900", color: c.onBrandTertiary },
  closeBtn: { height: 52, borderRadius: radius.pill, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  closeText: { color: c.onSurfaceInverse, fontWeight: "900", fontSize: 16 },
}));
