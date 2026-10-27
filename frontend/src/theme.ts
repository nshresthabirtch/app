// Design tokens for I'm Hungry (light theme, from /app/design_guidelines.json).
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFBF7",
  onSurface: "#2C2622",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2C2622",
  surfaceTertiary: "#F2E8E0",
  onSurfaceTertiary: "#4A423C",
  surfaceInverse: "#2C2622",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8C7F77",

  brand: "#F25C54",
  onBrand: "#FFFFFF",
  brandPrimary: "#F25C54",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#F7B267",
  onBrandSecondary: "#2C2622",
  brandTertiary: "#FBE6D8",
  onBrandTertiary: "#D1453F",

  success: "#3E7D44",
  onSuccess: "#FFFFFF",
  warning: "#F7B267",
  onWarning: "#2C2622",
  error: "#D1453F",
  onError: "#FFFFFF",
  info: "#78A1BB",
  onInfo: "#FFFFFF",

  border: "#E8DED6",
  borderStrong: "#D6C7BC",
  divider: "#E8DED6",
  scrim: "rgba(44,38,34,0.45)",
};

export type ThemeColors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
