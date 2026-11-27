import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import CartDrawer from './components/CartDrawer';
import Footer from './components/Footer';
import Home from './pages/Home';
import { isSuratCity } from './data/products';
import { getProductPackOptions } from './utils/priceCalculator';
import { apiRequest } from './services/api';
import {
  CART_ITEMS_STORAGE_KEY,
  CART_TIMESTAMPS_STORAGE_KEY,
  getNextCartExpiryDelayMs,
  purgeExpiredCartItems,
  reconcileCartTimestamps,
} from './utils/cartExpiry';

function parseCartKey(cartKey: string): { productId: string; variantId: string | null } {
  const sepIdx = cartKey.indexOf('::');
  if (sepIdx === -1) {
    return { productId: cartKey, variantId: null };
  }
  return {
    productId: cartKey.slice(0, sepIdx),
    variantId: cartKey.slice(sepIdx + 2) || null,
  };
}

// Route-level code splitting: secondary storefront pages
const Catalog = lazy(() => import('./pages/Catalog'));
const CustomOrder = lazy(() => import('./pages/CustomOrder'));
const OrderHistory = lazy(() => import('./pages/OrderHistory'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const Account = lazy(() => import('./pages/Account'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const CustomerService = lazy(() => import('./pages/CustomerService'));

// Route-level code splitting: Admin pages (avoids bundling recharts, exceljs, pdf viewer into storefront)
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminOrderLocations = lazy(() => import('./pages/admin/AdminOrderLocations'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminAbandonedCarts = lazy(() => import('./pages/admin/AdminAbandonedCarts'));
const AdminCustomerSegments = lazy(() => import('./pages/admin/AdminCustomerSegments'));
const AdminSuppliers = lazy(() => import('./pages/admin/AdminSuppliers'));
const AdminPurchases = lazy(() => import('./pages/admin/AdminPurchases'));
const AdminSales = lazy(() => import('./pages/admin/AdminSales'));
const AdminExpenses = lazy(() => import('./pages/admin/AdminExpenses'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const AdminWebsiteSettings = lazy(() => import('./pages/admin/AdminWebsiteSettings'));
const AdminBusinessSettings = lazy(() => import('./pages/admin/AdminBusinessSettings'));
const AdminCommunications = lazy(() => import('./pages/admin/AdminCommunications'));
const AdminMarketing = lazy(() => import('./pages/admin/AdminMarketing'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
import { AuthProvider, useAuth } from './context/AuthContext';

function RouteLoadingFallback({ isAdmin }: { isAdmin: boolean }) {
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8F6F0] text-[#183D32] flex items-center justify-center text-sm font-medium">
        Loading Admin Module...
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#0d0805] text-[#dfc471] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-[#dfc471] border-t-transparent animate-spin" />
      <span className="text-xs uppercase tracking-[0.2em] font-sans text-[#d5c4b4]">Loading...</span>
    </div>
  );
}

const DEFAULT_CART: Record<string, number> = {};

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-36 text-center text-sm">
        Verifying session...
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}

function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const port = typeof window !== 'undefined' ? window.location.port : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-36 text-center text-sm">
        Verifying session...
      </div>
    );
  }
  if (user) {
    const adminAllowedHere = user.role === 'admin' && port !== '3000';
    return <Navigate to={adminAllowedHere ? '/admin/dashboard' : '/account'} replace />;
  }
  return <>{children}</>;
}

function AdminRoute({
  children,
  permission,
  superAdminOnly,
}: {
  children: ReactNode;
  permission?: string;
  superAdminOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F6F0] text-[#183D32] pt-36 text-center text-sm font-medium">
        Verifying administrator access...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }
  if (user.role !== 'admin' || user.isActive === false) {
    return <Navigate to="/account" replace />;
  }

  const isSuper = user.adminRole === 'super_admin' || !user.adminRole;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];

  if (!isSuper && (superAdminOnly || (permission && !perms.includes(permission)))) {
    const fallbackMap: Record<string, string> = {
      dashboard: '/admin/dashboard',
      orders: '/admin/orders',
      products: '/admin/products',
      categories: '/admin/categories',
      inventory: '/admin/inventory',
      customers: '/admin/customers',
      suppliers: '/admin/suppliers',
      purchases: '/admin/purchases',
      sales: '/admin/sales',
      expenses: '/admin/expenses',
      coupons: '/admin/coupons',
      marketing: '/admin/marketing',
      communications: '/admin/communications',
      support: '/admin/support',
      reports: '/admin/reports',
      settings: '/admin/settings/business',
    };
    const firstPerm = perms[0];
    const target = firstPerm ? fallbackMap[firstPerm] : '';
    if (target && !superAdminOnly && location.pathname !== target) {
      return <Navigate to={target} replace />;
    }
    return (
      <div className="min-h-screen bg-[#F8F6F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E9E4D9] rounded-2xl p-8 text-center space-y-3 shadow-sm">
          <h1 className="font-admin-serif text-2xl font-semibold text-[#183D32]">Access Restricted</h1>
          <p className="text-xs text-[#5C6058]">
            Your staff account does not have permission to access this module. Contact a Super Admin to update permissions.
          </p>
          {target && (
            <Link
              to={target}
              className="inline-block px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold"
            >
              Return to Workspace
            </Link>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { products, user, isSurat } = useAuth();
  const isSuratUser = Boolean(user && (isSurat || isSuratCity(user?.shippingAddress?.city)));

  const autoExpiredClearRef = useRef(false);

  const [cartState, setCartState] = useState<{
    items: Record<string, number>;
    timestamps: Record<string, number>;
  }>(() => {
    try {
      const savedItemsRaw = localStorage.getItem(CART_ITEMS_STORAGE_KEY);
      const savedItems: Record<string, number> = savedItemsRaw ? JSON.parse(savedItemsRaw) : DEFAULT_CART;
      const savedTsRaw = localStorage.getItem(CART_TIMESTAMPS_STORAGE_KEY);
      const savedTs: Record<string, number> = savedTsRaw ? JSON.parse(savedTsRaw) : {};
      const { activeItems, activeTimestamps, expiredKeys } = purgeExpiredCartItems(savedItems, savedTs);
      if (expiredKeys.length > 0 && Object.keys(activeItems).length === 0) {
        autoExpiredClearRef.current = true;
      }
      localStorage.setItem(CART_ITEMS_STORAGE_KEY, JSON.stringify(activeItems));
      localStorage.setItem(CART_TIMESTAMPS_STORAGE_KEY, JSON.stringify(activeTimestamps));
      return { items: activeItems, timestamps: activeTimestamps };
    } catch {
      return { items: DEFAULT_CART, timestamps: {} };
    }
  });

  const cartItems = cartState.items;
  const cartTimestamps = cartState.timestamps;

  const setCartItems = (
    updater:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>),
    options?: { resetTimestamps?: boolean; clearReason?: 'user_cleared' | 'item_expired' }
  ) => {
    setCartState(prev => {
      const nextItems = typeof updater === 'function' ? updater(prev.items) : updater;
      const now = Date.now();
      const nextTimestamps = options?.resetTimestamps
        ? reconcileCartTimestamps(nextItems, {}, now)
        : reconcileCartTimestamps(nextItems, prev.timestamps, now);
      if (Object.keys(nextItems).length === 0 && options?.clearReason === 'item_expired') {
        autoExpiredClearRef.current = true;
      } else if (Object.keys(nextItems).length === 0) {
        autoExpiredClearRef.current = false;
      }
      return { items: nextItems, timestamps: nextTimestamps };
    });
  };

  // Reconcile active cart for Surat patrons against live variant inventory
  useEffect(() => {
    if (!isSuratUser || !products || products.length === 0) return;
    setCartItems(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [cartKey, qty] of Object.entries(next)) {
        const { productId, variantId } = parseCartKey(cartKey);
        const prod = products.find(p => p.id === productId);
        if (!prod) continue;
        const packs = getProductPackOptions(prod);
        const pack = variantId ? packs.find(v => v.id === variantId) : null;
        const maxStock = pack && typeof pack.stock === 'number'
          ? pack.stock
          : (typeof prod.stock === 'number' ? prod.stock : 999);

        if (maxStock <= 0) {
          delete next[cartKey];
          changed = true;
        } else if (qty > maxStock) {
          next[cartKey] = maxStock;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isSuratUser, products]);

  // Persist cart items and addedAt timestamps locally
  useEffect(() => {
    try {
      localStorage.setItem(CART_ITEMS_STORAGE_KEY, JSON.stringify(cartItems));
      localStorage.setItem(CART_TIMESTAMPS_STORAGE_KEY, JSON.stringify(cartTimestamps));
    } catch {}
  }, [cartItems, cartTimestamps]);

  // Automatically remove any cart item kept >= 1 hour without ordering
  useEffect(() => {
    const evictExpired = () => {
      setCartState(prev => {
        const { activeItems, activeTimestamps, expiredKeys } = purgeExpiredCartItems(
          prev.items,
          prev.timestamps
        );
        if (expiredKeys.length === 0) return prev;
        if (Object.keys(activeItems).length === 0) {
          autoExpiredClearRef.current = true;
        }
        return { items: activeItems, timestamps: activeTimestamps };
      });
    };

    const delayMs = getNextCartExpiryDelayMs(cartItems, cartTimestamps);
    const timer = delayMs !== null ? setTimeout(evictExpired, Math.min(delayMs, 2147483647)) : null;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') evictExpired();
    };
    window.addEventListener('focus', evictExpired);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', evictExpired);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cartItems, cartTimestamps]);

  // Background cart synchronization for Abandoned Cart Tracker (non-admin storefront sessions)
  useEffect(() => {
    if (user?.role === 'admin') return;
    let visitorToken = '';
    try {
      visitorToken = localStorage.getItem('as_cart_visitor_token') || '';
      if (!visitorToken) {
        visitorToken = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem('as_cart_visitor_token', visitorToken);
      }
    } catch {
      return;
    }

    const entries = Object.entries(cartItems).filter(([, qty]) => Number(qty) > 0);
    if (
      !user &&
      entries.length === 0 &&
      !autoExpiredClearRef.current &&
      !sessionStorage.getItem('as_cart_synced_once')
    ) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem('as_cart_synced_once', '1');
      } catch {}
      const clearReason =
        entries.length === 0 && autoExpiredClearRef.current ? 'item_expired' : undefined;
      if (clearReason) autoExpiredClearRef.current = false;

      void apiRequest('/api/cart/sync', {
        method: 'POST',
        body: {
          visitorToken,
          clearReason,
          items: entries.map(([cartKey, quantity]) => {
            const { productId, variantId } = parseCartKey(cartKey);
            return { productId, variantId, quantity };
          }),
        },
      }).catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [cartItems, user?.id, user?.role]);

  // Legacy hash support (#catalog, #orders, #login, #custom-order)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (['catalog', 'custom-order', 'orders', 'login'].includes(hash) && location.pathname === '/') {
      navigate(`/${hash}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleRequestPurchase = (productId?: string) => {
    if (productId) {
      setCartItems(prev => {
        let qty = Math.max(1, prev[productId] || 1);
        if (isSuratUser) {
          const prod = products.find(p => p.id === productId);
          if (prod) {
            const maxStock = typeof prod.stock === 'number' ? prod.stock : 999;
            if (maxStock <= 0) return prev;
            if (qty > maxStock) qty = maxStock;
          }
        }
        return {
          ...prev,
          [productId]: qty,
        };
      });
    }
    navigate('/catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateQuantity = (cartKey: string, quantity: number) => {
    setCartItems(prev => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[cartKey];
        return next;
      }

      let finalQty = quantity;
      // Strictly enforce packet inventory limit only for customers from Surat
      if (isSuratUser) {
        const { productId, variantId } = parseCartKey(cartKey);
        const prod = products.find(p => p.id === productId);
        if (prod) {
          const packs = getProductPackOptions(prod);
          const pack = variantId ? packs.find(v => v.id === variantId) : null;
          const maxStock = pack && typeof pack.stock === 'number'
            ? pack.stock
            : (typeof prod.stock === 'number' ? prod.stock : 999);

          if (maxStock <= 0) {
            delete next[cartKey];
            return next;
          }
          if (finalQty > maxStock) {
            finalQty = maxStock;
          }
        }
      }

      next[cartKey] = finalQty;
      return next;
    });
  };

  const handleClearCart = () => {
    setCartItems({}, { resetTimestamps: true, clearReason: 'user_cleared' });
  };

  const handleReorder = (items: { productId: string; quantity: number; variantId?: string | null }[]) => {
    const newCart: Record<string, number> = {};
    items.forEach(it => {
      const key = it.variantId ? `${it.productId}::${it.variantId}` : it.productId;
      newCart[key] = it.quantity;
    });
    setCartItems(newCart, { resetTimestamps: true });
  };

  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('cart') === 'open') {
      setIsCartOpen(true);
      params.delete('cart');
      const nextSearch = params.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate]);

  const handleOpenCart = () => {
    setIsCartOpen(true);
  };

  const activeSelectedCount = Object.entries(cartItems).filter(([key, qty]) => {
    if (qty <= 0) return false;
    if (products.length === 0) return true;
    const sepIdx = key.indexOf('::');
    const productId = sepIdx === -1 ? key : key.slice(0, sepIdx);
    return products.some(p => p.id === productId);
  }).length;
  const currentPort = typeof window !== 'undefined' ? window.location.port : '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isDedicatedAdminOrigin = currentPort === '8000' || currentHost.startsWith('admin.');
  const isDedicatedStorefrontOrigin = currentPort === '3000';
  const isAdminPath = location.pathname.startsWith('/admin') || isDedicatedAdminOrigin;

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] flex flex-col font-sans selection:bg-[#dfc471] selection:text-[#0d0805]">
      {!isAdminPath && (
        <>
          <Navbar selectedCount={activeSelectedCount} onOpenCart={handleOpenCart} />
          <CartDrawer
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            cartItems={cartItems}
            products={products}
            onUpdateQuantity={handleUpdateQuantity}
            onClearCart={handleClearCart}
          />
        </>
      )}

      <main className="flex-grow">
        <Suspense fallback={<RouteLoadingFallback isAdmin={isAdminPath} />}>
          <Routes>
          {isDedicatedAdminOrigin ? (
            <>
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
            </>
          ) : (
            <>
              <Route
                path="/"
                element={
                  <Home
                    onNavigateToRequest={handleRequestPurchase}
                    onNavigateToCatalog={() => navigate('/catalog')}
                  />
                }
              />
              <Route
                path="/catalog"
                element={
                  <Catalog
                    cartItems={cartItems}
                    onUpdateQuantity={handleUpdateQuantity}
                    onClearCart={handleClearCart}
                    openCartSignal={isCartOpen ? 1 : 0}
                    onOpenCart={handleOpenCart}
                  />
                }
              />
              <Route path="/custom-order" element={<CustomOrder />} />
              <Route path="/customer-service" element={<CustomerService />} />
              <Route path="/orders" element={<OrderHistory onReorder={handleReorder} />} />

              {/* Customer Auth & Verification (block login/register while already logged in) */}
              <Route
                path="/register"
                element={
                  <GuestOnlyRoute>
                    <Register />
                  </GuestOnlyRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <GuestOnlyRoute>
                    <Login />
                  </GuestOnlyRoute>
                }
              />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route
                path="/forgot-password"
                element={
                  <GuestOnlyRoute>
                    <ForgotPassword />
                  </GuestOnlyRoute>
                }
              />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />

              {/* Customer Account Dashboard & Order Tracking */}
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <Account onReorder={handleReorder} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account/orders/:orderId"
                element={
                  <ProtectedRoute>
                    <OrderTracking />
                  </ProtectedRoute>
                }
              />
            </>
          )}

          {/* Admin Portal (Port 8000; disabled on Port 3000 storefront) */}
          {isDedicatedStorefrontOrigin ? (
            <>
              <Route path="/admin" element={<Navigate to="/" replace />} />
              <Route path="/admin/*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route
                path="/admin/dashboard"
                element={
                  <AdminRoute permission="dashboard">
                    <AdminDashboard />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/orders"
                element={
                  <AdminRoute permission="orders">
                    <AdminOrders />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/order-locations"
                element={
                  <AdminRoute permission="orders">
                    <AdminOrderLocations />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/products"
                element={
                  <AdminRoute permission="products">
                    <AdminProducts />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <AdminRoute permission="categories">
                    <AdminCategories />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/inventory"
                element={
                  <AdminRoute permission="inventory">
                    <AdminInventory />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/customers"
                element={
                  <AdminRoute permission="customers">
                    <AdminCustomers />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/abandoned-carts"
                element={
                  <AdminRoute permission="customers">
                    <AdminAbandonedCarts />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/customer-segments"
                element={
                  <AdminRoute permission="customers">
                    <AdminCustomerSegments />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/suppliers"
                element={
                  <AdminRoute permission="suppliers">
                    <AdminSuppliers />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/purchases"
                element={
                  <AdminRoute permission="purchases">
                    <AdminPurchases />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/sales"
                element={
                  <AdminRoute permission="sales">
                    <AdminSales />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/expenses"
                element={
                  <AdminRoute permission="expenses">
                    <AdminExpenses />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/coupons"
                element={
                  <AdminRoute permission="coupons">
                    <AdminCoupons />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <AdminRoute permission="reports">
                    <AdminReports />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/communications"
                element={
                  <AdminRoute permission="communications">
                    <AdminCommunications />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/support"
                element={
                  <AdminRoute permission="support">
                    <AdminSupport />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/marketing"
                element={
                  <AdminRoute permission="marketing">
                    <AdminMarketing />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/staff"
                element={
                  <AdminRoute superAdminOnly>
                    <AdminStaff />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings/website"
                element={
                  <AdminRoute permission="settings">
                    <AdminWebsiteSettings />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings/business"
                element={
                  <AdminRoute permission="settings">
                    <AdminBusinessSettings />
                  </AdminRoute>
                }
              />
            </>
          )}

          <Route
            path="*"
            element={<Navigate to={isDedicatedAdminOrigin ? '/admin/dashboard' : '/'} replace />}
          />
        </Routes>
      </Suspense>
    </main>

      {!isAdminPath && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
