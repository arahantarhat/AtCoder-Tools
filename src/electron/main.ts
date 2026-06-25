import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { app, session, shell, type Tray, type Session } from "electron";
import { hasStoredTrainingForUser, isValidAtCoderUsername } from "./account-policy";
import { DataService } from "./data-service";
import { JsonStore } from "./json-store";
import { detectAuthenticatedUsername, showLoginWindow } from "./login-window";
import { startLocalServer, type DesktopStatus } from "./local-server";
import { createDashboardTray } from "./tray-menu";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let server: Awaited<ReturnType<typeof startLocalServer>> | null = null;
let tray: Tray | null = null;
let authenticatedUsername = "";
let activeUsername = "";
const token = randomBytes(32).toString("hex");

app.setName("AtCoder Dashboard");

app.on("second-instance", () => void openDashboard());
app.on("activate", () => void openDashboard());
app.on("window-all-closed", () => {
  // The dashboard lives in the user's browser; keep the launcher and server alive.
});
app.on("before-quit", () => {
  void server?.close();
});

void app.whenReady().then(async () => {
  const store = new JsonStore(join(app.getPath("userData"), "dashboard-data.json"));
  const authSession = session.fromPartition("persist:atcoder-dashboard");
  activeUsername = String((await store.get("desktop:active-username"))["desktop:active-username"] ?? "");
  authenticatedUsername = await detectAuthenticatedUsername(authSession);
  if (authenticatedUsername && !activeUsername) {
    activeUsername = authenticatedUsername;
    await store.set({ "desktop:active-username": activeUsername });
  }

  const acceptAuthenticatedUsername = async (username: string): Promise<boolean> => {
    if (!username) return false;
    if (activeUsername && activeUsername !== username) {
      const data = await store.get(null);
      if (hasStoredTrainingForUser(data, activeUsername)) return false;
    }
    authenticatedUsername = username;
    activeUsername = username;
    await store.set({ "desktop:active-username": username, "desktop:onboarding-complete": true });
    return true;
  };
  const dataService = new DataService(
    store,
    authSession,
    () => authenticatedUsername,
    () => {
      authenticatedUsername = "";
      void showLoginWindow(authSession).then(async (username) => {
        if (username) await acceptAuthenticatedUsername(username);
      });
    }
  );
  server = await startLocalServer({
    assetDir: join(app.getAppPath(), "dist-web"),
    token,
    store,
    dataService,
    actions: {
      status: () => Promise.resolve(status()),
      login: async () => {
        const username = await showLoginWindow(authSession);
        if (username && !await acceptAuthenticatedUsername(username)) {
          throw new Error("Export or reset the current account's training history before switching accounts.");
        }
        return status();
      },
      logout: async () => {
        await authSession.clearStorageData({ origin: "https://atcoder.jp", storages: ["cookies"] });
        authenticatedUsername = "";
        return status();
      },
      setUsername: async (username) => {
        if (!isValidAtCoderUsername(username)) throw new Error("Enter a valid AtCoder username.");
        activeUsername = username;
        await store.set({ "desktop:active-username": username, "desktop:onboarding-complete": true });
        return status();
      },
      resetAccount: async () => {
        if (activeUsername) {
          await store.clearMatching((key) => key.startsWith(`atcoder-problemset:training:${activeUsername}:`));
        }
        activeUsername = "";
        authenticatedUsername = "";
        await authSession.clearStorageData({ origin: "https://atcoder.jp", storages: ["cookies"] });
        await store.remove("desktop:active-username");
        return status();
      }
    }
  });

  tray = createDashboardTray({
    authSession,
    openDashboard: () => void openDashboard(),
    refreshLogin: async (authSessionForMenu) => {
      const username = await showLoginWindow(authSessionForMenu);
      if (username) await acceptAuthenticatedUsername(username);
    }
  });
  const onboarded = Boolean((await store.get("desktop:onboarding-complete"))["desktop:onboarding-complete"]);
  if (!onboarded && !authenticatedUsername) {
    const username = await showLoginWindow(authSession);
    await store.set({ "desktop:onboarding-complete": true });
    if (username) {
      await acceptAuthenticatedUsername(username);
    }
  }
  await openDashboard(activeUsername ? "/problemset" : "/settings");

  function status(): DesktopStatus {
    return {
      username: activeUsername,
      authenticated: authenticatedUsername === activeUsername && Boolean(activeUsername),
      authMode: authenticatedUsername === activeUsername && activeUsername ? "atcoder" : "public",
      serverUrl: server?.url ?? "",
      version: app.getVersion()
    };
  }
});

async function openDashboard(path = "/problemset"): Promise<void> {
  if (!server) return;
  await shell.openExternal(`${server.url}${path}#token=${token}`);
}
