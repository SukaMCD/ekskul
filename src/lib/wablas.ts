import axios from 'axios';
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
  const token = cfg.wablas_token || process.env.WABLAS_TOKEN || '';
  const secretKey = cfg.wablas_secret || process.env.WABLAS_SECRET || '';
  const baseUrl = (cfg.wablas_url || process.env.WABLAS_DOMAIN || 'https://sby.wablas.com').replace(/\/+$/, '');

  if (!token) {
    await logBotMessage(normPhone, 'outbound', 'text', message, '', 'simulated_no_token', 200, 'Token Wablas belum disetting di Pengaturan');
    return {
      status: true,
      message: 'Token not configured. Message simulated in log.',
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

    const res = await axios.post(endpoint, params.toString(), {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    const isApiOk =
      res.status >= 200 &&
      res.status < 300 &&
      res.data?.status !== false &&
      res.data?.status !== 'false' &&
      res.data?.status !== 'error';

    const statusCode = res.status || 200;
    const errMsg =
      !isApiOk
        ? res.data?.message || (typeof res.data === 'string' ? res.data : 'Wablas API Gagal Mengirim Pesan')
        : '';

    await logBotMessage(
      normPhone,
      'outbound',
      'text',
      message,
      JSON.stringify(res.data),
      isApiOk ? 'success' : 'failed',
      statusCode,
      errMsg
    );

    return { status: isApiOk, response: res.data, statusCode, message: errMsg };
  } catch (err: any) {
    const statusCode = err.response?.status || err.code || 500;
    const errorBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const errMsg = err.response?.data?.message || err.message;
    await logBotMessage(normPhone, 'outbound', 'text', message, errorBody, 'failed', statusCode, errMsg);
    return { status: false, message: errMsg, response: err.response?.data, statusCode };
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

    const res = await axios.post(endpoint, params.toString(), {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    const isApiOk =
      res.status >= 200 &&
      res.status < 300 &&
      res.data?.status !== false &&
      res.data?.status !== 'false';

    const statusCode = res.status || 200;
    const errMsg = !isApiOk ? res.data?.message || 'Wablas Gagal Kirim Gambar' : '';

    await logBotMessage(
      normPhone,
      'outbound',
      'image',
      `Image: ${imageUrl} | Caption: ${caption}`,
      JSON.stringify(res.data),
      isApiOk ? 'success' : 'failed',
      statusCode,
      errMsg
    );

    return { status: isApiOk, response: res.data, statusCode, message: errMsg };
  } catch (err: any) {
    const statusCode = err.response?.status || err.code || 500;
    const errorBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const errMsg = err.response?.data?.message || err.message;
    await logBotMessage(
      normPhone,
      'outbound',
      'image',
      `Image: ${imageUrl} | Caption: ${caption}`,
      errorBody,
      'failed',
      statusCode,
      errMsg
    );
    return { status: false, message: errMsg, response: err.response?.data, statusCode };
  }
}
