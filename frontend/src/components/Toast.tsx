import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing } from "@/src/theme";

type Kind = "info" | "success" | "error";
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const show = useCallback((msg: string, kind: Kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && (
          <Animated.View
            key={toast.key}
            entering={FadeInUp}
            exiting={FadeOutUp}
            pointerEvents="none"
            style={[styles.toast, { top: insets.top + spacing.sm }, toast.kind === "success" && styles.success, toast.kind === "error" && styles.error]}
            testID="toast"
          >
            <Text style={styles.text} testID="toast-message">{toast.msg}</Text>
          </Animated.View>
        )}
      </View>
    </Ctx.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: c.surfaceInverse,
    borderRadius: radius.md,
    padding: spacing.lg,
    shadowColor: c.onSurface,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  success: { backgroundColor: c.success },
  error: { backgroundColor: c.error },
  text: { color: c.onSurfaceInverse, fontSize: 15, fontWeight: "700" },
}));
