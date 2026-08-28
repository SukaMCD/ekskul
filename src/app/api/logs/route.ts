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
    const search = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const filter: any = {};
    if (direction && direction !== 'all') {
      filter.direction = direction;
    }
    if (search) {
      filter.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { messageBody: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await BotLog.countDocuments(filter);
    const logs = await BotLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return NextResponse.json({
      status: true,
      data: logs,
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
