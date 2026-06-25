import { Buffer } from "node:buffer";
import { Menu, nativeImage, Tray, type Session } from "electron";

export function createDashboardTray(options: {
  authSession: Session;
  openDashboard(): void;
  refreshLogin(authSession: Session): Promise<void>;
}): Tray {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect width="18" height="18" rx="4" fill="#337ab7"/><text x="9" y="13" text-anchor="middle" font-family="Arial" font-size="10" fill="white">AC</text></svg>`;
  const tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`));
  tray.setToolTip("AtCoder Dashboard");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Dashboard", click: () => options.openDashboard() },
    {
      label: "Log In / Refresh Session",
      click: () => {
        void options.refreshLogin(options.authSession);
      }
    },
    { type: "separator" },
    { label: "Quit", role: "quit" }
  ]));
  tray.on("click", () => options.openDashboard());
  return tray;
}
