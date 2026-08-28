'use client';

import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  Send,
  X,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Phone,
  MapPin,
  FileText,
  CreditCard,
} from 'lucide-react';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newOrderStatus, setNewOrderStatus] = useState('');
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [sendWaNotif, setSendWaNotif] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let url = '/api/orders?';
      if (statusFilter !== 'all') url += `status=${statusFilter}&`;
      if (search) url += `search=${encodeURIComponent(search)}&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const openDetailModal = (order: any) => {
    setSelectedOrder(order);
    setNewOrderStatus(order.orderStatus);
    setNewPaymentStatus(order.paymentStatus);
    setSendWaNotif(true);
    setModalOpen(true);
  };

  const handleUpdateOrder = async () => {
    if (!selectedOrder) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderStatus: newOrderStatus,
          paymentStatus: newPaymentStatus,
          sendWaNotif,
        }),
      });

      if (res.ok) {
        const updatedData = await res.json();
        setOrders(orders.map((o) => (o._id === selectedOrder._id ? updatedData.data : o)));
        setModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to update order', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num || 0);
  };

  const getOrderStatusPill = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>;
      case 'confirmed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Dikonfirmasi</span>;
      case 'cooking':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Sedang Dimasak</span>;
      case 'ready':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">Siap Saji/Kirim</span>;
      case 'delivered':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Selesai</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Dibatalkan</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">{status}</span>;
    }
  };

  const getPaymentStatusPill = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">LUNAS</span>;
      case 'refunded':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">REFUND</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">BELUM BAYAR</span>;
    }
  };

  const tabs = [
    { label: 'Semua Pesanan', key: 'all' },
    { label: 'Pending', key: 'pending' },
    { label: 'Dikonfirmasi', key: 'confirmed' },
    { label: 'Dimasak', key: 'cooking' },
    { label: 'Siap', key: 'ready' },
    { label: 'Selesai', key: 'delivered' },
    { label: 'Batal', key: 'cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen Pesanan</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola transaksi pesanan masuk, verifikasi bukti transfer, dan kirim update ke pelanggan via WhatsApp
          </p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="corporate-btn-secondary py-2 px-3 text-xs w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari invoice / no HP / nama..."
              className="corporate-input pl-9 py-1.5 text-xs w-64"
            />
          </div>
          <button type="submit" className="corporate-btn-secondary py-1.5 px-3 text-xs">
            Cari
          </button>
        </form>
      </div>

      {/* Orders Table */}
      <div className="corporate-card overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">INVOICE & WAKTU</th>
                <th className="px-4 py-3 font-semibold">PELANGGAN</th>
                <th className="px-4 py-3 font-semibold">TIPE PESANAN</th>
                <th className="px-4 py-3 font-semibold">ITEM PESANAN</th>
                <th className="px-4 py-3 font-semibold">TOTAL TAGIHAN</th>
                <th className="px-4 py-3 font-semibold">PEMBAYARAN</th>
                <th className="px-4 py-3 font-semibold">STATUS</th>
                <th className="px-4 py-3 font-semibold text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Memuat data pesanan...</span>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada pesanan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-900">#{ord.invoiceNo}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(ord.createdAt).toLocaleString('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800">{ord.customerName || 'Tamu'}</p>
                      <p className="text-[11px] text-slate-400">{ord.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="capitalize font-semibold text-slate-700">
                        {ord.orderType === 'dine_in'
                          ? `Dine In (${ord.tableNumber || 'Meja ?'})`
                          : ord.orderType === 'takeaway'
                          ? 'Takeaway'
                          : 'Delivery'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[200px]">
                      <p className="truncate text-slate-600 font-medium">
                        {ord.items?.map((i: any) => `${i.menuName} x${i.qty}`).join(', ') || '-'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Total {ord.items?.reduce((acc: number, cur: any) => acc + cur.qty, 0) || 0} item
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-extrabold text-slate-900">{formatRupiah(ord.totalAmount)}</p>
                      {ord.deliveryFee > 0 && (
                        <p className="text-[10px] text-slate-400">
                          (Termasuk Ongkir {formatRupiah(ord.deliveryFee)})
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {getPaymentStatusPill(ord.paymentStatus)}
                    </td>
                    <td className="px-4 py-3.5">
                      {getOrderStatusPill(ord.orderStatus)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => openDetailModal(ord)}
                        className="corporate-btn-secondary py-1.5 px-3 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail & Update Pesanan */}
      {modalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="corporate-card bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Rincian Invoice #{selectedOrder.invoiceNo}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dibuat pada {new Date(selectedOrder.createdAt).toLocaleString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Delivery Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  <span>Informasi Pemesan</span>
                </div>
                <p><span className="text-slate-400">Nama:</span> <strong className="text-slate-800">{selectedOrder.customerName || '-'}</strong></p>
                <p><span className="text-slate-400">No HP:</span> <strong className="text-slate-800">{selectedOrder.customerPhone}</strong></p>
                <p><span className="text-slate-400">Tipe:</span> <strong className="text-slate-800 capitalize">{selectedOrder.orderType}</strong></p>
                {selectedOrder.tableNumber && (
                  <p><span className="text-slate-400">No Meja:</span> <strong className="text-slate-800">{selectedOrder.tableNumber}</strong></p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Pengiriman & Catatan</span>
                </div>
                <p><span className="text-slate-400">Alamat:</span> <span className="text-slate-800 font-medium">{selectedOrder.deliveryAddress || '-'}</span></p>
                <p><span className="text-slate-400">Catatan:</span> <span className="text-slate-800 italic">{selectedOrder.customerNotes || 'Tidak ada catatan'}</span></p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Item Pesanan</h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2">Item</th>
                      <th className="px-3.5 py-2 text-center">Qty</th>
                      <th className="px-3.5 py-2 text-right">Harga</th>
                      <th className="px-3.5 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3.5 py-2.5 font-bold text-slate-800">
                          {item.menuName}
                          <span className="text-[10px] text-slate-400 block font-normal">{item.menuCode}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-slate-700">{item.qty}</td>
                        <td className="px-3.5 py-2.5 text-right text-slate-600">{formatRupiah(item.price)}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">{formatRupiah(item.subtotal)}</td>
                      </tr>
                    ))}
                    {selectedOrder.deliveryFee > 0 && (
                      <tr>
                        <td colSpan={3} className="px-3.5 py-2 text-right text-slate-500 font-medium">Biaya Ongkos Kirim:</td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-800">{formatRupiah(selectedOrder.deliveryFee)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50/80 font-bold border-t border-slate-200">
                      <td colSpan={3} className="px-3.5 py-2.5 text-right text-slate-800">TOTAL PEMBAYARAN:</td>
                      <td className="px-3.5 py-2.5 text-right text-base text-blue-700">{formatRupiah(selectedOrder.totalAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Proof Preview (if any) */}
            {selectedOrder.paymentProofUrl && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    Bukti Transfer Diterima via WA:
                  </span>
                  <a
                    href={selectedOrder.paymentProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-blue-600 flex items-center gap-1 hover:underline"
                  >
                    <span>Buka Ukuran Penuh</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <img
                  src={selectedOrder.paymentProofUrl}
                  alt="Bukti Transfer"
                  className="max-h-48 rounded-lg border border-slate-200 object-cover"
                />
              </div>
            )}

            {/* Status Update Form */}
            <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900">Perbarui Status Transaksi</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status Pesanan</label>
                  <select
                    value={newOrderStatus}
                    onChange={(e) => setNewOrderStatus(e.target.value)}
                    className="corporate-input w-full text-xs font-semibold"
                  >
                    <option value="pending">Pending (Menunggu)</option>
                    <option value="confirmed">Confirmed (Dikonfirmasi)</option>
                    <option value="cooking">Cooking (Sedang Dimasak)</option>
                    <option value="ready">Ready (Siap Saji/Kirim)</option>
                    <option value="delivered">Delivered (Selesai)</option>
                    <option value="cancelled">Cancelled (Dibatalkan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status Pembayaran</label>
                  <select
                    value={newPaymentStatus}
                    onChange={(e) => setNewPaymentStatus(e.target.value)}
                    className="corporate-input w-full text-xs font-semibold"
                  >
                    <option value="unpaid">Unpaid (Belum Bayar)</option>
                    <option value="paid">Paid (Lunas)</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="waNotifCheck"
                  checked={sendWaNotif}
                  onChange={(e) => setSendWaNotif(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="waNotifCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Kirim notifikasi pesan status otomatis ke WhatsApp pelanggan ({selectedOrder.customerPhone})
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="corporate-btn-secondary py-2 px-4 text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleUpdateOrder}
                  disabled={updatingStatus}
                  className="corporate-btn-primary py-2 px-5 text-xs shadow-sm font-bold"
                >
                  {updatingStatus ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
