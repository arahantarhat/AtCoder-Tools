import { BrowserWindow, type Session } from "electron";

let loginWindow: BrowserWindow | null = null;

export async function showLoginWindow(authSession: Session): Promise<string> {
  if (loginWindow) {
    loginWindow.focus();
    return "";
  }
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (username: string) => {
      if (resolved) return;
      resolved = true;
      resolve(username);
      if (username && loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    };
    loginWindow = new BrowserWindow({
      width: 1050,
      height: 760,
      title: "Log in to AtCoder",
      webPreferences: {
        session: authSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    loginWindow.setMenuBarVisibility(false);
    loginWindow.webContents.on("did-navigate", () => void inspectLoginWindow(loginWindow).then(finish));
    loginWindow.webContents.on("did-navigate-in-page", () => void inspectLoginWindow(loginWindow).then(finish));
    loginWindow.on("closed", () => {
      loginWindow = null;
      finish("");
    });
    void loginWindow.loadURL("https://atcoder.jp/login");
  });
}

export async function detectAuthenticatedUsername(authSession: Session): Promise<string> {
  try {
    const response = await authSession.fetch("https://atcoder.jp/");
    if (!response.ok) return "";
    return (await response.text()).match(/href="\/users\/([^"/?#]+)"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function inspectLoginWindow(window: BrowserWindow | null): Promise<string> {
  if (!window || window.isDestroyed()) return "";
  try {
    return await window.webContents.executeJavaScript(`
      (() => {
        const href = document.querySelector('#navbar-collapse a[href^="/users/"], .navbar a[href^="/users/"]')?.getAttribute('href') || '';
        return href.match(/^\\/users\\/([^/?#]+)/)?.[1] || '';
      })()
    `) as string;
  } catch {
    return "";
  }
}
