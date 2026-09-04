// Native fetch used instead of axios for better Vercel serverless compatibility
import connectDB from './db';
import BotConfig from '@/models/BotConfig';
import BotLog from '@/models/BotLog';

export interface BotConfigMap {
  bot_active?: string;
  bot_name?: string;
  store_name?: string;
  store_address?: string;
  store_gmaps?: string;
  store_hours?: string;
  admin_phone?: string;
  gateway_provider?: 'fonnte' | 'wablas' | string;
  fonnte_token?: string;
  wablas_url?: string;
  wablas_token?: string;
  wablas_secret?: string;
  bank_info?: string;
  welcome_message?: string;
  whitelist_mode?: string;
  whitelist_numbers?: string;
  [key: string]: string | undefined;
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^\d]/g, '');
  if (!clean) return '';

  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

export function displayPhone(phone: string): string {
  const clean = normalizePhone(phone);
  if (clean.startsWith('62')) {
    return '0' + clean.slice(2);
  }
  return clean;
}

export async function getBotConfigs(): Promise<BotConfigMap> {
  await connectDB();
  const configs = await BotConfig.find({});
  const map: BotConfigMap = {
    bot_active: '1',
    bot_name: 'Resto Sedap Rasa Bot',
    store_name: 'Resto Sedap Rasa (UMKM Kuliner)',
    store_address: 'Jl. Boulevard Raya No. 88, Surabaya',
    store_gmaps: 'https://maps.google.com/?q=-7.2575,112.7521',
    store_hours: 'Senin - Minggu: 10.00 - 22.00 WIB',
    admin_phone: '6281234567890',
    gateway_provider: 'wablas',
    fonnte_token: process.env.FONNTE_TOKEN || 'KxciUKN8p3j5iUo3zaPT',
    wablas_url: 'https://sby.wablas.com',
    wablas_token: '',
    wablas_secret: 'fnb_secret_key_123',
    bank_info: `💳 *PEMBAYARAN TRANSFER / QRIS*\n• Bank BCA: *1234567890* a/n Resto Sedap Rasa\n• Bank BRI: *0987654321* a/n Resto Sedap Rasa\n• QRIS: (Ketik 'QRIS' untuk minta QR code)`,
    welcome_message: `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`,
    whitelist_mode: '0',
    whitelist_numbers: '',
  };

  configs.forEach((c) => {
    map[c.configKey] = c.configValue;
  });

  return map;
}

export async function setBotConfig(key: string, value: string): Promise<void> {
  await connectDB();
  await BotConfig.findOneAndUpdate(
    { configKey: key },
    { configKey: key, configValue: value },
    { upsert: true, new: true }
  );
}

export function getWhitelistNumbers(raw: string = ''): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,;\n]+/);
  const nums = parts
    .map((p) => normalizePhone(p.trim()))
    .filter((p) => p.length > 0);
  return Array.from(new Set(nums));
}

export async function isPhoneWhitelisted(phone: string, configs: BotConfigMap): Promise<boolean> {
  const isMode = configs.whitelist_mode === '1';
  if (!isMode) return true;

  const normalized = normalizePhone(phone);
  const adminPhone = normalizePhone(configs.admin_phone || '');
  if (normalized === adminPhone) return true;

  const allowed = getWhitelistNumbers(configs.whitelist_numbers || '');
  return allowed.includes(normalized);
}

export async function logBotMessage(
  phone: string | undefined,
  direction: 'inbound' | 'outbound',
  messageType: string,
  messageBody: string,
  rawPayload: string = '',
  status: string = 'success',
  statusCode: number | string = 200,
  errorMessage: string = ''
): Promise<void> {
  try {
    await connectDB();
    await BotLog.create({
      phone,
      direction,
      messageType,
      messageBody,
      rawPayload,
      status,
      statusCode,
      errorMessage,
    });
  } catch (err) {
    console.error('Failed to log bot message:', err);
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  configs?: BotConfigMap
): Promise<{ status: boolean; message?: string; response?: any; simulated?: boolean; statusCode?: number | string }> {
  const normPhone = normalizePhone(phone);
  if (!normPhone || !message) {
    return { status: false, message: 'Phone or message is empty' };
  }

  const cfg = configs || (await getBotConfigs());
  const provider = (cfg.gateway_provider || 'wablas').toLowerCase();

  // 1. Fonnte Gateway Provider (Default & Recommended)
  if (provider === 'fonnte') {
    const token = cfg.fonnte_token || process.env.FONNTE_TOKEN || cfg.wablas_token || '';
    if (!token) {
      await logBotMessage(normPhone, 'outbound', 'text', message, '', 'simulated_no_token', 200, 'Token Fonnte belum disetting di Pengaturan');
      return {
        status: true,
        message: 'Token Fonnte belum diisi. Pesan disimulasikan.',
        simulated: true,
        statusCode: 200,
      };
    }

    try {
      const params = new URLSearchParams();
      params.append('target', normPhone);
      params.append('message', message);
      params.append('countryCode', '62');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: token.trim(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let resData: any = {};
      try { resData = await res.json(); } catch { resData = { raw: await res.text().catch(() => '') }; }

      const isApiOk = res.ok && resData?.status !== false && resData?.status !== 'false';
      const statusCode = res.status || 200;
      const errMsg = !isApiOk ? resData?.reason || resData?.message || 'Fonnte Gagal Kirim Pesan' : '';

      await logBotMessage(normPhone, 'outbound', 'text', message, JSON.stringify(resData), isApiOk ? 'success' : 'failed', statusCode, errMsg);
      return { status: isApiOk, response: resData, statusCode, message: errMsg };
    } catch (err: any) {
      const errMsg = err.name === 'AbortError' ? 'Request timeout (15s)' : err.message;
      await logBotMessage(normPhone, 'outbound', 'text', message, errMsg, 'failed', 500, errMsg);
      return { status: false, message: errMsg, statusCode: 500 };
    }
  }

  // 2. Wablas Gateway Provider
  const token = cfg.wablas_token || process.env.WABLAS_TOKEN || '';
  const baseUrl = (cfg.wablas_url || process.env.WABLAS_DOMAIN || 'https://sby.wablas.com').replace(/\/+$/, '');

  if (!token) {
    await logBotMessage(normPhone, 'outbound', 'text', message, '', 'simulated_no_token', 200, 'Token Wablas belum disetting di Pengaturan');
    return {
      status: true,
      message: 'Token Wablas belum diisi. Pesan disimulasikan.',
      simulated: true,
      statusCode: 200,
    };
  }

  const authHeader = token.trim();
  const endpoint = `${baseUrl}/api/send-message`;

  try {
    const params = new URLSearchParams();
    params.append('phone', normPhone);
    params.append('message', message);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let resData: any = {};
    try { resData = await res.json(); } catch { resData = { raw: await res.text().catch(() => '') }; }

    const isApiOk = res.ok && resData?.status !== false && resData?.status !== 'false' && resData?.status !== 'error';
    const statusCode = res.status || 200;
    const errMsg = !isApiOk
      ? resData?.message || (typeof resData === 'string' ? resData : 'Wablas API Gagal Mengirim Pesan')
      : '';

    await logBotMessage(normPhone, 'outbound', 'text', message, JSON.stringify(resData), isApiOk ? 'success' : 'failed', statusCode, errMsg);
    return { status: isApiOk, response: resData, statusCode, message: errMsg };
  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Request timeout (15s) - Wablas tidak merespons' : err.message;
    await logBotMessage(normPhone, 'outbound', 'text', message, errMsg, 'failed', 500, errMsg);
    return { status: false, message: errMsg, statusCode: 500 };
  }
}

export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption: string = '',
  configs?: BotConfigMap
): Promise<{ status: boolean; message?: string; response?: any; simulated?: boolean; statusCode?: number | string }> {
  const normPhone = normalizePhone(phone);
  if (!normPhone || !imageUrl) {
    return { status: false, message: 'Phone or Image URL is empty' };
  }

  const cfg = configs || (await getBotConfigs());
  const provider = (cfg.gateway_provider || 'wablas').toLowerCase();

  // Fonnte Image Send
  if (provider === 'fonnte') {
    const token = cfg.fonnte_token || process.env.FONNTE_TOKEN || cfg.wablas_token || '';
    if (!token) {
      await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, '', 'simulated_no_token', 200, 'Token Fonnte belum disetting');
      return {
        status: true,
        message: 'Token Fonnte belum diisi. Gambar disimulasikan.',
        simulated: true,
        statusCode: 200,
      };
    }

    try {
      const params = new URLSearchParams();
      params.append('target', normPhone);
      params.append('url', imageUrl);
      params.append('caption', caption);
      params.append('countryCode', '62');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token.trim(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let resData: any = {};
      try { resData = await res.json(); } catch { resData = {}; }

      const isApiOk = res.ok && resData?.status !== false && resData?.status !== 'false';
      const statusCode = res.status || 200;
      const errMsg = !isApiOk ? resData?.reason || resData?.message || 'Fonnte Gagal Kirim Gambar' : '';

      await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, JSON.stringify(resData), isApiOk ? 'success' : 'failed', statusCode, errMsg);
      return { status: isApiOk, response: resData, statusCode, message: errMsg };
    } catch (err: any) {
      const errMsg = err.name === 'AbortError' ? 'Request timeout (15s)' : err.message;
      await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, errMsg, 'failed', 500, errMsg);
      return { status: false, message: errMsg, statusCode: 500 };
    }
  }

  // Wablas Image Send
  const token = cfg.wablas_token || process.env.WABLAS_TOKEN || '';
  const baseUrl = (cfg.wablas_url || process.env.WABLAS_DOMAIN || 'https://sby.wablas.com').replace(/\/+$/, '');

  if (!token) {
    await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, '', 'simulated_no_token', 200, 'Token Wablas belum disetting');
    return {
      status: true,
      message: 'Token not configured. Image simulated in log.',
      simulated: true,
      statusCode: 200,
    };
  }

  const authHeader = token.trim();
  const endpoint = `${baseUrl}/api/send-image`;

  try {
    const params = new URLSearchParams();
    params.append('phone', normPhone);
    params.append('image', imageUrl);
    params.append('caption', caption);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let resData: any = {};
    try { resData = await res.json(); } catch { resData = {}; }

    const isApiOk = res.ok && resData?.status !== false && resData?.status !== 'false';
    const statusCode = res.status || 200;
    const errMsg = !isApiOk ? resData?.message || 'Wablas Gagal Kirim Gambar' : '';

    await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, JSON.stringify(resData), isApiOk ? 'success' : 'failed', statusCode, errMsg);
    return { status: isApiOk, response: resData, statusCode, message: errMsg };
  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Request timeout (15s) - Wablas tidak merespons' : err.message;
    await logBotMessage(normPhone, 'outbound', 'image', `Image: ${imageUrl} | Caption: ${caption}`, errMsg, 'failed', 500, errMsg);
    return { status: false, message: errMsg, statusCode: 500 };
  }
}
