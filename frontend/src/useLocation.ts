import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";

type Status = "checking" | "idle" | "granted" | "denied" | "blocked";

export function useLocation() {
  const [status, setStatus] = useState<Status>("checking");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      try {
        const [g] = await Location.reverseGeocodeAsync(pos.coords);
        if (g) setPlace([g.district || g.subregion, g.city, g.region].filter(Boolean).slice(0, 2).join(", ") || null);
      } catch {
        // reverse geocode is optional
      }
    } catch {
      // position unavailable; keep going without it
    }
  }, []);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (p.granted) {
          setStatus("granted");
          load();
        } else setStatus(p.canAskAgain ? (p.status === "denied" ? "denied" : "idle") : "blocked");
      })
      .catch(() => setStatus("idle"));
  }, [load]);

  const request = useCallback(async () => {
    if (status === "blocked") return Linking.openSettings();
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) {
      setStatus("granted");
      await load();
    } else setStatus(p.canAskAgain ? "denied" : "blocked");
  }, [status, load]);

  return { status, coords, place, request };
}
