import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import CustomOrder from './pages/CustomOrder';
import OrderHistory from './pages/OrderHistory';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unsubscribe from './pages/Unsubscribe';
import Account from './pages/Account';
import OrderTracking from './pages/OrderTracking';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminOrders from './pages/admin/AdminOrders';
import AdminProducts from './pages/admin/AdminProducts';
import AdminCategories from './pages/admin/AdminCategories';
import AdminInventory from './pages/admin/AdminInventory';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminSuppliers from './pages/admin/AdminSuppliers';
import AdminPurchases from './pages/admin/AdminPurchases';
import AdminSales from './pages/admin/AdminSales';
import AdminExpenses from './pages/admin/AdminExpenses';
import AdminCoupons from './pages/admin/AdminCoupons';
import AdminReports from './pages/admin/AdminReports';
import AdminStaff from './pages/admin/AdminStaff';
import AdminWebsiteSettings from './pages/admin/AdminWebsiteSettings';
import AdminBusinessSettings from './pages/admin/AdminBusinessSettings';
import AdminCommunications from './pages/admin/AdminCommunications';
import AdminMarketing from './pages/admin/AdminMarketing';
import AdminSupport from './pages/admin/AdminSupport';
import CustomerService from './pages/CustomerService';
import { AuthProvider, useAuth } from './context/AuthContext';

const DEFAULT_CART: Record<string, number> = {
  kaju: 1,
  badam: 0,
  kishmish: 0,
  akhrot: 0,
  pista: 0,
  kesar: 0,
};

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
  const { products } = useAuth();

  const [cartItems, setCartItems] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('as_cart_items');
      return saved ? JSON.parse(saved) : DEFAULT_CART;
    } catch {
      return DEFAULT_CART;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('as_cart_items', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  // Legacy hash support (#catalog, #orders, #login, #custom-order)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (['catalog', 'custom-order', 'orders', 'login'].includes(hash) && location.pathname === '/') {
      navigate(`/${hash}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleRequestPurchase = (productId?: string) => {
    if (productId) {
      setCartItems(prev => ({
        ...prev,
        [productId]: Math.max(1, prev[productId] || 1),
      }));
    }
    navigate('/catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateQuantity = (cartKey: string, quantity: number) => {
    setCartItems(prev => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[cartKey];
      } else {
        next[cartKey] = quantity;
      }
      return next;
    });
  };

  const handleClearCart = () => {
    setCartItems({});
  };

  const handleReorder = (items: { productId: string; quantity: number; variantId?: string | null }[]) => {
    const newCart: Record<string, number> = {};
    items.forEach(it => {
      const key = it.variantId ? `${it.productId}::${it.variantId}` : it.productId;
      newCart[key] = it.quantity;
    });
    setCartItems(newCart);
  };

  const [openCartSignal, setOpenCartSignal] = useState(0);

  const handleOpenCart = () => {
    if (location.pathname === '/catalog') {
      setOpenCartSignal(s => s + 1);
    } else {
      navigate('/catalog?cart=open');
    }
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
      {!isAdminPath && <Navbar selectedCount={activeSelectedCount} onOpenCart={handleOpenCart} />}

      <main className="flex-grow">
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
                    openCartSignal={openCartSignal}
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
