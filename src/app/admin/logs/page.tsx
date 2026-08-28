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
  AlertTriangle,
  XCircle,
  Clock,
  Phone,
  Trash2,
  Eye,
  Info,
  Activity,
  ChevronRight,
  X,
  Copy,
  Check,
} from 'lucide-react';

export default function AdminLogsPage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'sessions'>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    totalInbound: 0,
    totalOutbound: 0,
    totalErrors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'logs') {
        let url = `/api/logs?limit=100&direction=${directionFilter}&status=${statusFilter}`;
        if (search) url += `&q=${encodeURIComponent(search)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.data || []);
          if (data.stats) {
            setStats(data.stats);
          }
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
  }, [activeTab, directionFilter, statusFilter]);

  // Auto refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, activeTab, directionFilter, statusFilter, search]);

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
        setSessions((prev) =>
          prev.map((s) => (s.phone === phone ? { ...s, isPaused: !currentPaused } : s))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetSession = async (phone?: string) => {
    const confirmMsg = phone
      ? `Reset sesi untuk nomor ${phone}? Pelanggan akan kembali ke tahapan awal.`
      : 'Hapus dan bersihkan semua sesi pelanggan aktif?';
    if (!confirm(confirmMsg)) return;

    setActionLoading(phone || 'all_sessions');
    try {
      const url = phone ? `/api/sessions?phone=${encodeURIComponent(phone)}` : '/api/sessions';
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        if (phone) {
          setSessions((prev) => prev.filter((s) => s.phone !== phone));
        } else {
          setSessions([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearAllLogs = async () => {
    if (!confirm('Yakin ingin membersihkan SEMUA riwayat log pesan? Data yang dihapus tidak dapat dikembalikan.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      if (res.ok) {
        setLogs([]);
        setStats({ total: 0, totalInbound: 0, totalOutbound: 0, totalErrors: 0 });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayload = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Log Aktivitas & Diagnostik Bot</span>
            {stats.totalErrors > 0 && (
              <span className="bg-rose-100 text-rose-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {stats.totalErrors} Error Terdeteksi
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pantau arus lalu lintas webhook WhatsApp, lacak pesan gagal/error, dan kelola sesi aktif pelanggan secara real-time
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-100'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-600' : ''}`} />
            <span>Auto Refresh (5s): {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="corporate-btn-secondary py-1.5 px-3 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          {activeTab === 'logs' && logs.length > 0 && (
            <button
              onClick={handleClearAllLogs}
              className="py-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Hapus Log</span>
            </button>
          )}

          {activeTab === 'sessions' && sessions.length > 0 && (
            <button
              onClick={() => handleResetSession()}
              className="py-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Bersihkan Semua Sesi</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="corporate-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Pesan</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.total || logs.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Audit log terekam</p>
        </div>

        <div className="corporate-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Inbound (Masuk)</span>
            <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-sky-600 mt-2">{stats.totalInbound}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Diterima dari WhatsApp</p>
        </div>

        <div className="corporate-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Outbound (Kirim)</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{stats.totalOutbound}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Dibalas otomatis oleh bot</p>
        </div>

        <div className={`corporate-card p-4 border transition-all ${stats.totalErrors > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200/80'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${stats.totalErrors > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              Gagal / Error
            </span>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${stats.totalErrors > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <p className={`text-2xl font-black mt-2 ${stats.totalErrors > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{stats.totalErrors}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Perlu perhatian teknis</p>
        </div>
      </div>

      {/* Tabs & Search Filter */}
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
            <span>Riwayat Pesan & Error</span>
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
            <span>Sesi Pelanggan ({sessions.length})</span>
          </button>
        </div>

        {activeTab === 'logs' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Direction Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px] font-semibold">
              <button
                onClick={() => setDirectionFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  directionFilter === 'all' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Arah
              </button>
              <button
                onClick={() => setDirectionFilter('inbound')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  directionFilter === 'inbound' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inbound
              </button>
              <button
                onClick={() => setDirectionFilter('outbound')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  directionFilter === 'outbound' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Outbound
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px] font-semibold">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'all' ? 'bg-white shadow-xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Status
              </button>
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'error' ? 'bg-rose-600 text-white font-bold' : 'text-rose-600 hover:text-rose-800'
                }`}
              >
                Hanya Error
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari no HP atau teks..."
                  className="corporate-input pl-9 py-1 text-xs w-48"
                />
              </div>
              <button type="submit" className="corporate-btn-secondary py-1 px-2.5 text-xs">
                Cari
              </button>
            </form>
          </div>
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
                  <th className="px-4 py-3 font-semibold">ISI PESAN / RESPON</th>
                  <th className="px-4 py-3 font-semibold">STATUS</th>
                  <th className="px-4 py-3 font-semibold text-center">PAYLOAD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <span>Memuat riwayat log...</span>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      <div className="max-w-md mx-auto space-y-2">
                        <Info className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600">Belum ada pesan yang tercatat dalam log.</p>
                        <p className="text-[11px] text-slate-400">
                          Coba kirim chat ke nomor WhatsApp bot Anda atau uji coba di tab *Interactive Simulator* pada Pengaturan.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isError = log.status === 'failed' || log.status === 'error';
                    const isIgnored = log.status?.includes('ignored') || log.status?.includes('paused');

                    return (
                      <tr
                        key={log._id}
                        onClick={() => setSelectedLog(log)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isError ? 'bg-rose-50/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('id-ID', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.direction === 'inbound'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {log.direction === 'inbound' ? (
                              <>
                                <ArrowDownLeft className="w-3 h-3 text-sky-600" />
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
                          {log.phone || 'system'}
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          <p
                            className={`whitespace-pre-wrap font-mono text-[11px] line-clamp-3 p-2 rounded-lg border ${
                              isError
                                ? 'bg-rose-50 text-rose-800 border-rose-200 font-semibold'
                                : isIgnored
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-50 text-slate-700 border-slate-100'
                            }`}
                          >
                            {log.messageBody || '_(Kosong)_'}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isError
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : isIgnored
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {isError ? <XCircle className="w-3 h-3 text-rose-600" /> : isIgnored ? <AlertTriangle className="w-3 h-3 text-amber-600" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            <span>{log.status?.toUpperCase() || 'OK'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-200/60 text-slate-500 hover:text-blue-600 transition-colors"
                            title="Lihat detail JSON Payload"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
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
                  <th className="px-4 py-3 font-semibold">NOMOR HP</th>
                  <th className="px-4 py-3 font-semibold">STATUS BOT SESI</th>
                  <th className="px-4 py-3 font-semibold">TAHAPAN SESI (STATE)</th>
                  <th className="px-4 py-3 font-semibold">INTERAKSI TERAKHIR</th>
                  <th className="px-4 py-3 font-semibold text-center">KONTROL SESI</th>
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
                      <div className="max-w-md mx-auto space-y-2">
                        <Users className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600">Belum ada sesi percakapan pelanggan yang aktif.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sessions.map((sess) => (
                    <tr key={sess._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900 font-mono text-xs">{sess.phone}</p>
                        <p className="text-[11px] text-slate-400">Customer ID</p>
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
                          {sess.isPaused ? 'Dijeda (Manual / Admin Mode)' : 'Bot Aktif (Auto-Reply)'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {getSessionStateBadge(sess.state)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {sess.updatedAt ? new Date(sess.updatedAt).toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleToggleSessionPause(sess.phone, sess.isPaused)}
                            disabled={actionLoading === sess.phone}
                            className={`py-1 px-2.5 rounded-lg border text-xs inline-flex items-center gap-1 font-semibold transition-colors ${
                              sess.isPaused
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                            }`}
                          >
                            {actionLoading === sess.phone ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : sess.isPaused ? (
                              <>
                                <Play className="w-3 h-3 text-emerald-600" />
                                <span>Aktifkan Bot</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-3 h-3 text-amber-600" />
                                <span>Jeda Bot</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleResetSession(sess.phone)}
                            disabled={actionLoading === sess.phone}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-500 transition-colors"
                            title="Reset Sesi ini ke IDLE"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Detail JSON Payload */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <span>Detail Payload Log</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      selectedLog.direction === 'inbound' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {selectedLog.direction?.toUpperCase()}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Nomor: <span className="font-mono font-bold text-slate-700">{selectedLog.phone}</span> |{' '}
                  {new Date(selectedLog.createdAt).toLocaleString('id-ID')}
                </p>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pesan / Body:</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-slate-800 whitespace-pre-wrap">
                  {selectedLog.messageBody || '_(Kosong)_'}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Raw JSON Payload & Server Response:</label>
                  {selectedLog.rawPayload && (
                    <button
                      onClick={() => handleCopyPayload(selectedLog.rawPayload)}
                      className="text-blue-600 hover:text-blue-700 text-[11px] font-semibold flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Tersalin!' : 'Salin JSON'}</span>
                    </button>
                  )}
                </div>
                <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto max-h-64 border border-slate-800">
                  {selectedLog.rawPayload ? (
                    <pre>{(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedLog.rawPayload), null, 2);
                      } catch {
                        return selectedLog.rawPayload;
                      }
                    })()}</pre>
                  ) : (
                    <span className="text-slate-500">Tidak ada raw payload tersimpan.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end rounded-b-2xl">
              <button
                onClick={() => setSelectedLog(null)}
                className="corporate-btn-primary py-1.5 px-4 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
