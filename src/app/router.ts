export type ActiveTab = "problemset" | "stats" | "training" | "progress" | "settings";

export const EXTENSION_PATHS: Record<ActiveTab, string> = {
  problemset: "/problemset",
  stats: "/stats",
  training: "/training",
  progress: "/progress",
  settings: "/settings"
};

export function getTabFromPath(pathname: string): ActiveTab | null {
  const entry = Object.entries(EXTENSION_PATHS).find(([, path]) => path === pathname);
  return entry?.[0] as ActiveTab | undefined ?? null;
}

export function isActiveTab(value: unknown): value is ActiveTab {
  return value === "problemset" || value === "stats" || value === "training" || value === "progress" || value === "settings";
}
