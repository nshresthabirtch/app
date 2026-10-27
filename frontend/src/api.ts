import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Restaurant = {
  name: string;
  cuisine: string;
  price: string;
  distance: string;
  signature_dish: string;
  why: string;
  address: string;
  rating: number;
};
export type Meal = "breakfast" | "lunch" | "dinner";
export type Trip = {
  id: string;
  destination: string;
  date: string;
  meal: Meal;
  craving: string;
  headline: string;
  options: Restaurant[];
};
export type Favorite = { id: string; restaurant: Restaurant; craving: string; place: string };
export type CravingItem = { id: string; text: string; craving: string; place: string; created_at: string };
export type HungryResult =
  | { intent: "eat_now"; craving: string; headline: string; options: Restaurant[] }
  | { intent: "trip"; trip: Trip };

export type Poll = {
  id: string;
  title: string;
  craving: string;
  place: string;
  options: Restaurant[];
  votes: { voter_id: string; name: string; choice: number }[];
  counts: number[];
  total: number;
  winner: number | null;
  closed: boolean;
};
export const pollLink = (id: string) => `${API}/polls/${id}/page`;

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail ?? "Something went wrong");
  return data as T;
}

export const todayISO = () => format(new Date(), "yyyy-MM-dd");

export function haptic(kind: "light" | "medium" | "success" = "light") {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const mapsUrl = (r: Restaurant, near?: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address || near || ""}`)}`;
