import { createContext, useContext, useState, type ReactNode } from "react";

interface AlertBgContextType {
  alertBg: boolean;
  setAlertBg: (v: boolean) => void;
}

const AlertBgContext = createContext<AlertBgContextType>({
  alertBg: false,
  setAlertBg: () => {},
});

export function AlertBgProvider({ children }: { children: ReactNode }) {
  const [alertBg, setAlertBg] = useState(false);
  return (
    <AlertBgContext.Provider value={{ alertBg, setAlertBg }}>
      {children}
    </AlertBgContext.Provider>
  );
}

export function useAlertBg() {
  return useContext(AlertBgContext);
}
