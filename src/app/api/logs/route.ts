import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BotLog from '@/models/BotLog';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');
    const status = searchParams.get('status');
    const search = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const filter: any = {};
    if (direction && direction !== 'all') {
      filter.direction = direction;
    }
    if (status && status !== 'all') {
      if (status === 'error' || status === 'failed') {
        filter.status = { $in: ['failed', 'error'] };
      } else {
        filter.status = status;
      }
    }
    if (search) {
      filter.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { messageBody: { $regex: search, $options: 'i' } },
        { rawPayload: { $regex: search, $options: 'i' } },
      ];
    }

    const [total, logs, totalInbound, totalOutbound, totalErrors] = await Promise.all([
      BotLog.countDocuments(filter),
      BotLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      BotLog.countDocuments({ direction: 'inbound' }),
      BotLog.countDocuments({ direction: 'outbound' }),
      BotLog.countDocuments({ status: { $in: ['failed', 'error'] } }),
    ]);

    return NextResponse.json({
      status: true,
      data: logs,
      stats: {
        total,
        totalInbound,
        totalOutbound,
        totalErrors,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
    await connectDB();
    await BotLog.deleteMany({});
    return NextResponse.json({ status: true, message: 'Semua riwayat log berhasil dibersihkan' });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
