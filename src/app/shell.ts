import { EXTENSION_PATHS, type ActiveTab } from "./router";

export const ROOT_ID = "atcoder-problemset-extension-root";

export function detectUsername(doc: Document = document): string {
  const configured = doc.documentElement.dataset.acpsUsername;
  if (configured) return configured;
  const nav = doc.querySelector("#navbar-collapse, .navbar, header") ?? doc;
  const href = nav.querySelector<HTMLAnchorElement>('a[href^="/users/"]')?.getAttribute("href") ?? "";
  return href.match(/^\/users\/([^/?#]+)/)?.[1] ?? "";
}

export function findMainContainer(doc: Document = document): HTMLElement {
  const standalone = doc.querySelector<HTMLElement>("[data-acps-standalone-main]");
  if (standalone) return standalone;
  const containers = Array.from(doc.querySelectorAll<HTMLElement>(".container, .container-fluid"));
  return containers.find((container) => !container.closest("nav, .navbar, header")) ?? doc.body;
}

export function createRoot(doc: Document = document): HTMLElement {
  const root = doc.createElement("section");
  root.id = ROOT_ID;
  root.className = "acps-root";
  root.hidden = !doc.documentElement.hasAttribute("data-acps-standalone");
  root.innerHTML = `<div class="acps-panel" data-acps-content></div>`;
  return root;
}

export function injectNavItems(doc: Document = document): void {
  const navList = doc.querySelector<HTMLUListElement>("#navbar-collapse .navbar-nav:first-child, .navbar .navbar-nav:first-child");
  if (!navList || doc.querySelector("[data-acps-tab]")) return;
  const labels: Record<ActiveTab, string> = {
    problemset: "Problemset",
    stats: "Stats",
    training: "Training",
    progress: "Progress",
    settings: "Settings"
  };
  const tabs = (Object.keys(EXTENSION_PATHS) as ActiveTab[])
    .filter((tab) => tab !== "settings" || doc.documentElement.hasAttribute("data-acps-standalone"));
  for (const tab of tabs) {
    const item = doc.createElement("li");
    item.innerHTML = `<a href="${EXTENSION_PATHS[tab]}" data-acps-tab="${tab}">${labels[tab]}</a>`;
    navList.append(item);
  }
}
