import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/Order';
import BotSession from '@/models/BotSession';
import BotLog from '@/models/BotLog';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getBotConfigs, sendWhatsAppMessage, normalizePhone, displayPhone } from '@/lib/wablas';
import { sendTelegramMessage } from '@/lib/telegram';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    // 1. Ambil kontak unik dari Order
    const orders = await Order.find({}, 'customerPhone customerName grandTotal paymentStatus orderType').lean();
    // 2. Ambil kontak dari BotSession
    const sessions = await BotSession.find({}, 'phone tempData').lean();

    const recipientMap = new Map<string, { phone: string; name: string; channel: 'telegram' | 'whatsapp'; spent: number; orderType: string }>();

    for (const ord of orders) {
      const p = String(ord.customerPhone || '').trim();
      if (!p) continue;
      const isTelegram = p.startsWith('tg_') || (!p.startsWith('62') && !p.startsWith('08') && p.length < 13);
      const isPaid = ord.paymentStatus === 'paid' || ord.paymentStatus === 'verified';
      const existing = recipientMap.get(p);
      const spent = (existing?.spent || 0) + (isPaid ? (ord.grandTotal || 0) : 0);
      recipientMap.set(p, {
        phone: p,
        name: ord.customerName || existing?.name || 'Pelanggan',
        channel: isTelegram ? 'telegram' : 'whatsapp',
        spent,
        orderType: ord.orderType || 'delivery',
      });
    }

    for (const s of sessions) {
      const p = String(s.phone || '').trim();
      if (!p || recipientMap.has(p)) continue;
      const isTelegram = p.startsWith('tg_') || (!p.startsWith('62') && !p.startsWith('08') && p.length < 13);
      recipientMap.set(p, {
        phone: p,
        name: s.tempData?.customerName || 'Pelanggan',
        channel: isTelegram ? 'telegram' : 'whatsapp',
        spent: 0,
        orderType: 'delivery',
      });
    }

    const allRecipients = Array.from(recipientMap.values());
    const telegramCount = allRecipients.filter((r) => r.channel === 'telegram').length;
    const whatsappCount = allRecipients.filter((r) => r.channel === 'whatsapp').length;
    const vipCount = allRecipients.filter((r) => r.spent >= 300000).length;

    // Ambil riwayat broadcast sebelumnya
    const recentBroadcasts = await BotLog.find({ messageType: 'broadcast' })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      status: true,
      data: {
        counts: {
          all: allRecipients.length,
          telegram: telegramCount,
          whatsapp: whatsappCount,
          vip: vipCount,
        },
        recentBroadcasts,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      channel = 'all', // 'all' | 'telegram' | 'whatsapp'
      targetTier = 'all', // 'all' | 'vip' (Gold & Platinum)
      message = '',
    } = body;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { status: false, message: 'Pesan broadcast tidak boleh kosong' },
        { status: 400 }
      );
    }

    await connectDB();
    const configs = await getBotConfigs();

    // 1. Ambil kontak unik dari Order & Session
    const orders = await Order.find({}, 'customerPhone customerName grandTotal paymentStatus').lean();
    const sessions = await BotSession.find({}, 'phone tempData').lean();

    const recipientMap = new Map<string, { phone: string; name: string; channel: 'telegram' | 'whatsapp'; spent: number }>();

    for (const ord of orders) {
      const p = String(ord.customerPhone || '').trim();
      if (!p) continue;
      const isTelegram = p.startsWith('tg_') || (!p.startsWith('62') && !p.startsWith('08') && p.length < 13);
      const isPaid = ord.paymentStatus === 'paid' || ord.paymentStatus === 'verified';
      const existing = recipientMap.get(p);
      const spent = (existing?.spent || 0) + (isPaid ? (ord.grandTotal || 0) : 0);
      recipientMap.set(p, {
        phone: p,
        name: ord.customerName || existing?.name || 'Kak',
        channel: isTelegram ? 'telegram' : 'whatsapp',
        spent,
      });
    }

    for (const s of sessions) {
      const p = String(s.phone || '').trim();
      if (!p || recipientMap.has(p)) continue;
      const isTelegram = p.startsWith('tg_') || (!p.startsWith('62') && !p.startsWith('08') && p.length < 13);
      recipientMap.set(p, {
        phone: p,
        name: s.tempData?.customerName || 'Kak',
        channel: isTelegram ? 'telegram' : 'whatsapp',
        spent: 0,
      });
    }

    let targets = Array.from(recipientMap.values());

    // Filter berdasarkan channel
    if (channel === 'telegram') {
      targets = targets.filter((r) => r.channel === 'telegram');
    } else if (channel === 'whatsapp') {
      targets = targets.filter((r) => r.channel === 'whatsapp');
    }

    // Filter berdasarkan tier/spent
    if (targetTier === 'vip') {
      targets = targets.filter((r) => r.spent >= 300000);
    }

    if (targets.length === 0) {
      return NextResponse.json({
        status: false,
        message: 'Tidak ada nomor/kontak penerima yang sesuai dengan target filter yang dipilih.',
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    // Kirim pesan secara berurutan dengan pacing (throttling 80ms)
    for (const target of targets) {
      const personalizedMessage = message.replace(/\{\{name\}\}/gi, target.name || 'Kak');

      try {
        if (target.channel === 'telegram') {
          // Bersihkan awalan tg_ jika ada
          const chatId = target.phone.replace(/^tg_/, '');
          const res = await sendTelegramMessage(chatId, personalizedMessage, configs);
          if (res.status) {
            sentCount++;
          } else {
            failedCount++;
          }
        } else {
          // WhatsApp
          const res = await sendWhatsAppMessage(target.phone, personalizedMessage, configs);
          if (res.status) {
            sentCount++;
          } else {
            failedCount++;
          }
        }
      } catch (err) {
        failedCount++;
      }

      // Beri jeda sejenak untuk mencegah rate-limit
      await sleep(80);
    }

    // Catat log ringkasan broadcast
    await BotLog.create({
      phone: `BROADCAST (${targets.length} penerima)`,
      direction: 'outbound',
      messageType: 'broadcast',
      messageBody: `[BROADCAST ${channel.toUpperCase()}] ${message.slice(0, 120)}... (Berhasil: ${sentCount}, Gagal: ${failedCount})`,
      rawPayload: JSON.stringify({ channel, targetTier, totalTargets: targets.length, sentCount, failedCount }),
      status: failedCount === 0 ? 'success' : 'partial',
      statusCode: 200,
    });

    return NextResponse.json({
      status: true,
      message: `Broadcast berhasil dikirim ke ${sentCount} dari ${targets.length} pelanggan!`,
      data: {
        totalTargets: targets.length,
        sentCount,
        failedCount,
      },
    });
  } catch (error: any) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
