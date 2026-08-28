import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BotConfig from '@/models/BotConfig';
import { getBotConfigs, setBotConfig } from '@/lib/wablas';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = await getBotConfigs();
    return NextResponse.json({ status: true, data: configs });
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
    await connectDB();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        await setBotConfig(key, value);
      }
    }

    const updated = await getBotConfigs();
    return NextResponse.json({
      status: true,
      message: 'Pengaturan berhasil disimpan!',
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
