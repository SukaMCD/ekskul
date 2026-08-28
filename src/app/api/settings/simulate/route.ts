import { NextRequest, NextResponse } from 'next/server';
import { processInboundWebhook } from '@/lib/bot-engine';
import { getSessionUserFromRequest } from '@/lib/auth';
import BotLog from '@/models/BotLog';
import connectDB from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { phone, message } = await request.json();
    if (!phone || !message) {
      return NextResponse.json(
        { status: false, message: 'Nomor HP dan Pesan wajib diisi' },
        { status: 400 }
      );
    }

    const payload = {
      phone,
      message,
      messageType: 'text',
      fromMe: false,
      isGroup: false,
    };

    const beforeTime = new Date(Date.now() - 2000);
    const result = await processInboundWebhook(payload);

    // Fetch the recent outbound bot responses from BotLog
    await connectDB();
    const responses = await BotLog.find({
      direction: 'outbound',
      createdAt: { $gte: beforeTime },
    }).sort({ createdAt: 1 }).limit(5);

    return NextResponse.json({
      status: true,
      result,
      replies: responses.map((r) => ({
        message: r.messageBody || '',
        createdAt: r.createdAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
