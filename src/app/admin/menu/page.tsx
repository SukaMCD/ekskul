'use client';

import { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  Image as ImageIcon,
  Tag,
  ToggleLeft,
  ToggleRight,
  Search,
} from 'lucide-react';

export default function AdminMenuPage() {
  const [menus, setMenus] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    categoryId: '',
    code: '',
    name: '',
    description: '',
    price: '',
    imageUrl: '',
    isAvailable: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [menusRes, catsRes] = await Promise.all([
        fetch('/api/menus'),
        fetch('/api/categories'),
      ]);

      if (menusRes.ok && catsRes.ok) {
        const menusData = await menusRes.json();
        const catsData = await catsRes.json();
        setMenus(menusData.data || []);
        setCategories(catsData.data || []);
        if (catsData.data?.length > 0 && !formData.categoryId) {
          setFormData((prev) => ({ ...prev, categoryId: catsData.data[0]._id }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch menus/categories', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setEditMode(false);
    setCurrentId(null);
    setFormData({
      categoryId: categories[0]?._id || '',
      code: '',
      name: '',
      description: '',
      price: '',
      imageUrl: '',
      isAvailable: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (menu: any) => {
    setEditMode(true);
    setCurrentId(menu._id);
    setFormData({
      categoryId: typeof menu.categoryId === 'object' ? menu.categoryId?._id : menu.categoryId,
      code: menu.code,
      name: menu.name,
      description: menu.description || '',
      price: menu.price.toString(),
      imageUrl: menu.imageUrl || '',
      isAvailable: menu.isAvailable,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editMode ? `/api/menus/${currentId}` : '/api/menus';
      const method = editMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: Number(formData.price),
        }),
      });

      if (res.ok) {
        setModalOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal menyimpan menu');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/menus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !currentStatus }),
      });

      if (res.ok) {
        setMenus(menus.map((m) => (m._id === id ? { ...m, isAvailable: !currentStatus } : m)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Yakin ingin menghapus menu "${name}"?`)) return;

    try {
      const res = await fetch(`/api/menus/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMenus(menus.filter((m) => m._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num || 0);
  };

  const filteredMenus = menus.filter((m) => {
    const catId = typeof m.categoryId === 'object' ? m.categoryId?._id : m.categoryId;
    const matchCategory = selectedCategory === 'all' || catId === selectedCategory;
    const matchSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.code.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Katalog Menu & Produk</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola daftar menu makanan, minuman, harga, dan ketersediaan stok yang tampil di WhatsApp bot
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="corporate-btn-secondary py-2 px-3 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="corporate-btn-primary py-2 px-4 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Menu Baru</span>
          </button>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Semua Menu ({menus.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat._id}
              onClick={() => setSelectedCategory(cat._id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                selectedCategory === cat._id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama menu / kode..."
            className="corporate-input pl-9 py-1.5 text-xs w-64"
          />
        </div>
      </div>

      {/* Menus Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-xs">Memuat katalog menu...</p>
        </div>
      ) : filteredMenus.length === 0 ? (
        <div className="corporate-card p-12 text-center text-slate-400 bg-white">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Tidak ada menu ditemukan</p>
          <p className="text-xs mt-1">Coba ganti filter kategori atau tambahkan menu baru.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredMenus.map((menu) => (
            <div
              key={menu._id}
              className={`corporate-card overflow-hidden bg-white flex flex-col justify-between transition-all ${
                !menu.isAvailable ? 'opacity-65' : ''
              }`}
            >
              {/* Product Image */}
              <div className="relative h-44 w-full bg-slate-100 overflow-hidden group">
                <img
                  src={menu.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600'}
                  alt={menu.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 text-white font-mono text-[11px] font-bold shadow-xs">
                  {menu.code}
                </div>
                <div className="absolute top-2.5 right-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      menu.isAvailable
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-rose-500 text-white shadow-xs'
                    }`}
                  >
                    {menu.isAvailable ? 'Tersedia' : 'Habis'}
                  </span>
                </div>
              </div>

              {/* Product Info */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">
                    {typeof menu.categoryId === 'object' ? menu.categoryId?.name : 'Kategori'}
                  </p>
                  <h3 className="font-bold text-sm text-slate-900 line-clamp-1">{menu.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {menu.description || 'Tidak ada deskripsi.'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Harga:</span>
                    <p className="font-extrabold text-sm text-slate-900">{formatRupiah(menu.price)}</p>
                  </div>

                  <button
                    onClick={() => handleToggleAvailability(menu._id, menu.isAvailable)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                      menu.isAvailable
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    {menu.isAvailable ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Ready</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 text-rose-600" />
                        <span>Habis</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Footer */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleOpenEdit(menu)}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
                  title="Edit Menu"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(menu._id, menu.name)}
                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                  title="Hapus Menu"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add/Edit Menu */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="corporate-card bg-white w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                {editMode ? 'Edit Menu' : 'Tambah Menu Baru'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori</label>
                  <select
                    required
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="corporate-input w-full text-xs font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Menu (Singkat)</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="M1, D1, S1..."
                    className="corporate-input w-full text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Menu</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Nasi Goreng Spesial"
                  className="corporate-input w-full text-xs font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Harga (Rp)</label>
                <input
                  type="number"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="20000"
                  className="corporate-input w-full text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">URL Foto Produk</label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="corporate-input w-full text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deskripsi Menu</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Penjelasan porsi, rasa, atau racikan menu..."
                  className="corporate-input w-full text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="menuAvailable"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="menuAvailable" className="font-semibold text-slate-700 cursor-pointer">
                  Menu Tersedia (Ready untuk dipesan via WhatsApp)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="corporate-btn-secondary py-2 px-4 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="corporate-btn-primary py-2 px-5 text-xs font-bold"
                >
                  {submitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{editMode ? 'Simpan Perubahan' : 'Tambah Menu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
