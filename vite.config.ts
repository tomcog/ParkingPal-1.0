import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

const DEFAULT_PORT = 5173;

function resolvePort(): number {
  try {
    const portsPath = path.resolve(__dirname, "../ports.json");
    const ports = JSON.parse(fs.readFileSync(portsPath, "utf-8")) as Record<string, number>;
    return ports.ParkingPal ?? DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ParkingPal",
        short_name: "ParkingPal",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: resolvePort(),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
