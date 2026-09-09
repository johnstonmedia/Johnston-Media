"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, message, type, visible: false }]);

    // Next frame: flip to visible so the CSS transition runs.
    requestAnimationFrame(() => {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: true } : t)),
      );
    });

    window.setTimeout(() => {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: false } : t)),
      );
      window.setTimeout(
        () => setItems((prev) => prev.filter((t) => t.id !== id)),
        300,
      );
    }, 4000);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="jm-toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`jm-toast jm-toast--${t.type}${
              t.visible ? " jm-toast--visible" : ""
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
