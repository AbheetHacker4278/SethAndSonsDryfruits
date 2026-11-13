import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Boxes,
  ShoppingBag,
  Users,
  Truck,
  ClipboardList,
  IndianRupee,
  Receipt,
  Ticket,
  BarChart3,
  UserCog,
  Globe,
  Building2,
  Mail,
  Megaphone,
  LogOut,
  Search,
  Bell,
  Menu,
  X,
  Plus,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

interface AdminNavItem {
  to: string;
  label: string;
  icon: any;
  perm?: string;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, perm: 'orders' },
  { to: '/admin/products', label: 'Products', icon: Package, perm: 'products' },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree, perm: 'categories' },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory' },
  { to: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers' },
  { to: '/admin/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers' },
  { to: '/admin/purchases', label: 'Purchases', icon: ClipboardList, perm: 'purchases' },
  { to: '/admin/sales', label: 'Sales & Revenue', icon: IndianRupee, perm: 'sales' },
  { to: '/admin/expenses', label: 'Expenses', icon: Receipt, perm: 'expenses' },
  { to: '/admin/coupons', label: 'Coupons & Discounts', icon: Ticket, perm: 'coupons' },
  { to: '/admin/marketing', label: 'Marketing', icon: Megaphone, perm: 'marketing' },
  { to: '/admin/communications', label: 'Communications', icon: Mail, perm: 'communications' },
  { to: '/admin/support', label: 'Customer Service', icon: LifeBuoy, perm: 'support' },
  { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3, perm: 'reports' },
  { to: '/admin/staff', label: 'Staff Management', icon: UserCog, superAdminOnly: true },
  { to: '/admin/settings/website', label: 'Website Settings', icon: Globe, perm: 'settings' },
  { to: '/admin/settings/business', label: 'Business Settings', icon: Building2, perm: 'settings' },
];

export default function AdminLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stockAlerts, setStockAlerts] = useState<{
    outOfStockCount: number;
    lowStockCount: number;
    outOfStockItems: Array<{ id: string; name: string; unit?: string; stock?: number }>;
  } | null>(null);

  const loadNotifications = async () => {
    try {
      const res = await apiRequest<{
        notifications: any[];
        unreadCount: number;
        stockAlerts?: {
          outOfStockCount: number;
          lowStockCount: number;
          outOfStockItems: Array<{ id: string; name: string; unit?: string; stock?: number }>;
        };
      }>('/api/admin/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
      setStockAlerts(res.stockAlerts || null);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [location.pathname]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest(`/api/admin/search?q=${encodeURIComponent(q)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/admin/notifications/read', { method: 'POST', body: {} });
      await loadNotifications();
    } catch {
      // non-fatal notification action
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const canSee = (item: AdminNavItem) => {
    if (!user) return false;
    if (!user.adminRole || user.adminRole === 'super_admin') return true;
    if (item.superAdminOnly) return false;
    if (!item.perm) return true;
    return (user.permissions || []).includes(item.perm);
  };

  const visibleNav = NAV_ITEMS.filter(canSee);
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const initials = (user?.name || 'AS')
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#183D32] text-[#F8F6F0] select-none">
      {/* Brand Logo & Title */}
      <div className="px-4 py-5 border-b border-[#245746] flex items-center justify-between gap-2">
        <Link to="/admin/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <img
            src="/assets/seth_and_sons_logo-96.webp"
            alt="Seth And Sons DryFruits"
            width="36"
            height="36"
            className="h-9 w-9 rounded-full object-cover shrink-0 border border-[#C8A96B]/45"
            loading="lazy"
            decoding="async"
          />
          {!collapsed && (
            <div className="leading-tight truncate">
              <div className="font-admin-serif text-sm font-semibold text-[#F8F6F0] truncate">
                Seth And Sons
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#C8A96B]">
                DryFruits ERP
              </div>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:inline-flex p-1.5 rounded-lg text-[#C8A96B] hover:bg-[#245746] cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Scrollable Nav Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNav.map(item => {
          const Icon = item.icon;
          const active =
            location.pathname === item.to ||
            (item.to === '/admin/dashboard' && location.pathname === '/admin');

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                active
                  ? 'bg-[#245746] text-white shadow-sm border border-[#C8A96B]/40'
                  : 'text-[#D6E3DC] hover:bg-[#245746]/60 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#C8A96B]' : 'text-[#A8C2B7]'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[#F5C2BC] hover:bg-[#C65B50]/20 cursor-pointer mt-2"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </nav>

      {/* Bottom Luxury Brand Tagline */}
      {!collapsed && (
        <div className="p-4 border-t border-[#245746] text-center space-y-1">
          <div className="font-admin-serif italic text-xs text-[#C8A96B]">
            "A Legacy of Quality &amp; Taste"
          </div>
          <div className="text-[10px] text-[#A8C2B7]">Jammu Heritage Mandi</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F0] text-[#252923] font-admin-sans flex">
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden lg:block sticky top-0 h-screen shrink-0 transition-all duration-200 z-30 shadow-xl ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 h-full shadow-2xl">{SidebarContent}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Luxury Header Bar */}
        <header className="sticky top-0 z-20 bg-[#F8F6F0]/95 backdrop-blur-md border-b border-[#E9E4D9] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(o => !o)}
              className="lg:hidden p-2 rounded-xl bg-white border border-[#E9E4D9] text-[#183D32] cursor-pointer"
              aria-label="Open menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="hidden sm:block text-xs text-[#888B83] whitespace-nowrap">
              {todayLabel}
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#888B83] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search orders, customers, products, suppliers..."
              className="w-full pl-10 pr-4 py-2 rounded-full bg-white border border-[#E9E4D9] text-xs sm:text-sm text-[#252923] placeholder-[#888B83] focus:outline-none focus:border-[#183D32]"
            />

            {searchResults && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-[#E9E4D9] rounded-2xl shadow-2xl p-3 space-y-2 z-50 max-h-80 overflow-y-auto text-xs">
                {searchResults.orders?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-[#888B83] font-semibold px-2 pb-1">Orders</div>
                    {searchResults.orders.map((o: any) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setSearchQuery('');
                          navigate('/admin/orders');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F8F6F0] flex justify-between cursor-pointer"
                      >
                        <span className="font-semibold text-[#183D32]">#{o.orderNumber}</span>
                        <span className="capitalize text-[#888B83]">{o.status}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.products?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-[#888B83] font-semibold px-2 pb-1">Products</div>
                    {searchResults.products.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSearchQuery('');
                          navigate('/admin/products');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F8F6F0] flex justify-between cursor-pointer"
                      >
                        <span className="font-medium text-[#252923]">{p.name}</span>
                        <span className="text-[#888B83]">Stock: {p.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.customers?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-[#888B83] font-semibold px-2 pb-1">Customers</div>
                    {searchResults.customers.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSearchQuery('');
                          navigate('/admin/customers');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#F8F6F0] flex justify-between cursor-pointer"
                      >
                        <span className="font-medium text-[#252923]">{c.name}</span>
                        <span className="text-[#888B83]">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!searchResults.orders?.length &&
                  !searchResults.products?.length &&
                  !searchResults.customers?.length &&
                  !searchResults.suppliers?.length && (
                    <div className="text-center py-3 text-[#888B83]">No matches found.</div>
                  )}
              </div>
            )}
          </div>

          {/* Right Controls: Quick Action + Notifications + Profile */}
          <div className="flex items-center gap-2.5">
            {/* Quick Action */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setQuickAddOpen(o => !o)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Quick Action</span>
              </button>
              {quickAddOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-[#E9E4D9] rounded-xl shadow-xl py-1.5 z-40 text-xs">
                  <Link to="/admin/products" onClick={() => setQuickAddOpen(false)} className="block px-4 py-2 hover:bg-[#F8F6F0]">
                    + Add Product
                  </Link>
                  <Link to="/admin/purchases" onClick={() => setQuickAddOpen(false)} className="block px-4 py-2 hover:bg-[#F8F6F0]">
                    + New Purchase Order
                  </Link>
                  <Link to="/admin/expenses" onClick={() => setQuickAddOpen(false)} className="block px-4 py-2 hover:bg-[#F8F6F0]">
                    + Record Expense
                  </Link>
                  <Link to="/admin/coupons" onClick={() => setQuickAddOpen(false)} className="block px-4 py-2 hover:bg-[#F8F6F0]">
                    + Create Coupon
                  </Link>
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 rounded-xl bg-white border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="w-4 h-4" />
                {(unreadCount > 0 || (stockAlerts && stockAlerts.outOfStockCount > 0)) && (
                  <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-[#C65B50] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount > 0 ? unreadCount : '!'}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E9E4D9] rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-2">
                    <span className="font-admin-serif font-semibold text-sm text-[#183D32]">
                      Notifications ({unreadCount} unread)
                    </span>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-[#245746] hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>

                  {stockAlerts && (stockAlerts.outOfStockCount > 0 || stockAlerts.lowStockCount > 0) && (
                    <div className="p-2.5 rounded-xl bg-[#FCECEB] border border-[#F2C3BE] text-xs space-y-1.5">
                      <div className="font-bold text-[#9E3D33]">
                        Stock Alert: {stockAlerts.outOfStockCount} out (0) · {stockAlerts.lowStockCount} low
                      </div>
                      {stockAlerts.outOfStockItems.length > 0 && (
                        <div className="text-[11px] text-[#7A2E26] line-clamp-2">
                          At 0: {stockAlerts.outOfStockItems.slice(0, 3).map(i => i.name).join(', ')}
                          {stockAlerts.outOfStockCount > 3 ? ` +${stockAlerts.outOfStockCount - 3} more` : ''}
                        </div>
                      )}
                      <div className="flex gap-2 pt-0.5">
                        <Link
                          to="/admin/purchases"
                          onClick={() => setNotifOpen(false)}
                          className="text-[11px] font-semibold text-[#183D32] underline"
                        >
                          Restock via PO →
                        </Link>
                        <Link
                          to="/admin/inventory"
                          onClick={() => setNotifOpen(false)}
                          className="text-[11px] font-semibold text-[#5C6058] underline"
                        >
                          View Inventory →
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[#888B83] text-center py-4">All caught up!</p>
                    ) : (
                      notifications.slice(0, 10).map(n => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border text-xs ${
                            n.isRead ? 'bg-[#F8F6F0]/60 border-[#E9E4D9]' : 'bg-[#FAF3E3] border-[#C8A96B]/50'
                          }`}
                        >
                          <div className="font-semibold text-[#183D32]">{n.title}</div>
                          <div className="text-[#5C6058] mt-0.5">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-white border border-[#E9E4D9] hover:border-[#C8A96B] cursor-pointer"
              >
                <span className="w-7 h-7 rounded-full bg-[#183D32] text-[#C8A96B] text-xs font-bold flex items-center justify-center">
                  {initials}
                </span>
                <span className="hidden md:inline text-xs font-medium text-[#252923]">
                  {user?.adminRole === 'super_admin' ? 'Super Admin' : user?.name?.split(' ')[0] || 'Staff'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#888B83]" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-[#E9E4D9] rounded-xl shadow-xl py-2 z-50 text-xs">
                  <div className="px-4 py-2 border-b border-[#E9E4D9]">
                    <div className="font-semibold text-[#183D32]">{user?.name}</div>
                    <div className="text-[#888B83] truncate">{user?.email}</div>
                  </div>
                  <a
                    href={
                      typeof window !== 'undefined' && window.location.port === '8000'
                        ? `${window.location.protocol}//${window.location.hostname}:3000/`
                        : '/'
                    }
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[#F8F6F0]"
                  >
                    <Store className="w-3.5 h-3.5 text-[#245746]" />
                    <span>View Live Storefront</span>
                  </a>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Title & Main View */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="font-admin-serif text-2xl sm:text-3xl font-semibold text-[#183D32]">
                {title}
              </h1>
              {subtitle && <p className="text-xs sm:text-sm text-[#888B83] mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
