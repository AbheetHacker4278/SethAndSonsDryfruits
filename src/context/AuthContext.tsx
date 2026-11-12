import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PRODUCTS, type CatalogProduct } from '../data/products';
import {
  ApiError,
  apiRequest,
  AuthUser,
  fetchPublicCategories,
  fetchPublicSettings,
  fetchPublishedProducts,
  type PublicCategory,
  type PublicSettingsPayload,
} from '../services/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  googleOAuthEnabled: boolean;
  products: CatalogProduct[];
  categories: PublicCategory[];
  publicSettings: PublicSettingsPayload | null;
  refreshProducts: () => Promise<void>;
  refreshPublicSettings: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const RETRY_DELAYS_MS = [800, 1500, 2500];

function isTransientApiFailure(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 502 || err.status === 503 || err.status === 504;
  }
  return err instanceof TypeError;
}

async function withTransientRetry<T>(fn: () => Promise<T>, isCancelled?: () => boolean): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientApiFailure(err) || attempt >= RETRY_DELAYS_MS.length || isCancelled?.()) {
        throw err;
      }
      const waitMs = RETRY_DELAYS_MS[attempt++];
      await new Promise(resolve => setTimeout(resolve, waitMs));
      if (isCancelled?.()) throw err;
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>(PRODUCTS);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [publicSettings, setPublicSettings] = useState<PublicSettingsPayload | null>(null);

  const applyBrowserBranding = useCallback((settings: PublicSettingsPayload | null) => {
    if (typeof document === 'undefined' || !settings?.website) return;
    if (settings.website.brandName) {
      document.title = `${settings.website.brandName} — Sourced From Jammu`;
    }
    if (settings.website.faviconUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link && link.getAttribute('href') !== settings.website.faviconUrl) {
        link.href = settings.website.faviconUrl;
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await withTransientRetry(() =>
        apiRequest<{ user: AuthUser | null }>('/api/auth/me')
      );
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([
        withTransientRetry(() => fetchPublishedProducts()),
        withTransientRetry(() => fetchPublicCategories()).catch(() => []),
      ]);
      if (list.length > 0) setProducts(list);
      if (cats.length > 0) setCategories(cats);
    } catch {
      // retain static fallback if backend unreachable
    }
  }, []);

  const refreshPublicSettings = useCallback(async () => {
    try {
      const data = await withTransientRetry(() => fetchPublicSettings());
      setPublicSettings(data);
      applyBrowserBranding(data);
    } catch {
      // retain static fallback when offline
    }
  }, [applyBrowserBranding]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void withTransientRetry(() => apiRequest<{ user: AuthUser | null }>('/api/auth/me'), isCancelled)
      .then(data => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void withTransientRetry(() => fetchPublishedProducts(), isCancelled)
      .then(list => {
        if (!cancelled && list.length > 0) setProducts(list);
      })
      .catch(() => {
        // retain fallback catalog when offline
      });

    void withTransientRetry(() => fetchPublicCategories(), isCancelled)
      .then(cats => {
        if (!cancelled && cats.length > 0) setCategories(cats);
      })
      .catch(() => {
        // non-fatal; categories fallback derived from products
      });

    void withTransientRetry(() => fetchPublicSettings(), isCancelled)
      .then(data => {
        if (!cancelled) {
          setPublicSettings(data);
          applyBrowserBranding(data);
        }
      })
      .catch(() => {
        // retain default branding when offline
      });

    void withTransientRetry(
      () => apiRequest<{ googleOAuthEnabled: boolean }>('/api/auth/config'),
      isCancelled
    )
      .then(cfg => {
        if (!cancelled) setGoogleOAuthEnabled(Boolean(cfg.googleOAuthEnabled));
      })
      .catch(() => {
        if (!cancelled) setGoogleOAuthEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyBrowserBranding]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener('as:session-expired', onExpired);
    return () => window.removeEventListener('as:session-expired', onExpired);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear local session even if server request fails
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        googleOAuthEnabled,
        products,
        categories,
        publicSettings,
        refreshProducts,
        refreshPublicSettings,
        refreshUser,
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

