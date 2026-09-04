import { NextRequest, NextResponse } from 'next/server';
import { processInboundWebhook } from '@/lib/bot-engine';
import { getBotConfigs } from '@/lib/wablas';

export async function GET(request: NextRequest) {
  try {
    const configs = await getBotConfigs();
    return NextResponse.json({
      status: true,
      app: 'F&B UMKM WhatsApp Bot (Next.js Fullstack)',
      bot_active: configs.bot_active === '1',
      server_time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let data: any = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await request.json().catch(() => ({}));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData().catch(() => null);
      if (formData) {
        formData.forEach((val, key) => {
          data[key] = val.toString();
        });
      }
    } else {
      const text = await request.text();
      try { data = JSON.parse(text); } catch { data = {}; }
    }

    if (!data || Object.keys(data).length === 0) {
      return new NextResponse('OK', { status: 200 });
    }

    // ─── Fonnte Webhook Format ─────────────────────────────────────────────
    // Fonnte sends: { device: "...", messages: [{ phone, message, type, fromMe, group, ... }] }
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      const results = await Promise.all(
        data.messages.map(async (msg: any) => {
          const normalized = {
            phone: msg.phone || msg.sender || '',
            message: msg.message || msg.text || '',
            messageType: msg.type || 'text',
            fromMe: msg.fromMe === 'true' || msg.fromMe === true,
            isGroup: msg.group === 'true' || msg.group === true,
            pushName: msg.pushname || msg.name || '',
            file: msg.file || null,
          };
          return processInboundWebhook(normalized);
        })
      );
      return NextResponse.json({ status: true, processed: results.length });
    }

    // ─── Wablas Webhook Format ─────────────────────────────────────────────
    // Wablas sends flat object: { phone, message, messageType, fromMe, ... }
    const result = await processInboundWebhook(data);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Webhook error:', error);
    try {
      const { logBotMessage } = await import('@/lib/wablas');
      await logBotMessage('system', 'inbound', 'error', `Webhook Error: ${error.message}`, error.stack || '', 'failed');
    } catch {}
    return new NextResponse('OK', { status: 200 }); // Always 200 to prevent retries
  }
}
