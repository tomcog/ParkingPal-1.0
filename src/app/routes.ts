import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";
import { HomePage } from "./components/home-page";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      {
        path: "scan",
        lazy: async () => {
          const { ScanPage } = await import("./components/scan-page");
          return { Component: ScanPage };
        },
      },
      {
        path: "history",
        lazy: async () => {
          const { HistoryPage } = await import("./components/history-page");
          return { Component: HistoryPage };
        },
      },
      {
        path: "settings",
        lazy: async () => {
          const { SettingsPage } = await import("./components/settings-page");
          return { Component: SettingsPage };
        },
      },
    ],
  },
]);
