'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Send,
  Save,
  RefreshCw,
  CheckCircle2,
  Bot,
  MessageSquare,
  Sparkles,
  Phone,
  Store,
  Shield,
  Key,
  CreditCard,
  UserCheck,
  Trash2,
  Plus,
  Play,
  RotateCcw,
  Globe,
  ExternalLink,
  Info,
  Check,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'gateway' | 'wablas' | 'templates' | 'whitelist' | 'simulator'>('simulator');
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test Send WA State
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo! Ini adalah pesan uji coba dari sistem bot F&B Resto.');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Telegram Setup & Test State
  const [tgWebhookUrl, setTgWebhookUrl] = useState('');
  const [settingTgWebhook, setSettingTgWebhook] = useState(false);
  const [tgWebhookResult, setTgWebhookResult] = useState<{ success: boolean; message: string } | null>(null);
  const [checkingTgInfo, setCheckingTgInfo] = useState(false);
  const [tgWebhookInfo, setTgWebhookInfo] = useState<any>(null);
  const [testTgChatId, setTestTgChatId] = useState('');
  const [testTgMessage, setTestTgMessage] = useState('Halo! Bot Telegram Resto Anda telah berhasil terhubung dan siap melayani pesanan.');
  const [sendingTgTest, setSendingTgTest] = useState(false);
  const [testTgResult, setTestTgResult] = useState<{ success: boolean; message: string } | null>(null);

  // Whitelist State
  const [whitelistInput, setWhitelistInput] = useState('');

  // Simulator State
  const [simPhone, setSimPhone] = useState('6281299887766');
  const [simPushName, setSimPushName] = useState('Budi Santoso');
  const [simInput, setSimInput] = useState('');
  const [simMessages, setSimMessages] = useState<
    Array<{ sender: 'user' | 'bot'; text: string; time: string }>
  >([
    {
      sender: 'bot',
      text: '🤖 *Simulator Siap!*\nKetik *MENU* untuk melihat katalog, atau ketik *ORDER* untuk mulai memesan.',
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [simulating, setSimulating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.data || {});
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'simulator') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [simMessages, activeTab]);

  const handleConfigChange = (key: string, val: string) => {
    setConfigs((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Test Send Message to Real WA
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) return;
    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/settings/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, message: testMessage }),
      });

      const data = await res.json();
      setTestResult({
        success: data.status,
        message: data.message || (data.status ? 'Pesan berhasil dikirim!' : 'Gagal mengirim pesan'),
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Terjadi kesalahan jaringan' });
    } finally {
      setSendingTest(false);
    }
  };

  // Telegram Webhook Setup Handler
  const handleSetupTelegramWebhook = async () => {
    if (!configs.telegram_bot_token) {
      alert('Masukkan Telegram Bot Token terlebih dahulu!');
      return;
    }
    setSettingTgWebhook(true);
    setTgWebhookResult(null);

    try {
      const defaultUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/telegram` : '';
      const targetUrl = tgWebhookUrl.trim() || defaultUrl;

      const res = await fetch('/api/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: targetUrl,
          token: configs.telegram_bot_token,
        }),
      });

      const data = await res.json();
      setTgWebhookResult({
        success: data.ok,
        message: data.message || (data.ok ? 'Webhook Telegram berhasil dipasang!' : 'Gagal memasang webhook'),
      });
      if (data.ok) {
        handleConfigChange('telegram_webhook_url', targetUrl);
      }
    } catch (err: any) {
      setTgWebhookResult({ success: false, message: err.message || 'Terjadi kesalahan jaringan' });
    } finally {
      setSettingTgWebhook(false);
    }
  };

  // Check Telegram Webhook Info from Telegram API
  const handleCheckTelegramWebhookInfo = async () => {
    if (!configs.telegram_bot_token) {
      alert('Masukkan Telegram Bot Token terlebih dahulu!');
      return;
    }
    setCheckingTgInfo(true);
    try {
      const res = await fetch(`/api/telegram/setup-webhook?token=${encodeURIComponent(configs.telegram_bot_token.trim())}`);
      const data = await res.json();
      if (data.ok) {
        setTgWebhookInfo(data.info);
      } else {
        alert(data.message || 'Gagal mengambil status webhook dari Telegram');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal terhubung');
    } finally {
      setCheckingTgInfo(false);
    }
  };

  // Test Send Telegram Message
  const handleSendTestTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTgChatId) return;
    setSendingTgTest(true);
    setTestTgResult(null);

    try {
      const res = await fetch('/api/telegram/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: testTgChatId,
          message: testTgMessage,
          token: configs.telegram_bot_token,
        }),
      });

      const data = await res.json();
      setTestTgResult({
        success: data.status,
        message: data.message || (data.status ? 'Pesan Telegram berhasil terkirim!' : 'Gagal mengirim pesan Telegram'),
      });
    } catch (err: any) {
      setTestTgResult({ success: false, message: err.message || 'Terjadi kesalahan jaringan' });
    } finally {
      setSendingTgTest(false);
    }
  };

  // Whitelist helper
  const whitelistList = (configs.whitelist_numbers || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleAddWhitelist = () => {
    if (!whitelistInput.trim()) return;
    const cleanNum = whitelistInput.replace(/[^0-9]/g, '');
    if (!cleanNum) return;
    const current = new Set(whitelistList);
    current.add(cleanNum);
    handleConfigChange('whitelist_numbers', Array.from(current).join(','));
    setWhitelistInput('');
  };

  const handleRemoveWhitelist = (num: string) => {
    const next = whitelistList.filter((n) => n !== num);
    handleConfigChange('whitelist_numbers', next.join(','));
  };

  // Send message in browser simulator
  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim() || simulating) return;

    const userText = simInput.trim();
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    setSimMessages((prev) => [...prev, { sender: 'user', text: userText, time: timeStr }]);
    setSimInput('');
    setSimulating(true);

    try {
      const res = await fetch('/api/settings/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: simPhone,
          pushName: simPushName,
          message: userText,
        }),
      });

      const data = await res.json();
      console.log('[Simulator] RAW API Response:', data);

      // Try to extract text from multiple possible formats
      const extractedMsgs: string[] = [];

      // Primary: data.replies array (objects with .message)
      if (Array.isArray(data.replies) && data.replies.length > 0) {
        for (const rep of data.replies) {
          const txt = typeof rep === 'string' ? rep : String(rep?.message ?? rep?.text ?? '');
          if (txt && txt.trim()) extractedMsgs.push(txt.trim());
        }
      }

      // Fallback 1: data._rawReplies (flat string array from backend)
      if (extractedMsgs.length === 0 && Array.isArray(data._rawReplies) && data._rawReplies.length > 0) {
        for (const r of data._rawReplies) {
          if (r && String(r).trim()) extractedMsgs.push(String(r).trim());
        }
      }

      // Fallback 2: data._firstReply (single string)
      if (extractedMsgs.length === 0 && data._firstReply) {
        extractedMsgs.push(String(data._firstReply));
      }

      if (extractedMsgs.length > 0) {
        const newBotMsgs = extractedMsgs.map((txt) => ({
          sender: 'bot' as const,
          text: txt,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        }));
        setSimMessages((prev) => [...prev, ...newBotMsgs]);
      } else {
        // Show diagnostic info — never show empty bubble
        const debugInfo = data.result?.message || data.message || JSON.stringify(data).slice(0, 200);
        setSimMessages((prev) => [
          ...prev,
          {
            sender: 'bot' as const,
            text: `⚠️ Bot tidak menghasilkan balasan.\nStatus: ${debugInfo}\n\n_replyCount: ${data._replyCount ?? 'N/A'}_`,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      setSimMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: '❌ Error: Terjadi kegagalan saat menjalankan simulasi bot engine.',
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSimulating(false);
    }
  };

  const handleResetSimulator = async () => {
    try {
      if (simPhone) {
        await fetch(`/api/sessions?phone=${encodeURIComponent(simPhone)}`, { method: 'DELETE' });
      }
    } catch {}
    setSimMessages([
      {
        sender: 'bot',
        text: '🤖 *Simulator Direset!*\nKetik *MENU* untuk melihat katalog atau ketik *ORDER* untuk membuat pesanan baru.',
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pengaturan Bot & Simulator</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Konfigurasi gateway Wablas, info resto & rekening, mode whitelist, serta sandbox simulasi chat di browser
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Pengaturan disimpan!</span>
            </span>
          )}
          <button
            onClick={() => handleSaveSettings()}
            disabled={saving}
            className="corporate-btn-primary py-2 px-5 text-xs font-bold"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Simpan Pengaturan</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { key: 'simulator', label: 'Interactive Simulator (Sandbox)', icon: Bot },
          { key: 'general', label: 'Profil Restoran', icon: Store },
          { key: 'gateway', label: 'Gateway Bot (Telegram / WA)', icon: Key },
          { key: 'templates', label: 'Template Pesan & Bank', icon: MessageSquare },
          { key: 'whitelist', label: 'Mode Whitelist', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key || (tab.key === 'gateway' && activeTab === 'wablas');
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-[2px] shrink-0 ${
                isActive
                  ? 'border-blue-600 text-blue-700 bg-white shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Simulator */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Simulator Box (2 Cols) */}
          <div className="lg:col-span-2 corporate-card bg-white overflow-hidden flex flex-col h-[640px] shadow-sm border border-slate-200">
            {/* Simulator Header */}
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">{configs.bot_name || 'Resto Bot'}</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Live Simulator Engine (No WhatsApp Device Needed)</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleResetSimulator}
                className="corporate-btn-secondary py-1 px-2.5 text-[11px]"
                title="Reset Percakapan"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset Chat</span>
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#e5ddd5]/30">
              {simMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[70%] p-3.5 rounded-2xl text-xs space-y-1 shadow-xs ${
                      msg.sender === 'user'
                        ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none border border-emerald-200/60'
                        : 'bg-white text-slate-900 rounded-tl-none border border-slate-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed font-sans break-words min-h-[1em]">{String(msg.text ?? '')}</p>
                    <span className="text-[9px] text-slate-400 block text-right font-mono">{msg.time}</span>
                  </div>
                </div>
              ))}
              {simulating && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 text-xs text-slate-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Bot sedang memproses...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSimulateSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2">
              <input
                type="text"
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder="Ketik pesan simulasi (contoh: MENU, ORDER, atau ORDER M1 2)..."
                className="corporate-input flex-1 text-xs"
              />
              <button
                type="submit"
                disabled={simulating || !simInput.trim()}
                className="corporate-btn-primary px-4 py-2 text-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim</span>
              </button>
            </form>
          </div>

          {/* Simulator Controls & Quick Commands (1 Col) */}
          <div className="space-y-4">
            <div className="corporate-card p-5 bg-white space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                Data Identitas Penguji (Mock Customer)
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Nomor WhatsApp Penguji</label>
                  <input
                    type="text"
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="corporate-input w-full font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Nama Profil WhatsApp</label>
                  <input
                    type="text"
                    value={simPushName}
                    onChange={(e) => setSimPushName(e.target.value)}
                    className="corporate-input w-full text-xs font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="corporate-card p-5 bg-white space-y-3 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-slate-700">
                Pintasan Perintah Cepat
              </h3>
              <p className="text-slate-500 text-[11px]">Klik salah satu tombol untuk mengetik otomatis:</p>

              <div className="flex flex-wrap gap-1.5">
                {[
                  '/start',
                  'MENU',
                  'ORDER',
                  'ORDER M1 2, D1 1',
                  'DINE IN',
                  'TAKEAWAY',
                  'DELIVERY',
                  'STATUS',
                  'INFO',
                  'ADMIN',
                  'YA',
                  'BATAL',
                ].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => setSimInput(cmd)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 text-[11px] font-bold transition-all"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: General Profile */}
      {activeTab === 'general' && (
        <div className="corporate-card p-6 bg-white max-w-3xl space-y-5 text-xs">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Profil & Informasi Restoran
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Restoran / Toko</label>
              <input
                type="text"
                value={configs.store_name || ''}
                onChange={(e) => handleConfigChange('store_name', e.target.value)}
                placeholder="Contoh: Resto Sedap Rasa"
                className="corporate-input w-full text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Bot WhatsApp</label>
              <input
                type="text"
                value={configs.bot_name || ''}
                onChange={(e) => handleConfigChange('bot_name', e.target.value)}
                placeholder="Contoh: Sedap Bot"
                className="corporate-input w-full text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor WhatsApp Admin (Notifikasi)</label>
              <input
                type="text"
                value={configs.admin_phone || ''}
                onChange={(e) => handleConfigChange('admin_phone', e.target.value)}
                placeholder="6281234567890"
                className="corporate-input w-full text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jam Operasional Toko</label>
              <input
                type="text"
                value={configs.store_hours || ''}
                onChange={(e) => handleConfigChange('store_hours', e.target.value)}
                placeholder="Senin - Minggu: 10.00 - 22.00 WIB"
                className="corporate-input w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea
              rows={2}
              value={configs.store_address || ''}
              onChange={(e) => handleConfigChange('store_address', e.target.value)}
              placeholder="Jl. Boulevard Raya No. 88, Surabaya"
              className="corporate-input w-full text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Link Google Maps</label>
            <input
              type="url"
              value={configs.store_gmaps || ''}
              onChange={(e) => handleConfigChange('store_gmaps', e.target.value)}
              placeholder="https://maps.google.com/?q=..."
              className="corporate-input w-full text-xs"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Gateway Bot Credentials (Telegram / WhatsApp) */}
      {(activeTab === 'gateway' || activeTab === 'wablas') && (
        <div className="space-y-6 max-w-3xl">
          {/* Provider Selector Card */}
          <div className="corporate-card p-6 bg-white space-y-5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Pilih Gateway Bot Provider
                </h2>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Pilih layanan yang Anda gunakan untuk menghubungkan bot toko Anda ke pelanggan.
                </p>
              </div>

              {/* Provider Radio Pills */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleConfigChange('gateway_provider', 'telegram')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    (configs.gateway_provider || 'telegram') === 'telegram'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Send className="w-3 h-3" />
                  <span>Telegram Bot</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange('gateway_provider', 'fonnte')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    configs.gateway_provider === 'fonnte'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Fonnte (WA)
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange('gateway_provider', 'wablas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    configs.gateway_provider === 'wablas'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Wablas (WA)
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* PROVIDER 1: TELEGRAM BOT API (DEFAULT & RECOMMENDED)            */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {(configs.gateway_provider || 'telegram') === 'telegram' && (
              <div className="space-y-5">
                {/* Tutorial / Guide Card */}
                <div className="p-4 bg-sky-50/80 border border-sky-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sky-950 flex items-center gap-1.5 text-xs">
                      <span>💡 Cara Menghubungkan Telegram Bot (Gratis & Stabil 24/7):</span>
                    </h4>
                    <span className="bg-sky-200/70 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Resmi & Tanpa HP Fisik
                    </span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-sky-900 leading-relaxed font-medium">
                    <li>
                      Buka Telegram lalu chat dengan{' '}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline text-sky-950 inline-flex items-center gap-0.5"
                      >
                        @BotFather <ExternalLink className="w-2.5 h-2.5 inline" />
                      </a>
                      .
                    </li>
                    <li>
                      Ketik command <code className="bg-white px-1 py-0.5 rounded border border-sky-300 font-mono text-[10px]">/newbot</code>, lalu ikuti instruksi untuk mengisi nama bot dan username bot (harus berakhiran <i>bot</i>, contoh: <code className="bg-white px-1 py-0.5 rounded border border-sky-300 font-mono text-[10px]">RestoSedapBot</code>).
                    </li>
                    <li>
                      Salin <b>HTTP API Token</b> yang diberikan BotFather, lalu tempelkan pada kolom <b>Telegram Bot Token</b> di bawah ini.
                    </li>
                    <li>
                      Untuk Chat ID Admin: Cari bot{' '}
                      <a
                        href="https://t.me/userinfobot"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline text-sky-950 inline-flex items-center gap-0.5"
                      >
                        @userinfobot <ExternalLink className="w-2.5 h-2.5 inline" />
                      </a>{' '}
                      di Telegram, ketik <code className="bg-white px-1 py-0.5 rounded border border-sky-300 font-mono text-[10px]">/start</code>, dan salin nomor <b>Id</b> Anda ke kolom Admin Chat ID.
                    </li>
                    <li>
                      Klik tombol <b>&quot;Pasang Webhook ke Telegram&quot;</b> di bawah untuk mengaktifkan webhook secara instan!
                    </li>
                  </ol>
                </div>

                {/* Token & Chat ID Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Telegram Bot Token <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={configs.telegram_bot_token || ''}
                      onChange={(e) => handleConfigChange('telegram_bot_token', e.target.value)}
                      placeholder="Contoh: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      className="corporate-input w-full text-xs font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Token API dari @BotFather di Telegram
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Telegram Admin Chat ID (Notifikasi Pesanan)
                    </label>
                    <input
                      type="text"
                      value={configs.telegram_admin_chat_id || ''}
                      onChange={(e) => handleConfigChange('telegram_admin_chat_id', e.target.value)}
                      placeholder="Contoh: 987654321"
                      className="corporate-input w-full text-xs font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      ID akun Telegram Anda dari @userinfobot untuk terima notifikasi order baru
                    </p>
                  </div>
                </div>

                {/* Webhook Registration Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-xs">Pemasangan Webhook Otomatis (1-Klik)</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Daftarkan URL server aplikasi ke Telegram API agar Telegram dapat mengirimkan chat secara langsung.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Webhook URL Endpoint</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={
                          tgWebhookUrl ||
                          configs.telegram_webhook_url ||
                          (typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/telegram` : '')
                        }
                        onChange={(e) => setTgWebhookUrl(e.target.value)}
                        placeholder="https://domain-anda.com/api/webhook/telegram"
                        className="corporate-input flex-1 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url =
                            tgWebhookUrl ||
                            configs.telegram_webhook_url ||
                            (typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/telegram` : '');
                          navigator.clipboard.writeText(url);
                          alert('Webhook URL berhasil disalin!');
                        }}
                        className="corporate-btn-secondary px-3 text-[11px] font-semibold"
                      >
                        Salin
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Wajib berawalan <code className="font-mono">https://</code> sesuai persyaratan keamanan Telegram Bot API.
                    </p>
                  </div>

                  {tgWebhookResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs font-semibold ${
                        tgWebhookResult.success
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {tgWebhookResult.message}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSetupTelegramWebhook}
                      disabled={settingTgWebhook || !configs.telegram_bot_token}
                      className="corporate-btn-primary py-2 px-4 text-xs font-bold bg-sky-600 hover:bg-sky-700 border-sky-600"
                    >
                      {settingTgWebhook ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      <span>Pasang Webhook ke Telegram</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCheckTelegramWebhookInfo}
                      disabled={checkingTgInfo || !configs.telegram_bot_token}
                      className="corporate-btn-secondary py-2 px-3 text-xs font-semibold"
                    >
                      {checkingTgInfo ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Info className="w-3.5 h-3.5" />
                      )}
                      <span>Cek Info Webhook</span>
                    </button>
                  </div>

                  {/* Diagnostic Telegram Webhook Info */}
                  {tgWebhookInfo && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                      <div className="font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-1">
                        <span>📊 Status Webhook di Server Telegram:</span>
                        <span className="text-[10px] text-emerald-600 font-semibold">Terkoneksi</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 pt-1">
                        <div>
                          <span className="font-semibold block text-slate-500">URL Terdaftar:</span>
                          <span className="font-mono text-slate-800 break-all">{tgWebhookInfo.url || 'Belum terpasang'}</span>
                        </div>
                        <div>
                          <span className="font-semibold block text-slate-500">Pending Updates:</span>
                          <span className="font-bold text-slate-900">{tgWebhookInfo.pending_update_count ?? 0}</span>
                        </div>
                        {tgWebhookInfo.last_error_message && (
                          <div className="sm:col-span-2 text-rose-600 font-semibold">
                            <span>Last Error: </span>{tgWebhookInfo.last_error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* PROVIDER 2: FONNTE (WHATSAPP)                                   */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {configs.gateway_provider === 'fonnte' && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <h4 className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>💡 Cara Menghubungkan Fonnte (3 Langkah):</span>
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-emerald-800 leading-relaxed font-medium">
                    <li>Daftar / login akun gratis di <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="font-bold underline text-emerald-900">fonnte.com</a>.</li>
                    <li>Masuk ke menu <b>Device</b> di Fonnte lalu <b>Scan QR WhatsApp</b> Anda.</li>
                    <li>Salin <b>API Token</b> dari menu Device Fonnte dan tempelkan pada kolom di bawah ini.</li>
                    <li>Di pengaturan device Fonnte, masukkan <b>Webhook URL</b>: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-mono text-[10px]">https://ekskul-iota.vercel.app/api/webhook</code></li>
                  </ol>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fonnte API Token <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={configs.fonnte_token || ''}
                    onChange={(e) => handleConfigChange('fonnte_token', e.target.value)}
                    placeholder="Contoh: a1b2c3d4e5f6g7h8..."
                    className="corporate-input w-full text-xs font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Token ini didapatkan dari dashboard Fonnte pada halaman Device Anda.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* PROVIDER 3: WABLAS (WHATSAPP)                                   */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {configs.gateway_provider === 'wablas' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Domain Server Wablas</label>
                  <input
                    type="text"
                    value={configs.wablas_url || ''}
                    onChange={(e) => handleConfigChange('wablas_url', e.target.value)}
                    placeholder="https://kudus.wablas.com (atau domain server Anda)"
                    className="corporate-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Wablas API Token</label>
                  <input
                    type="password"
                    value={configs.wablas_token || ''}
                    onChange={(e) => handleConfigChange('wablas_token', e.target.value)}
                    placeholder="Paste token Wablas Anda di sini"
                    className="corporate-input w-full text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Webhook Secret Key (Opsional)</label>
                  <input
                    type="text"
                    value={configs.wablas_secret || ''}
                    onChange={(e) => handleConfigChange('wablas_secret', e.target.value)}
                    placeholder="Secret key untuk validasi payload webhook"
                    className="corporate-input w-full text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* UJI COBA KIRIM PESAN REAL                                        */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {(configs.gateway_provider || 'telegram') === 'telegram' ? (
            /* Form Uji Kirim Telegram */
            <div className="corporate-card p-6 bg-white space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Uji Coba Kirim Pesan Telegram Nyata</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Kirim pesan uji coba ke akun Telegram Anda untuk memastikan token bot sudah benar:
                  </p>
                </div>
                <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Telegram Test
                </span>
              </div>

              {testTgResult && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold ${
                    testTgResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {testTgResult.message}
                </div>
              )}

              <form onSubmit={handleSendTestTelegram} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Chat ID Penerima <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={testTgChatId || configs.telegram_admin_chat_id || ''}
                      onChange={(e) => setTestTgChatId(e.target.value)}
                      placeholder="Contoh: 123456789"
                      className="corporate-input w-full font-mono text-xs font-bold"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Chat ID dari bot @userinfobot Anda di Telegram
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Isi Pesan Uji Coba</label>
                  <textarea
                    rows={2}
                    required
                    value={testTgMessage}
                    onChange={(e) => setTestTgMessage(e.target.value)}
                    className="corporate-input w-full text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingTgTest || !configs.telegram_bot_token}
                  className="corporate-btn-primary py-2 px-4 text-xs font-semibold bg-sky-600 hover:bg-sky-700 border-sky-600"
                >
                  {sendingTgTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Kirim Pesan Telegram</span>
                </button>
              </form>
            </div>
          ) : (
            /* Form Uji Kirim WhatsApp (Fonnte / Wablas) */
            <div className="corporate-card p-6 bg-white space-y-4 text-xs">
              <h3 className="font-bold text-slate-900 text-sm">Uji Coba Kirim WhatsApp Nyata</h3>
              <p className="text-slate-500 text-[11px]">
                Kirim pesan langsung ke nomor HP tertentu untuk memastikan gateway WhatsApp terhubung dengan baik:
              </p>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <form onSubmit={handleSendTestMessage} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nomor HP Tujuan (Format 62...)</label>
                    <input
                      type="text"
                      required
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="6281234567890"
                      className="corporate-input w-full font-mono text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Isi Pesan Uji Coba</label>
                  <textarea
                    rows={2}
                    required
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="corporate-input w-full text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingTest}
                  className="corporate-btn-primary py-2 px-4 text-xs font-semibold"
                >
                  {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Kirim Pesan Uji Coba</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Message Templates & Bank Info */}
      {activeTab === 'templates' && (
        <div className="corporate-card p-6 bg-white max-w-3xl space-y-5 text-xs">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Template Pesan Otomatis & Rekening
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pesan Sambutan Awal (Welcome Greeting)
              </label>
              <p className="text-[11px] text-slate-400 mb-1">Gunakan tag <code>{'{store_name}'}</code> untuk nama toko.</p>
              <textarea
                rows={5}
                value={configs.welcome_message || ''}
                onChange={(e) => handleConfigChange('welcome_message', e.target.value)}
                className="corporate-input w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Informasi Rekening Bank & QRIS Pembayaran
              </label>
              <p className="text-[11px] text-slate-400 mb-1">Teks ini dikirim saat invoice pemesanan terbit atau pelanggan ketik INFO.</p>
              <textarea
                rows={5}
                value={configs.bank_info || ''}
                onChange={(e) => handleConfigChange('bank_info', e.target.value)}
                className="corporate-input w-full text-xs font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Whitelist */}
      {activeTab === 'whitelist' && (
        <div className="corporate-card p-6 bg-white max-w-3xl space-y-5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Mode Whitelist (Testing Tertutup)</h2>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Jika diaktifkan, bot HANYA akan merespons nomor HP yang didaftarkan di bawah ini.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Status Whitelist:</span>
              <button
                onClick={() =>
                  handleConfigChange('whitelist_mode', configs.whitelist_mode === '1' ? '0' : '1')
                }
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  configs.whitelist_mode === '1'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {configs.whitelist_mode === '1' ? 'AKTIF' : 'NON-AKTIF'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                placeholder="Masukkan no HP (misal: 6281234567890)..."
                className="corporate-input flex-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleAddWhitelist}
                className="corporate-btn-primary py-2 px-4 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Nomor</span>
              </button>
            </div>

            <div className="space-y-2">
              <span className="font-semibold text-slate-600 block">
                Daftar Nomor yang Diizinkan ({whitelistList.length}):
              </span>
              {whitelistList.length === 0 ? (
                <p className="text-slate-400 italic py-2">Belum ada nomor di daftar whitelist.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {whitelistList.map((num) => (
                    <div
                      key={num}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>{num}</span>
                      <button
                        onClick={() => handleRemoveWhitelist(num)}
                        className="text-slate-400 hover:text-red-600 ml-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
