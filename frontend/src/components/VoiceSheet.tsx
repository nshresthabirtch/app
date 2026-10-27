import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { uploadForm } from "@/src/utils/upload";
import { API, haptic } from "@/src/api";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Phase = "checking" | "ask" | "blocked" | "listening" | "thinking" | "error";

export function VoiceSheet({ visible, onClose, onTranscript }: { visible: boolean; onClose: () => void; onTranscript: (t: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const rstate = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>("checking");
  const [msg, setMsg] = useState("");
  const phaseRef = useRef<Phase>("checking");
  const preparing = useRef(false);
  const turn = useRef(0);
  const startedAt = useRef(0);
  const floor = useRef<number[]>([]);
  const spoke = useRef(false);
  const lastLoud = useRef(0);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useSharedValue(1);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const safeStop = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
    try {
      if (recorder.isRecording) recorder.stop().catch(() => {});
    } catch {
      // recorder already released
    }
  }, [recorder]);

  const finish = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    go("thinking");
    if (watchdog.current) clearTimeout(watchdog.current);
    const myTurn = ++turn.current;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording");
      const name = Platform.OS === "web" ? "recording.webm" : "recording.m4a";
      const res = await uploadForm(`${API}/transcribe`, { files: { audio: { uri, name, mimeType: Platform.OS === "web" ? "audio/webm" : "audio/m4a" } } });
      const data = await res.json();
      if (myTurn !== turn.current) return;
      if (!res.ok) throw new Error(data?.detail ?? "Transcription failed");
      const text = (data.text ?? "").trim();
      if (!text) {
        go("error");
        setMsg("Didn't catch that. Try again!");
        return;
      }
      haptic("success");
      onTranscript(text);
    } catch (e) {
      if (myTurn !== turn.current) return;
      go("error");
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [recorder, onTranscript]);

  const start = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      floor.current = [];
      spoke.current = false;
      lastLoud.current = Date.now();
      haptic("medium");
      go("listening");
      watchdog.current = setTimeout(() => finish(), 20000);
    } catch {
      go("error");
      setMsg("Couldn't start the microphone.");
    } finally {
      preparing.current = false;
    }
  }, [recorder, finish]);

  const ask = useCallback(async () => {
    const p = await requestRecordingPermissionsAsync();
    if (p.granted) start();
    else go(p.canAskAgain ? "ask" : "blocked");
  }, [start]);

  useEffect(() => {
    if (!visible) return;
    setMsg("");
    go("checking");
    getRecordingPermissionsAsync()
      .then((p) => (p.granted ? start() : go(p.canAskAgain ? "ask" : "blocked")))
      .catch(() => go("ask"));
    const turnRef = turn;
    return () => {
      turnRef.current++;
      safeStop();
    };
  }, [visible, start, safeStop]);

  // Silence detection: calibrate the room, then stop ~1.8s after speech ends.
  useEffect(() => {
    if (phase !== "listening") return;
    const m = rstate.metering;
    if (m === undefined || m === null) return;
    const t = Date.now() - startedAt.current;
    if (t < 400) return;
    if (t < 900) {
      floor.current.push(m);
      return;
    }
    const f = floor.current.length ? floor.current.reduce((a, b) => a + b, 0) / floor.current.length : -50;
    if (m > f + 12) {
      spoke.current = true;
      lastLoud.current = Date.now();
    } else if (spoke.current && Date.now() - lastLoud.current > 1800) {
      finish();
    }
  }, [rstate.metering, phase, finish]);

  useEffect(() => {
    if (phase === "listening") pulse.value = withRepeat(withTiming(1.25, { duration: 700 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1);
    }
  }, [phase, pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));

  const close = () => {
    turn.current++;
    safeStop();
    onClose();
  };

  const title = {
    checking: "Getting ready…",
    ask: "Let me hear your craving",
    blocked: "Microphone is off",
    listening: "Listening…",
    thinking: "Got it! Thinking…",
    error: "Hmm…",
  }[phase];

  const sub = {
    checking: "",
    ask: "Allow the mic so you can just say \u201CI'm hungry for tacos\u201D or \u201CI'm going to Rome Friday, hungry for lunch\u201D.",
    blocked: "Turn on microphone access in Settings to talk to I'm Hungry. You can still type below.",
    listening: "Say \u201CI'm hungry for…\u201D  — I'll stop when you pause.",
    thinking: "Turning your words into food.",
    error: msg,
  }[phase];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} testID="voice-sheet-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]} testID="voice-sheet">
        <View style={styles.handle} />
        <Text style={styles.title} testID="voice-sheet-title">{title}</Text>
        {!!sub && <Text style={styles.sub} testID="voice-sheet-subtitle">{sub}</Text>}
        <View style={styles.micWrap}>
          {phase === "listening" && <Animated.View style={[styles.ring, ring]} />}
          {phase === "thinking" || phase === "checking" ? (
            <View style={styles.mic}><ActivityIndicator color={colors.onBrandPrimary} size="large" /></View>
          ) : (
            <Pressable
              testID="voice-mic-button"
              style={({ pressed }) => [styles.mic, pressed && { transform: [{ scale: 0.94 }] }]}
              onPress={() => {
                if (phase === "listening") finish();
                else if (phase === "ask") ask();
                else if (phase === "blocked") Linking.openSettings();
                else start();
              }}
            >
              <Icon name={phase === "listening" ? "stop" : phase === "blocked" ? "cog" : "microphone"} size={44} color={colors.onBrandPrimary} />
            </Pressable>
          )}
        </View>
        {phase === "ask" && (
          <Pressable testID="voice-allow-mic-button" style={styles.cta} onPress={ask}>
            <Text style={styles.ctaText}>Allow microphone</Text>
          </Pressable>
        )}
        {phase === "blocked" && (
          <Pressable testID="voice-open-settings-button" style={styles.cta} onPress={() => Linking.openSettings()}>
            <Text style={styles.ctaText}>Open Settings</Text>
          </Pressable>
        )}
        {phase === "error" && (
          <Pressable testID="voice-retry-button" style={styles.cta} onPress={start}>
            <Text style={styles.ctaText}>Try again</Text>
          </Pressable>
        )}
        {phase === "listening" && <Text style={styles.hint}>Tap to finish</Text>}
        <Pressable testID="voice-cancel-button" onPress={close} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8, paddingHorizontal: spacing.xl, paddingTop: spacing.md, alignItems: "center" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: "900", color: c.onSurface, textAlign: "center" },
  sub: { fontSize: 15, color: c.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 21 },
  micWrap: { width: 160, height: 160, alignItems: "center", justifyContent: "center", marginVertical: spacing.xl },
  ring: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandSecondary },
  mic: { width: 112, height: 112, borderRadius: 56, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderBottomWidth: 5, borderBottomColor: c.onBrandTertiary },
  cta: { height: 52, alignSelf: "stretch", borderRadius: radius.pill, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  ctaText: { color: c.onSurfaceInverse, fontWeight: "800", fontSize: 16 },
  hint: { color: c.muted, fontWeight: "700" },
  cancel: { height: 48, justifyContent: "center", paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  cancelText: { color: c.onSurfaceTertiary, fontWeight: "800", fontSize: 15 },
}));
