'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Sliders,
  History,
  LogOut,
  Bot,
  Menu as MenuIcon,
  X,
  Power,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [botActive, setBotActive] = useState<boolean>(true);
  const [toggling, setToggling] = useState(false);
  const [user, setUser] = useState<{ name: string; username: string; role: string } | null>(null);

  // Fetch initial session & bot status
  const fetchStatus = async () => {
    if (pathname === '/admin/login') return;
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/admin/login');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const setts = await settingsRes.json();
        setBotActive(setts.data?.bot_active === '1');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [pathname]);

  // If on login page, render children directly without admin chrome
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const toggleBot = async () => {
    setToggling(true);
    try {
      const newStatus = !botActive;
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: newStatus ? '1' : '0' }),
      });
      if (res.ok) {
        setBotActive(newStatus);
      }
    } catch (err) {
      console.error('Failed to toggle bot', err);
    } finally {
      setToggling(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch {
      router.push('/admin/login');
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Pesanan Masuk', href: '/admin/orders', icon: ShoppingBag },
    { label: 'Katalog Menu', href: '/admin/menu', icon: UtensilsCrossed },
    { label: 'Pengaturan Bot', href: '/admin/settings', icon: Sliders },
    { label: 'Log & Sesi Chat', href: '/admin/logs', icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        {/* Brand */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight text-slate-900">Resto Sedap Rasa</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium text-slate-500">WA Automation Bot</span>
            </div>
          </div>
        </div>

        {/* Global Bot Status Control */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Status Bot WA:</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                  botActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    botActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {botActive ? 'Aktif (Auto-Reply)' : 'Dijeda (Paused)'}
              </span>
            </div>
            <button
              onClick={toggleBot}
              disabled={toggling}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                botActive
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {toggling ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5" />
              )}
              <span>{botActive ? 'Jeda Bot (Pause)' : 'Nyalakan Bot'}</span>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                {user?.name ? user.name[0].toUpperCase() : 'A'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-800 truncate">{user?.name || 'Admin'}</p>
                <p className="text-[10px] text-slate-400 truncate">@{user?.username || 'admin'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar Mobile */}
      <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-xs text-slate-900">Sedap Rasa Admin</h2>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${botActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-[10px] text-slate-500">{botActive ? 'Bot Active' : 'Bot Paused'}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg bg-slate-100 text-slate-700"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu Dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 p-4 space-y-2 z-20">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${
                  isActive ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={toggleBot}
              className="text-xs font-semibold text-slate-700 flex items-center gap-2"
            >
              <Power className="w-4 h-4" />
              <span>{botActive ? 'Jeda Bot' : 'Nyalakan Bot'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-600 flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50">
        <div className="p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
