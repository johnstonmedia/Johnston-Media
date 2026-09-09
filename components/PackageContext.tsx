"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PackageSelection {
  selectedId: string | null;
  select: (id: string | null) => void;
}

const PackageContext = createContext<PackageSelection | null>(null);

/**
 * Shares the chosen package between the package cards and the quote form.
 *
 * They sit far apart on the page with server-rendered sections in between,
 * so this wraps the whole page rather than a common ancestor element. The
 * page itself stays a server component — only the parts that need the
 * selection are client-side.
 */
export function PackageProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const value = useMemo(
    () => ({ selectedId, select }),
    [selectedId, select],
  );

  return (
    <PackageContext.Provider value={value}>{children}</PackageContext.Provider>
  );
}

/**
 * Returns the current selection, or a no-op when used outside a provider —
 * the quote form also appears on pages that have no packages.
 */
export function usePackageSelection(): PackageSelection {
  return (
    useContext(PackageContext) ?? { selectedId: null, select: () => undefined }
  );
}
