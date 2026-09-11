'use client';

import { useState, useEffect } from 'react';
import {
  Send,
  Radio,
  Users,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Smartphone,
  Copy,
  Clock,
  HelpCircle,
  Megaphone,
} from 'lucide-react';

export default function AdminBroadcastPage() {
  const [channel, setChannel] = useState<'all' | 'telegram' | 'whatsapp'>('all');
  const [targetTier, setTargetTier] = useState<'all' | 'vip'>('all');
  const [message, setMessage] = useState('');
  const [counts, setCounts] = useState({
    all: 0,
    telegram: 0,
    whatsapp: 0,
    vip: 0,
  });
  const [recentBroadcasts, setRecentBroadcasts] = useState<any[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [sending, setSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const fetchStats = async () => {
    setLoadingCounts(true);
    try {
      const res = await fetch('/api/admin/broadcast');
      if (res.ok) {
        const json = await res.json();
        if (json.data?.counts) setCounts(json.data.counts);
        if (json.data?.recentBroadcasts) setRecentBroadcasts(json.data.recentBroadcasts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Templates
  const templates = [
    {
      title: '🎉 Promo Diskon Weekend 20%',
      text: `Halo Kak {{name}}! 🌿✨\n\nSpesial akhir pekan ini, Leafly Resto menghadirkan Promo Diskon 20% untuk semua menu makanan & minuman pilihan!\n\n🍽️ Cukup ketik /order di chat ini atau klik tombol Pesan di bawah untuk langsung memesan.\n\nPromo berlaku sampai hari Minggu. Jangan sampai kehabisan ya Kak! 😋`,
    },
    {
      title: '🍱 Menu Baru Rilis',
      text: `Hai Kak {{name}}! 🍽️ Ada kabar gembira dari Leafly Resto!\n\nHari ini kami baru saja meluncurkan menu baru spesial racikan chef kami yang wajib banget dicobain.\n\nYuk intip menu barunya dengan ketik /menu di chat ini. Selamat menikmati hidangan spesial kami ya Kak! ✨`,
    },
    {
      title: '👑 Apresiasi Pelanggan Setia (VIP)',
      text: `Salam hangat Kak {{name}}! 🌟\n\nSebagai bentuk apresiasi kami atas kesetiaan Kakak memesan di Leafly Resto, kami berikan GRATIS Minuman Segar untuk pesanan berikutnya!\n\nLangsung balas chat ini atau order lewat bot kami ya Kak. Terima kasih banyak sudah selalu mempercayai kami! 💚`,
    },
    {
      title: '⏰ Info Jam Operasional',
      text: `Halo Kak {{name}}! 🌿\n\nRestoran Leafly Resto hari ini buka normal mulai pukul 10:00 - 22:00 WIB.\n\nKami siap melayani Makan di Tempat (Dine-In), Bungkus (Takeaway), maupun Pesan Antar (Delivery) langsung ke lokasi Kakak.\n\nKetik /start kapan saja untuk melihat menu & memesan!`,
    },
  ];

  // Hitung target saat ini
  const getCurrentTargetCount = () => {
    if (targetTier === 'vip') return counts.vip;
    if (channel === 'telegram') return counts.telegram;
    if (channel === 'whatsapp') return counts.whatsapp;
    return counts.all;
  };

  const handleSendBroadcast = async () => {
    setShowConfirmModal(false);
    setSending(true);
    setBroadcastResult(null);

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          targetTier,
          message,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status) {
        setBroadcastResult({
          success: true,
          message: data.message,
          details: data.data,
        });
        setMessage('');
        fetchStats();
      } else {
        setBroadcastResult({
          success: false,
          message: data.message || 'Gagal mengirim broadcast',
        });
      }
    } catch (err: any) {
      setBroadcastResult({
        success: false,
        message: err.message || 'Terjadi kesalahan jaringan saat broadcast',
      });
    } finally {
      setSending(false);
    }
  };

  const insertVariable = (varName: string) => {
    setMessage((prev) => prev + varName);
  };

  // Preview teks mengganti {{name}} dengan contoh
  const previewText = message
    ? message.replace(/\{\{name\}\}/gi, 'Budi Santoso')
    : 'Ketik pesan broadcast di sebelah kiri atau pilih template cepat di bawah untuk melihat live preview pesan di sini...';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Megaphone className="w-7 h-7 text-blue-600" />
            Fitur Broadcast Pesan Massal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kirim pengumuman, promosi, dan kupon diskon serentak ke seluruh pelanggan di database Telegram & WhatsApp.
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loadingCounts}
          className="self-start sm:self-auto p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loadingCounts ? 'animate-spin text-blue-600' : ''}`} />
          <span>Update Data Kontak</span>
        </button>
      </div>

      {/* Result Alert */}
      {broadcastResult && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 shadow-xs animate-in fade-in ${
            broadcastResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {broadcastResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <p className="font-bold text-sm">{broadcastResult.message}</p>
            {broadcastResult.details && (
              <p className="mt-1 text-emerald-700 font-medium">
                Terkirim: {broadcastResult.details.sentCount} penerima • Gagal: {broadcastResult.details.failedCount} penerima
              </p>
            )}
          </div>
          <button
            onClick={() => setBroadcastResult(null)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Target Audience & Editor (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Target Audience Selector */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              1. Pilih Target Audiens Penerima
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setChannel('all');
                  setTargetTier('all');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  channel === 'all' && targetTier === 'all'
                    ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-xs ring-2 ring-blue-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-500">Semua</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{counts.all}</p>
                <span className="text-[10px] text-blue-600 font-bold">Semua Kontak</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChannel('telegram');
                  setTargetTier('all');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  channel === 'telegram' && targetTier === 'all'
                    ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs ring-2 ring-sky-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-500">Telegram</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{counts.telegram}</p>
                <span className="text-[10px] text-sky-600 font-bold">Bot Telegram</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChannel('whatsapp');
                  setTargetTier('all');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  channel === 'whatsapp' && targetTier === 'all'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-xs ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-500">WhatsApp</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{counts.whatsapp}</p>
                <span className="text-[10px] text-emerald-600 font-bold">Nomor WA</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetTier('vip');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  targetTier === 'vip'
                    ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs ring-2 ring-amber-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold text-slate-500">VIP Saja</p>
                <p className="text-lg font-black text-amber-600 mt-0.5">{counts.vip}</p>
                <span className="text-[10px] text-amber-700 font-bold">Gold & Plt</span>
              </button>
            </div>
          </div>

          {/* Message Composer */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                2. Tulis Pesan Broadcast
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Variabel:</span>
                <button
                  type="button"
                  onClick={() => insertVariable('{{name}}')}
                  className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono text-[11px] font-bold border border-blue-200 transition-colors"
                  title="Sapaan Otomatis Nama Pelanggan"
                >
                  + {'{{name}}'}
                </button>
              </div>
            </div>

            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tulis pesan promosi atau informasi restoran di sini... Anda bisa gunakan {{name}} untuk menyebut nama pelanggan secara personal."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-normal text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all leading-relaxed"
            />

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Mendukung emoji 🌿, 🍽️, ✨ dan markdown standar Telegram/WA</span>
              <span>{message.length} karakter</span>
            </div>

            {/* Quick Template Picker */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Gunakan Template Cepat:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMessage(tpl.text)}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-left transition-colors"
                  >
                    <p className="font-bold text-xs text-slate-800">{tpl.title}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{tpl.text.slice(0, 50)}...</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Submit */}
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={sending || !message.trim() || getCurrentTargetCount() === 0}
                className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sedang Mengirim Pesan Massal...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Kirim Broadcast ke {getCurrentTargetCount()} Pelanggan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Chat Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              Live Preview Tampilan Pelanggan
            </h3>

            {/* Phone Screen Simulator */}
            <div className="w-full max-w-sm mx-auto bg-slate-900 rounded-3xl p-3 shadow-xl border-4 border-slate-800">
              {/* Screen Top Bar */}
              <div className="bg-slate-800 rounded-t-2xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                  <img src="/leafly-logo.png" alt="Leafly" className="w-full h-full object-contain p-0.5" />
                </div>
                <div>
                  <p className="text-white text-xs font-bold">Leafly Resto</p>
                  <p className="text-[10px] text-emerald-400">Online • Verified Bot</p>
                </div>
              </div>

              {/* Chat Canvas */}
              <div className="bg-[#0b141a] p-4 min-h-[340px] max-h-[380px] rounded-b-2xl overflow-y-auto space-y-3 flex flex-col justify-end">
                {/* Incoming Message Bubble */}
                <div className="bg-[#202c33] text-slate-100 p-3.5 rounded-2xl rounded-tl-xs text-xs space-y-1.5 shadow-md border border-white/5">
                  <p className="whitespace-pre-line leading-relaxed text-[12px]">{previewText}</p>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-1">
                    <span>14:02</span>
                    <CheckCircle2 className="w-3 h-3 text-sky-400" />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Variabel <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono font-bold">{'{{name}}'}</code> otomatis diganti dengan nama asli masing-masing pelanggan saat pengiriman.
            </p>
          </div>

          {/* Broadcast History */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Riwayat Broadcast Terakhir
            </h3>
            {recentBroadcasts.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 italic">Belum ada pengiriman broadcast sebelumnya.</p>
            ) : (
              <div className="space-y-2">
                {recentBroadcasts.map((log, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{log.phone}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] line-clamp-2">{log.messageBody}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">Konfirmasi Kirim Broadcast</h3>
              <p className="text-xs text-slate-500">
                Pesan ini akan dikirim serentak ke{' '}
                <strong className="text-blue-600 font-bold">{getCurrentTargetCount()} pelanggan</strong>. Pastikan isi
                pesan sudah benar.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 max-h-36 overflow-y-auto whitespace-pre-line">
              {message}
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Batal & Edit Lagi
              </button>
              <button
                type="button"
                onClick={handleSendBroadcast}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                Ya, Kirim Sekarang!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
