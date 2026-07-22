import { useSyncExternalStore } from "react";
import { subscribeTheme } from "./theme";

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeTheme, isDark);
}
