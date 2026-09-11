'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Crown,
  Award,
  Sparkles,
  ShoppingBag,
  MapPin,
  Clock,
  Phone,
  Send,
  ExternalLink,
  ChevronRight,
  X,
  Filter,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string;
  phone: string;
  displayPhone: string;
  name: string;
  channel: 'telegram' | 'whatsapp';
  totalOrders: number;
  totalSpent: number;
  orderTypes: string[];
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  addresses: string[];
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  status: 'active' | 'idle' | 'inactive';
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    vipCustomers: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    channelBreakdown: { telegram: 0, whatsapp: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/customers?tier=${tierFilter}&channel=${channelFilter}`;
      if (search) url += `&q=${encodeURIComponent(search)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || []);
        if (json.stats) setStats(json.stats);
      }
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [tierFilter, channelFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers();
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Platinum':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <Crown className="w-3.5 h-3.5 text-purple-600" />
            Platinum
          </span>
        );
      case 'Gold':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Award className="w-3.5 h-3.5 text-amber-600" />
            Gold
          </span>
        );
      case 'Silver':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
            Silver
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
            Bronze
          </span>
        );
    }
  };

  const formatRupiah = (num: number) => {
    return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-blue-600" />
            Basis Data Pelanggan (CRM)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Data kontak terintegrasi, histori pesanan, segmentasi loyalitas, dan preferensi pengiriman.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/broadcast"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>Kirim Broadcast Promo</span>
          </Link>
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Pelanggan</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{stats.totalCustomers}</p>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span className="font-semibold text-blue-600">✈️ Telegram: {stats.channelBreakdown.telegram}</span>
            <span>•</span>
            <span className="font-semibold text-emerald-600">💬 WA: {stats.channelBreakdown.whatsapp}</span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pelanggan VIP (Gold & Plt)</span>
            <Crown className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-600">{stats.vipCustomers}</p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            Kontributor omzet terbesar resto
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Nilai Belanja</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-700">{formatRupiah(stats.totalRevenue)}</p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            Akumulasi transaksi terverifikasi
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Rata-Rata Order (AOV)</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-700">{formatRupiah(stats.averageOrderValue)}</p>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            Nilai pesanan rata-rata per transaksi
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearch} className="w-full md:w-96 relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, no. HP, atau ID Telegram..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </form>

        <div className="w-full md:w-auto flex items-center gap-2.5 overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Tier</option>
            <option value="platinum">👑 Platinum</option>
            <option value="gold">🥇 Gold</option>
            <option value="silver">🥈 Silver</option>
            <option value="bronze">🥉 Bronze</option>
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Channel</option>
            <option value="telegram">✈️ Telegram</option>
            <option value="whatsapp">💬 WhatsApp</option>
          </select>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Pelanggan</th>
                <th className="py-3.5 px-4">Channel / Kontak</th>
                <th className="py-3.5 px-4">Tier Loyalitas</th>
                <th className="py-3.5 px-4 text-center">Total Order</th>
                <th className="py-3.5 px-4 text-right">Total Belanja</th>
                <th className="py-3.5 px-4">Terakhir Aktif</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Memuat basis data pelanggan...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    Belum ada data pelanggan yang cocok dengan pencarian / filter.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  const initial = (customer.name || 'P')[0].toUpperCase();
                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50/75 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center justify-center shrink-0">
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {customer.name}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              ID: {customer.id.slice(-8)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {customer.channel === 'telegram' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                Telegram
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                WhatsApp
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-xs text-slate-600 font-medium">
                            {customer.displayPhone}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {getTierBadge(customer.tier)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                          {customer.totalOrders}x
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <p className="font-bold text-slate-900">
                          {formatRupiah(customer.totalSpent)}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {customer.lastOrderAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(customer.lastOrderAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Hanya Chat/Sesi</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedCustomer(customer)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors"
                            title="Detail Profil & Alamat"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Drawer */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-lg flex items-center justify-center shadow-xs">
                  {selectedCustomer.name[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">{selectedCustomer.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {getTierBadge(selectedCustomer.tier)}
                    <span className="text-xs text-slate-500">{selectedCustomer.displayPhone}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Drawer */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Stat Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Total Frekuensi Order</p>
                  <p className="text-xl font-black text-slate-900 mt-0.5">
                    {selectedCustomer.totalOrders} Pesanan
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500">Total Pengeluaran (LTV)</p>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">
                    {formatRupiah(selectedCustomer.totalSpent)}
                  </p>
                </div>
              </div>

              {/* Channel & Order Types */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Preferensi Pesanan
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedCustomer.orderTypes && selectedCustomer.orderTypes.length > 0 ? (
                    selectedCustomer.orderTypes.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {type === 'delivery'
                          ? '🛵 Pesan Antar (Delivery)'
                          : type === 'dine_in'
                          ? '🍽️ Makan di Tempat'
                          : '🛍️ Bungkus (Takeaway)'}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada preferensi tercatat</span>
                  )}
                </div>
              </div>

              {/* Delivery Addresses */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Alamat Pengiriman Tersimpan
                </h4>
                {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCustomer.addresses.map((addr, idx) => {
                      const isGmaps = addr.includes('google.com/maps');
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1"
                        >
                          <p className="font-medium break-all">{addr}</p>
                          {isGmaps && (
                            <a
                              href={addr}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Buka Titik GPS Google Maps
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Belum ada alamat pengiriman tercatat</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <Link
                  href={`/admin/broadcast`}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Broadcast Promosi</span>
                </Link>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
