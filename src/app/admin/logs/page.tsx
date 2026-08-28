'use client';

import { useState, useEffect } from 'react';
import {
  History,
  Search,
  RefreshCw,
  MessageSquare,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Pause,
  Play,
  CheckCircle2,
  Clock,
  Phone,
} from 'lucide-react';

export default function AdminLogsPage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'sessions'>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'logs') {
        let url = '/api/logs?limit=100';
        if (search) url += `&search=${encodeURIComponent(search)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.data || []);
        }
      } else {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          setSessions(data.data || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleToggleSessionPause = async (phone: string, currentPaused: boolean) => {
    setActionLoading(phone);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, isPaused: !currentPaused }),
      });

      if (res.ok) {
        setSessions(
          sessions.map((s) => (s.phone === phone ? { ...s, isPaused: !currentPaused } : s))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const getSessionStateBadge = (state: string) => {
    switch (state) {
      case 'IDLE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">IDLE</span>;
      case 'ORDERING_ITEMS':
      case 'ORDERING_TYPE':
      case 'ORDERING_NAME_ADDRESS':
      case 'ORDERING_CONFIRM':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{state}</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">{state}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Log Aktivitas & Sesi Chat</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit trail pesan masuk/keluar serta kontrol jeda bot per nomor pelanggan saat admin ingin chat manual
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="corporate-btn-secondary py-2 px-3 text-xs w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Log</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-[2px] ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-700 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Riwayat Log Pesan</span>
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-[2px] ${
              activeTab === 'sessions'
                ? 'border-blue-600 text-blue-700 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Sesi Pelanggan & Ambil Alih Chat</span>
          </button>
        </div>

        {activeTab === 'logs' && (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari no HP atau teks pesan..."
                className="corporate-input pl-9 py-1.5 text-xs w-64"
              />
            </div>
            <button type="submit" className="corporate-btn-secondary py-1.5 px-3 text-xs">
              Cari
            </button>
          </form>
        )}
      </div>

      {/* Tab 1: Logs Table */}
      {activeTab === 'logs' && (
        <div className="corporate-card overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">WAKTU</th>
                  <th className="px-4 py-3 font-semibold">ARAH</th>
                  <th className="px-4 py-3 font-semibold">NOMOR HP</th>
                  <th className="px-4 py-3 font-semibold">ISI PESAN</th>
                  <th className="px-4 py-3 font-semibold">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <span>Memuat riwayat log...</span>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      Belum ada pesan yang tercatat dalam log.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('id-ID', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.direction === 'inbound'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {log.direction === 'inbound' ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3 text-blue-600" />
                              <span>INBOUND</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                              <span>OUTBOUND</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {log.phone}
                      </td>
                      <td className="px-4 py-3">
                        <p className="whitespace-pre-wrap font-mono text-[11px] text-slate-700 line-clamp-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {log.messageBody}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-semibold ${
                            log.status === 'sent' || log.status === 'received'
                              ? 'text-emerald-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {log.status?.toUpperCase() || 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Sessions Table */}
      {activeTab === 'sessions' && (
        <div className="corporate-card overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">NOMOR HP & NAMA</th>
                  <th className="px-4 py-3 font-semibold">STATUS BOT SESI</th>
                  <th className="px-4 py-3 font-semibold">TAHAPAN SESI (STATE)</th>
                  <th className="px-4 py-3 font-semibold">INTERAKSI TERAKHIR</th>
                  <th className="px-4 py-3 font-semibold text-center">KONTROL AMBIL ALIH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <span>Memuat sesi chat...</span>
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      Belum ada sesi percakapan pelanggan yang aktif.
                    </td>
                  </tr>
                ) : (
                  sessions.map((sess) => (
                    <tr key={sess._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900 font-mono">{sess.phone}</p>
                        <p className="text-[11px] text-slate-500">{sess.pushName || 'Pelanggan'}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            sess.isPaused
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sess.isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                            }`}
                          />
                          {sess.isPaused ? 'Dijeda (Manual Mode)' : 'Bot Aktif (Auto)'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {getSessionStateBadge(sess.state)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {new Date(sess.lastInteraction).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleToggleSessionPause(sess.phone, sess.isPaused)}
                          disabled={actionLoading === sess.phone}
                          className={`corporate-btn-secondary py-1.5 px-3 text-xs inline-flex font-semibold ${
                            sess.isPaused
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                          }`}
                        >
                          {actionLoading === sess.phone ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : sess.isPaused ? (
                            <>
                              <Play className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Kembalikan ke Bot</span>
                            </>
                          ) : (
                            <>
                              <Pause className="w-3.5 h-3.5 text-amber-600" />
                              <span>Ambil Alih (Jeda Bot)</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
