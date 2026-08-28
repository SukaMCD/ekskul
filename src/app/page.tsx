import Link from 'next/link';
import { Bot, UtensilsCrossed, ArrowRight, ShieldCheck, Zap, Sparkles, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="max-w-4xl w-full text-center space-y-8 z-10 py-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Next.js 16 • MongoDB NoSQL • Wablas Enterprise Bot</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Automated WhatsApp Commerce <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600">
            For F&B & Modern Restaurants
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Platform enterprise otomasi transaksi pesanan, katalog menu interaktif, dan customer service cerdas via gateway WhatsApp resmi.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/admin/login"
            className="corporate-btn-primary px-7 py-3 text-sm shadow-md"
          >
            <span>Buka Admin Portal</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/admin/settings"
            className="corporate-btn-secondary px-6 py-3 text-sm"
          >
            <Bot className="w-4 h-4 text-blue-600" />
            <span>Interactive Simulator</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-10 text-left">
          <div className="corporate-card p-6 space-y-3 bg-white">
            <div className="p-2.5 w-fit rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">State Engine Pintar</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Memproses pesanan multi-item, kalkulasi ongkir otomatis, hingga deteksi bukti transfer gambar.
            </p>
          </div>

          <div className="corporate-card p-6 space-y-3 bg-white">
            <div className="p-2.5 w-fit rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Katalog Menu Realtime</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Manajemen ketersediaan menu makanan & minuman yang langsung tersinkronisasi ke katalog bot.
            </p>
          </div>

          <div className="corporate-card p-6 space-y-3 bg-white">
            <div className="p-2.5 w-fit rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Vercel & Cloud NoSQL</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Arsitektur serverless modern dengan koneksi MongoDB Atlas berkecepatan tinggi dan aman.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
