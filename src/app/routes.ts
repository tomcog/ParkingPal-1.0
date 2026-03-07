import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";
import { HomePage } from "./components/home-page";
import { ScanPage } from "./components/scan-page";
import { HistoryPage } from "./components/history-page";
import { SettingsPage } from "./components/settings-page";
import { ColorsPage } from "./components/colors-page";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "scan", Component: ScanPage },
      { path: "history", Component: HistoryPage },
      { path: "settings", Component: SettingsPage },
      { path: "colors", Component: ColorsPage },
    ],
  },
]);
