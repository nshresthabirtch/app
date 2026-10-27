import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, haptic, Poll, Restaurant } from "@/src/api";
import { useToast } from "./Toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function StartVoteButton({ title, craving, place, options }: { title: string; craving: string; place: string; options: Restaurant[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api<Poll>("/polls", { method: "POST", body: { title, craving, place, options } }),
    onSuccess: (p) => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["polls"] });
      router.push(`/poll/${p.id}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <Pressable testID="start-group-vote-button" style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => create.mutate()} disabled={create.isPending || options.length < 2}>
      {create.isPending ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Icon name="account-group" size={22} color={colors.onBrandSecondary} />}
      <Text style={styles.text}>Can't decide? Start a group vote</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  btn: { height: 52, borderRadius: radius.pill, backgroundColor: c.brandSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg, borderBottomWidth: 4, borderBottomColor: c.warning },
  text: { color: c.onBrandSecondary, fontWeight: "900", fontSize: 16 },
}));
