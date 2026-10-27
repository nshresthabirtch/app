import { Platform } from "react-native";
import * as Calendar from "expo-calendar";
import type { Trip } from "./api";

const MEAL_TIMES = { breakfast: [8, 30], lunch: [12, 30], dinner: [19, 0] } as const;
export const mealTimeLabel = { breakfast: "8:30 AM", lunch: "12:30 PM", dinner: "7:00 PM" } as const;

export function eventTimes(trip: Trip) {
  const [y, m, d] = trip.date.split("-").map(Number);
  const [h, min] = MEAL_TIMES[trip.meal];
  const start = new Date(y, m - 1, d, h, min);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return { start, end };
}

const title = (t: Trip) => `I'm Hungry: ${t.meal[0].toUpperCase()}${t.meal.slice(1)} in ${t.destination}`;

function notes(t: Trip) {
  const lines = t.options.map((o, i) => `${i + 1}. ${o.name} (${o.cuisine}, ${o.price}) - try the ${o.signature_dish}. ${o.address}`);
  return `${t.headline}\n\nYour picks:\n${lines.join("\n")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const gcal = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

export function googleCalendarUrl(t: Trip) {
  const { start, end } = eventTimes(t);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: title(t),
    dates: `${gcal(start)}/${gcal(end)}`,
    details: notes(t),
    location: t.options[0] ? `${t.options[0].name}, ${t.destination}` : t.destination,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export type CalendarResult = "added" | "denied" | "blocked" | "unsupported" | "failed";

export async function addToDeviceCalendar(t: Trip): Promise<CalendarResult> {
  if (Platform.OS === "web") return "unsupported";
  try {
    let perm = await Calendar.getCalendarPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Calendar.requestCalendarPermissionsAsync();
    if (!perm.granted) return perm.canAskAgain ? "denied" : "blocked";
    let calId: string | undefined;
    if (Platform.OS === "ios") {
      calId = (await Calendar.getDefaultCalendarAsync()).id;
    } else {
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = cals.filter((c) => c.allowsModifications);
      calId = (writable.find((c) => c.isPrimary) ?? writable[0])?.id;
    }
    if (!calId) return "failed";
    const { start, end } = eventTimes(t);
    await Calendar.createEventAsync(calId, {
      title: title(t),
      startDate: start,
      endDate: end,
      location: t.options[0] ? `${t.options[0].name}, ${t.destination}` : t.destination,
      notes: notes(t),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: [{ relativeOffset: -60 }],
    });
    return "added";
  } catch {
    return "failed";
  }
}
