import { Outlet, useNavigate } from "react-router";
import { useEffect } from "react";
import { History, Settings } from "lucide-react";
import { AlertBgProvider, useAlertBg } from "./alert-bg-context";

function LayoutInner() {
  const navigate = useNavigate();
  const { alertBg } = useAlertBg();

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      );
    }
  }, []);

  return (
    <div
      className="flex flex-col min-h-screen transition-colors duration-300"
      style={{ backgroundColor: alertBg ? "#AD291D" : undefined }}
    >
      <main className={`flex-1 overflow-y-auto ${!alertBg ? "bg-background" : ""}`}>
        <Outlet />
      </main>
      <header className="flex items-center justify-between px-6 py-4 bg-white shrink-0 border-t border-border">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2"
          aria-label="Parking Pal"
        >
          <img src="/pplogo.svg" alt="Parking Pal" className="h-8" />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/history")}
            className="p-1 rounded transition-colors hover:bg-accent"
            aria-label="History"
          >
            <History className="w-5 h-5 text-[#717182]" />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-1 rounded transition-colors hover:bg-accent"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 text-[#717182]" />
          </button>
        </div>
      </header>
    </div>
  );
}

export function Layout() {
  return (
    <AlertBgProvider>
      <LayoutInner />
    </AlertBgProvider>
  );
}
