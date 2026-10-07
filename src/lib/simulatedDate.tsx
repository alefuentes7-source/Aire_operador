import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// Herramienta de pruebas: permite "viajar en el tiempo" dentro de la app
// (qué equipos tocan este mes, qué cuenta como realizado y con qué fecha se
// cierra una revisión). Se guarda solo en este navegador (localStorage).
// OJO: las revisiones cerradas con fecha simulada SÍ se guardan en la base
// con esa fecha.

const STORAGE_KEY = "mantencion-aire-operador:simulated-date";

interface SimulatedDateState {
  simulatedDate: string | null; // "YYYY-MM-DD" o null si se usa la fecha real
  setSimulatedDate: (date: string | null) => void;
  getNow: () => Date;
}

const SimulatedDateContext = createContext<SimulatedDateState | null>(null);

function readStoredDate(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function SimulatedDateProvider({ children }: { children: ReactNode }) {
  const [simulatedDate, setSimulatedDateState] = useState<string | null>(() => readStoredDate());

  const setSimulatedDate = useCallback((date: string | null) => {
    setSimulatedDateState(date);
    try {
      if (date) localStorage.setItem(STORAGE_KEY, date);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage no disponible
    }
  }, []);

  // Con fecha simulada, el día queda fijo pero la hora sigue avanzando.
  const getNow = useCallback(
    () => (simulatedDate ? new Date(`${simulatedDate}T${new Date().toTimeString().slice(0, 8)}`) : new Date()),
    [simulatedDate]
  );

  return (
    <SimulatedDateContext.Provider value={{ simulatedDate, setSimulatedDate, getNow }}>
      {children}
    </SimulatedDateContext.Provider>
  );
}

export function useSimulatedDate() {
  const ctx = useContext(SimulatedDateContext);
  if (!ctx) throw new Error("useSimulatedDate debe usarse dentro de <SimulatedDateProvider>");
  return ctx;
}
