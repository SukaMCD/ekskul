import connectDB from './db';
import { getBotConfigs, logBotMessage, BotConfigMap } from './wablas';

export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Mendapatkan token Telegram dari konfigurasi atau environment
 */
export async function getTelegramToken(configs?: BotConfigMap): Promise<string> {
  const cfg = configs || (await getBotConfigs());
  return (cfg.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

export interface TelegramSendOptions {
  reply_markup?: any;
  parse_mode?: 'Markdown' | 'HTML';
}

export const TELEGRAM_MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '🍽️ Lihat Menu' }, { text: '📝 Pesan (ORDER)' }],
    [{ text: '📋 Cek Status' }, { text: 'ℹ️ Info Resto' }],
    [{ text: '👨‍💼 Bantuan Admin' }, { text: '❌ Batal' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const TELEGRAM_ORDER_TYPE_KEYBOARD = {
  keyboard: [
    [{ text: '🍽️ 1. Makan di Tempat (Dine-In)' }],
    [{ text: '🛍️ 2. Bungkus (Takeaway)' }],
    [{ text: '🛵 3. Pesan Antar (Delivery)' }],
    [{ text: '❌ Batal' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export const TELEGRAM_CONFIRM_KEYBOARD = {
  keyboard: [
    [{ text: '✅ YA, Buat Pesanan' }],
    [{ text: '❌ Batal' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export const TELEGRAM_CANCEL_KEYBOARD = {
  keyboard: [
    [{ text: '❌ Batal' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

/**
 * Mengatur menu command biru [Menu] di sebelah kiri kolom ketik chat Telegram
 */
export async function setTelegramBotCommands(
  tokenOverride?: string
): Promise<{ ok: boolean; message?: string; data?: any }> {
  const token = (tokenOverride || (await getTelegramToken())).trim();
  if (!token) return { ok: false, message: 'No token' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Mulai bot & buka menu utama' },
          { command: 'menu', description: 'Katalog menu makanan & minuman' },
          { command: 'order', description: 'Buat pesanan makanan baru' },
          { command: 'status', description: 'Cek status pesanan Anda' },
          { command: 'info', description: 'Info lokasi, jam & rekening' },
          { command: 'admin', description: 'Hubungi admin/staf resto' },
          { command: 'batal', description: 'Batalkan pesanan yang sedang dibuat' },
        ],
      }),
    });
    const data = await res.json();
    return { ok: data.ok, message: data.description, data };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

/**
 * Mengirim pesan teks ke Telegram Chat ID dengan dukungan Reply Keyboard / Buttons
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  configs?: BotConfigMap,
  options?: TelegramSendOptions
): Promise<{
  status: boolean;
  message?: string;
  response?: any;
  simulated?: boolean;
  statusCode?: number | string;
}> {
  const targetChatId = String(chatId).trim();
  if (!targetChatId || !text) {
    return { status: false, message: 'Chat ID or text is empty' };
  }

  const token = await getTelegramToken(configs);
  if (!token) {
    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_text',
      text,
      '',
      'simulated_no_token',
      200,
      'Telegram Bot Token belum disetting di Pengaturan'
    );
    return {
      status: true,
      message: 'Telegram Bot Token belum diisi. Pesan disimulasikan.',
      simulated: true,
      statusCode: 200,
    };
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  const bodyPayload: any = {
    chat_id: targetChatId,
    text: text,
    parse_mode: options?.parse_mode || 'Markdown',
    reply_markup: options?.reply_markup || TELEGRAM_MAIN_KEYBOARD,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // Pertama coba kirim dengan parse_mode Markdown
    let res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let resData: TelegramApiResponse = await res.json().catch(() => ({ ok: false }));

    // Jika gagal karena parse entity markdown, kirim ulang sebagai plain text
    if (!resData.ok && resData.description && /can't parse entities|character/i.test(resData.description)) {
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 15000);

      const retryPayload: any = {
        chat_id: targetChatId,
        text: text,
        reply_markup: bodyPayload.reply_markup,
      };

      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryPayload),
        signal: retryController.signal,
      });
      clearTimeout(retryTimeoutId);
      resData = await res.json().catch(() => ({ ok: false }));
    }

    const isOk = res.ok && resData.ok === true;
    const statusCode = res.status || (isOk ? 200 : 400);
    const errMsg = !isOk ? resData.description || 'Gagal mengirim pesan Telegram' : '';

    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_text',
      text,
      JSON.stringify(resData),
      isOk ? 'success' : 'failed',
      statusCode,
      errMsg
    );

    return {
      status: isOk,
      response: resData,
      statusCode,
      message: errMsg,
    };
  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Request timeout (15s) ke Telegram API' : err.message;
    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_text',
      text,
      errMsg,
      'failed',
      500,
      errMsg
    );
    return { status: false, message: errMsg, statusCode: 500 };
  }
}

/**
 * Mengirim gambar/foto ke Telegram
 */
export async function sendTelegramPhoto(
  chatId: string | number,
  photoUrl: string,
  caption: string = '',
  configs?: BotConfigMap
): Promise<{
  status: boolean;
  message?: string;
  response?: any;
  simulated?: boolean;
  statusCode?: number | string;
}> {
  const targetChatId = String(chatId).trim();
  if (!targetChatId || !photoUrl) {
    return { status: false, message: 'Chat ID or photo URL is empty' };
  }

  const token = await getTelegramToken(configs);
  if (!token) {
    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_image',
      `Photo: ${photoUrl} | Caption: ${caption}`,
      '',
      'simulated_no_token',
      200,
      'Telegram Bot Token belum disetting'
    );
    return {
      status: true,
      message: 'Token Telegram belum diisi. Foto disimulasikan.',
      simulated: true,
      statusCode: 200,
    };
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendPhoto`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'Markdown',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let resData: TelegramApiResponse = await res.json().catch(() => ({ ok: false }));

    // Fallback tanpa markdown jika entity error
    if (!resData.ok && resData.description && /can't parse entities/i.test(resData.description)) {
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 15000);

      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: photoUrl,
          caption: caption,
        }),
        signal: retryController.signal,
      });
      clearTimeout(retryTimeoutId);
      resData = await res.json().catch(() => ({ ok: false }));
    }

    const isOk = res.ok && resData.ok === true;
    const statusCode = res.status || (isOk ? 200 : 400);
    const errMsg = !isOk ? resData.description || 'Gagal mengirim foto Telegram' : '';

    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_image',
      `Photo: ${photoUrl} | Caption: ${caption}`,
      JSON.stringify(resData),
      isOk ? 'success' : 'failed',
      statusCode,
      errMsg
    );

    return {
      status: isOk,
      response: resData,
      statusCode,
      message: errMsg,
    };
  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Request timeout ke Telegram API' : err.message;
    await logBotMessage(
      targetChatId,
      'outbound',
      'telegram_image',
      `Photo: ${photoUrl} | Caption: ${caption}`,
      errMsg,
      'failed',
      500,
      errMsg
    );
    return { status: false, message: errMsg, statusCode: 500 };
  }
}

/**
 * Mendaftarkan URL Webhook ke Telegram Bot API
 */
export async function setTelegramWebhook(
  webhookUrl: string,
  tokenOverride?: string
): Promise<{ ok: boolean; message: string; data?: any }> {
  const token = (tokenOverride || (await getTelegramToken())).trim();
  if (!token) {
    return { ok: false, message: 'Telegram Bot Token belum diatur.' };
  }

  if (!webhookUrl || !webhookUrl.startsWith('https://')) {
    return { ok: false, message: 'Webhook URL harus berupa HTTPS yang valid.' };
  }

  try {
    const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });

    const resData: TelegramApiResponse = await res.json();
    if (resData.ok) {
      return { ok: true, message: 'Webhook Telegram berhasil didaftarkan!', data: resData };
    } else {
      return {
        ok: false,
        message: resData.description || 'Gagal mengatur webhook di Telegram.',
        data: resData,
      };
    }
  } catch (err: any) {
    return { ok: false, message: `Koneksi gagal: ${err.message}` };
  }
}

/**
 * Cek status info webhook Telegram
 */
export async function getTelegramWebhookInfo(
  tokenOverride?: string
): Promise<{ ok: boolean; info?: any; message?: string }> {
  const token = (tokenOverride || (await getTelegramToken())).trim();
  if (!token) {
    return { ok: false, message: 'Telegram Bot Token belum diatur.' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data: TelegramApiResponse = await res.json();
    if (data.ok) {
      return { ok: true, info: data.result };
    }
    return { ok: false, message: data.description };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

/**
 * Mendapatkan URL langsung file (gambar/bukti transfer) dari file_id Telegram
 */
export async function getTelegramFileUrl(
  fileId: string,
  tokenOverride?: string
): Promise<string | null> {
  const token = (tokenOverride || (await getTelegramToken())).trim();
  if (!token || !fileId) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data: TelegramApiResponse<{ file_id: string; file_path: string }> = await res.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
    }
    return null;
  } catch (err) {
    console.error('Error fetching Telegram file:', err);
    return null;
  }
}

/**
 * Parser payload Update dari Telegram Webhook menjadi InboundPayload seragam untuk Bot Engine
 */
export async function parseTelegramUpdate(update: any, tokenOverride?: string): Promise<any | null> {
  if (!update || typeof update !== 'object') return null;

  const msg = update.message || update.edited_message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (!msg && !from) return null;

  const chatId = String(msg?.chat?.id || from?.id || '');
  if (!chatId) return null;

  const chatType = msg?.chat?.type;
  const isGroup = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel';

  let text = '';
  if (update.callback_query?.data) {
    text = update.callback_query.data;
  } else if (typeof msg?.text === 'string') {
    text = msg.text;
  } else if (typeof msg?.caption === 'string') {
    text = msg.caption;
  }

  // Handle Telegram Photos (bukti transfer / gambar)
  let photoUrl = '';
  if (Array.isArray(msg?.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    if (largestPhoto?.file_id) {
      photoUrl = (await getTelegramFileUrl(largestPhoto.file_id, tokenOverride)) || '';
    }
  }

  const nameParts = [from?.first_name, from?.last_name].filter(Boolean);
  const pushName = nameParts.length > 0 ? nameParts.join(' ') : (from?.username ? `@${from.username}` : `User #${chatId}`);

  return {
    platform: 'telegram',
    chatId: chatId,
    phone: chatId, // Gunakan Chat ID sebagai identitas unik session
    message: text,
    text: text,
    caption: msg?.caption || '',
    messageType: photoUrl ? 'image' : 'text',
    type: photoUrl ? 'image' : 'text',
    file: photoUrl,
    image: photoUrl,
    pushName: pushName,
    username: from?.username || '',
    isGroup: isGroup,
  };
}
