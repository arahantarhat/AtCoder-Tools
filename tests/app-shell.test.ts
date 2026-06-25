// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { EXTENSION_PATHS, getTabFromPath, isActiveTab } from "../src/app/router";
import { createRoot, detectUsername, findMainContainer, injectNavItems, ROOT_ID } from "../src/app/shell";

describe("application shell", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav id="navbar-collapse"><ul class="navbar-nav"><li><a href="/">Home</a></li></ul><a href="/users/tourist">tourist</a></nav>
      <main class="container"><p>AtCoder content</p></main>
    `;
  });

  it("detects the signed-in user and injects one navigation item per feature", () => {
    expect(detectUsername()).toBe("tourist");
    injectNavItems();
    injectNavItems();
    const tabs = [...document.querySelectorAll<HTMLElement>("[data-acps-tab]")];
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.dataset.acpsTab)).toEqual(["problemset", "stats", "training", "progress"]);
  });

  it("creates the isolated extension root in the host content container", () => {
    const container = findMainContainer();
    const root = createRoot();
    container.append(root);
    expect(document.getElementById(ROOT_ID)).toBe(root);
    expect(root.querySelector("[data-acps-content]")).not.toBeNull();
    expect(root.hidden).toBe(true);
  });
});

describe("routing", () => {
  it("maps only extension paths to tabs", () => {
    expect(getTabFromPath(EXTENSION_PATHS.problemset)).toBe("problemset");
    expect(getTabFromPath("/contests/abc100")).toBeNull();
    expect(isActiveTab("progress")).toBe(true);
    expect(isActiveTab("settings")).toBe(true);
  });
});
