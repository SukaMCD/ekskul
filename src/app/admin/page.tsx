'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingBag,
  UtensilsCrossed,
  MessageSquare,
  Clock,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Phone,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num || 0);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>;
      case 'confirmed':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Dikonfirmasi</span>;
      case 'cooking':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Dimasak</span>;
      case 'ready':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">Siap</span>;
      case 'delivered':
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Selesai</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Ringkasan omzet, status bot, dan aktivitas transaksi restoran realtime
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="corporate-btn-secondary py-2 px-3 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
          <Link
            href="/admin/orders"
            className="corporate-btn-primary py-2 px-4 text-xs"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Kelola Pesanan</span>
          </Link>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="corporate-card p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Omzet Hari Ini</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-slate-900">
              {formatRupiah(stats?.metrics?.todaySales || 0)}
            </h3>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>Total omzet: {formatRupiah(stats?.metrics?.totalSales || 0)}</span>
            </p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="corporate-card p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pesanan Aktif</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-slate-900">
              {stats?.metrics?.activeOrders || 0}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Dari total {stats?.metrics?.totalOrders || 0} pesanan terdaftar
            </p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="corporate-card p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Katalog Menu</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-slate-900">
              {stats?.metrics?.totalMenus || 0}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {stats?.metrics?.totalCategories || 0} kategori aktif di bot WA
            </p>
          </div>
        </div>

        {/* Card 4 */}
        <div className="corporate-card p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Interaksi Bot</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-slate-900">
              {stats?.metrics?.totalLogs || 0}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {stats?.metrics?.totalSessions || 0} sesi pelanggan tercatat
            </p>
          </div>
        </div>
      </div>

      {/* Grid 2 Column: Recent Orders & Live Bot Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders (2 Columns) */}
        <div className="lg:col-span-2 corporate-card p-6 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Pesanan Masuk Terkini</h2>
              <p className="text-xs text-slate-500">Daftar transaksi pesanan paling baru via WhatsApp</p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">INVOICE</th>
                  <th className="px-3.5 py-2.5 font-semibold">PELANGGAN</th>
                  <th className="px-3.5 py-2.5 font-semibold">TIPE</th>
                  <th className="px-3.5 py-2.5 font-semibold">TOTAL</th>
                  <th className="px-3.5 py-2.5 font-semibold">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.recentOrders && stats.recentOrders.length > 0 ? (
                  stats.recentOrders.map((ord: any) => (
                    <tr key={ord._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3.5 py-3 font-bold text-slate-900">
                        #{ord.invoiceNo}
                      </td>
                      <td className="px-3.5 py-3">
                        <p className="font-semibold text-slate-800">{ord.customerName || 'Tamu'}</p>
                        <p className="text-[11px] text-slate-400">{ord.customerPhone}</p>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="capitalize font-medium text-slate-600">
                          {ord.orderType === 'dine_in' ? 'Dine In' : ord.orderType === 'takeaway' ? 'Takeaway' : 'Delivery'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-bold text-slate-900">
                        {formatRupiah(ord.totalAmount)}
                      </td>
                      <td className="px-3.5 py-3">
                        {getStatusBadge(ord.orderStatus)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-8 text-center text-slate-400">
                      Belum ada transaksi pesanan yang tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Bot Stream Feed (1 Column) */}
        <div className="corporate-card p-6 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Bot Stream</h2>
              <p className="text-xs text-slate-500">Log chat masuk & balasan otomatis</p>
            </div>
            <Link
              href="/admin/logs"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>Log Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {stats?.recentLogs && stats.recentLogs.length > 0 ? (
              stats.recentLogs.map((log: any) => (
                <div
                  key={log._id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded ${
                        log.direction === 'inbound'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {log.direction === 'inbound' ? 'IN (USER)' : 'OUT (BOT)'}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-700 font-mono text-[11px] line-clamp-2 bg-white p-2 rounded-lg border border-slate-100">
                    {log.messageBody}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    No: <span className="text-slate-600">{log.phone}</span>
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Belum ada aktivitas chat bot.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
