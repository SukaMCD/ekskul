import { NextRequest, NextResponse } from 'next/server';
import { processInboundWebhook } from '@/lib/bot-engine';
import { getSessionUserFromRequest } from '@/lib/auth';
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

    // Test DB connection first
    try {
      await connectDB();
    } catch (dbErr: any) {
      const errMsg = `❌ *[Error DB]* Koneksi database gagal!\n\n${dbErr.message}\n\n_Pastikan MONGODB_URI sudah diset di environment variables Vercel._`;
      return NextResponse.json({
        status: true,
        result: { status: false, message: 'DB Connection Failed' },
        replies: [{ message: errMsg, createdAt: new Date() }],
      });
    }

    const payload = {
      phone,
      message,
      messageType: 'text',
      fromMe: false,
      isGroup: false,
    };

    let result: any;
    try {
      result = await processInboundWebhook(payload, true);
    } catch (engineErr: any) {
      const errMsg = `❌ *[Error Bot Engine]*\n\n${engineErr.message}\n\nStack: ${engineErr.stack?.slice(0, 200) || 'N/A'}`;
      return NextResponse.json({
        status: true,
        result: { status: false, message: engineErr.message },
        replies: [{ message: errMsg, createdAt: new Date() }],
      });
    }

    // Build replies array
    const rawReplies: string[] = result.replies || [];
    let replies: { message: string; createdAt: Date }[] = rawReplies
      .filter((r) => r && r.trim().length > 0)
      .map((msg) => ({ message: msg, createdAt: new Date() }));

    // If empty, add informative fallback
    if (replies.length === 0) {
      let fallback = '';
      if (result.message === 'User is paused') {
        fallback = '⚠️ *[Info Simulator]*: Sesi nomor ini sedang dijeda (*PAUSED*).\n\n👉 Klik tombol *Reset Chat* atau ketik *BATAL* untuk aktifkan kembali.';
      } else if (result.message === 'Bot Inactive Globally') {
        fallback = '⚠️ *[Info Simulator]*: Bot saat ini *PAUSE/NON-AKTIF* secara global. Aktifkan dari tombol status di kiri atas.';
      } else if (result.message === 'Phone not whitelisted') {
        fallback = '⚠️ *[Info Simulator]*: Mode Whitelist aktif dan nomor ini belum terdaftar. Daftarkan di tab Whitelist atau nonaktifkan mode Whitelist.';
      } else {
        fallback = `⚠️ *[Info Simulator]*: Bot memproses pesan tapi tidak ada balasan yang dihasilkan.\n\nStatus internal: _${result.message || 'unknown'}_\n\nCek tab *Log & Sesi Chat* untuk detail.`;
      }
      replies = [{ message: fallback, createdAt: new Date() }];
    }

    return NextResponse.json({ status: true, result, replies });
  } catch (error: any) {
    const errMsg = `❌ *[Error Server]* Terjadi kegagalan sistem:\n\n${error.message}`;
    return NextResponse.json({
      status: true,
      result: { status: false, message: error.message },
      replies: [{ message: errMsg, createdAt: new Date() }],
    });
  }
}
