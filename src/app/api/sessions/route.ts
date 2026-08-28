import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BotSession from '@/models/BotSession';
import { getSessionUserFromRequest } from '@/lib/auth';
import { normalizePhone } from '@/lib/wablas';

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const sessions = await BotSession.find({}).sort({ updatedAt: -1 }).limit(100);
    return NextResponse.json({ status: true, data: sessions });
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
    const { phone, isPaused } = await request.json();
    const normPhone = normalizePhone(phone);
    if (!normPhone) {
      return NextResponse.json({ status: false, message: 'Nomor HP tidak valid' }, { status: 400 });
    }

    await connectDB();
    const session = await BotSession.findOneAndUpdate(
      { phone: normPhone },
      {
        isPaused: Boolean(isPaused),
        pausedAt: isPaused ? new Date() : null,
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      status: true,
      message: `Bot untuk ${normPhone} berhasil di-${isPaused ? 'pause' : 'aktifkan'}!`,
      data: session,
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    await connectDB();
    if (phone) {
      const normPhone = normalizePhone(phone);
      await BotSession.deleteOne({ phone: normPhone });
      return NextResponse.json({ status: true, message: `Sesi nomor ${normPhone} berhasil direset` });
    } else {
      await BotSession.deleteMany({});
      return NextResponse.json({ status: true, message: 'Semua sesi percakapan berhasil dibersihkan' });
    }
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
