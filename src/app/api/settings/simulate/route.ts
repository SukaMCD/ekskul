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

    const result = await processInboundWebhook(payload, true);

    let replies = (result.replies || []).map((msg) => ({
      message: msg,
      createdAt: new Date(),
    }));

    if (replies.length === 0) {
      if (result.message === 'User is paused') {
        replies = [
          {
            message: '⚠️ *[Info Simulator]*: Sesi nomor ini sedang dijeda (*PAUSED*) karena perintah ADMIN sebelumnya.\n\n👉 Klik tombol *Reset Chat* di atas atau ketik *BATAL* untuk mengaktifkan sesi bot kembali.',
            createdAt: new Date(),
          },
        ];
      } else if (result.message === 'Bot Inactive Globally') {
        replies = [
          {
            message: '⚠️ *[Info Simulator]*: Bot saat ini sedang berstatus *PAUSE/NON-AKTIF* secara global. Silakan aktifkan bot melalui tombol status di kiri atas.',
            createdAt: new Date(),
          },
        ];
      } else if (result.message === 'Phone not whitelisted') {
        replies = [
          {
            message: '⚠️ *[Info Simulator]*: Mode Whitelist aktif dan nomor penguji ini belum terdaftar di whitelist. Daftarkan nomor ini di tab Whitelist atau nonaktifkan mode Whitelist.',
            createdAt: new Date(),
          },
        ];
      }
    }

    return NextResponse.json({
      status: true,
      result,
      replies,
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
