import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook, getTelegramWebhookInfo } from '@/lib/telegram';
import { getBotConfigs, setBotConfig } from '@/lib/wablas';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || undefined;

    const res = await getTelegramWebhookInfo(token);
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let { webhookUrl, token } = body;

    const configs = await getBotConfigs();
    const botToken = (token || configs.telegram_bot_token || '').trim();

    if (!botToken) {
      return NextResponse.json(
        { ok: false, message: 'Telegram Bot Token belum diisi di Pengaturan.' },
        { status: 400 }
      );
    }

    // Jika webhookUrl tidak diberikan, gunakan default dari host request
    if (!webhookUrl) {
      const host = request.headers.get('host') || 'ekskul-iota.vercel.app';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      webhookUrl = `${protocol}://${host}/api/webhook/telegram`;
    }

    if (!webhookUrl.startsWith('https://')) {
      return NextResponse.json(
        { ok: false, message: 'Telegram mensyaratkan Webhook URL menggunakan protokol HTTPS (SSL).' },
        { status: 400 }
      );
    }

    const result = await setTelegramWebhook(webhookUrl, botToken);

    if (result.ok) {
      await setBotConfig('telegram_webhook_url', webhookUrl);
      if (token) {
        await setBotConfig('telegram_bot_token', token);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
}
