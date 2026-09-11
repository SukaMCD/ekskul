import { NextRequest, NextResponse } from 'next/server';
import { processInboundWebhook } from '@/lib/bot-engine';
import { getBotConfigs, logBotMessage } from '@/lib/wablas';
import { parseTelegramUpdate, getTelegramToken } from '@/lib/telegram';

export async function GET(request: NextRequest) {
  try {
    const configs = await getBotConfigs();
    const token = await getTelegramToken(configs);

    return NextResponse.json({
      status: true,
      service: 'Telegram Webhook Bot Engine',
      bot_active: configs.bot_active === '1',
      token_configured: Boolean(token),
      gateway_provider: configs.gateway_provider || 'telegram',
      server_time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const update = await request.json().catch(() => null);

    if (!update) {
      return NextResponse.json({ ok: true, ignored: 'Empty payload' });
    }

    const configs = await getBotConfigs();
    const token = await getTelegramToken(configs);

    // Parse Update Telegram menjadi format seragam InboundPayload
    const inbound = await parseTelegramUpdate(update, token);
    if (!inbound) {
      return NextResponse.json({ ok: true, ignored: 'No supported message/callback' });
    }

    // Jalankan bot engine
    const result = await processInboundWebhook(inbound);
    return NextResponse.json({ ok: true, ...result });

  } catch (error: any) {
    console.error('Telegram Webhook error:', error);
    try {
      await logBotMessage('system', 'inbound', 'error', `Telegram Webhook Error: ${error.message}`, error.stack || '', 'failed');
    } catch {}
    // Selalu respon HTTP 200 ke Telegram agar server Telegram tidak melakukan retry looping
    return NextResponse.json({ ok: true, error: error.message });
  }
}
