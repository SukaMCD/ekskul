import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/Order';
import Menu from '@/models/Menu';
import BotSession from '@/models/BotSession';
import BotLog from '@/models/BotLog';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await Order.find({ createdAt: { $gte: todayStart } });
    const todayRevenue = todayOrders
      .filter((o) => o.orderStatus !== 'cancelled')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);

    const pendingOrdersCount = await Order.countDocuments({ orderStatus: 'pending' });
    const activeOrdersCount = await Order.countDocuments({
      orderStatus: { $in: ['pending', 'confirmed', 'cooking', 'ready'] },
    });

    const totalMenuCount = await Menu.countDocuments({});
    const activeMenuCount = await Menu.countDocuments({ isAvailable: true });
    const totalSessions = await BotSession.countDocuments({});
    const activeTodayLogs = await BotLog.countDocuments({ createdAt: { $gte: todayStart } });

    // Recent 5 orders
    const recentOrders = await Order.find({}).sort({ createdAt: -1 }).limit(5);

    // Recent 5 bot logs
    const recentLogs = await BotLog.find({}).sort({ createdAt: -1 }).limit(8);

    return NextResponse.json({
      status: true,
      data: {
        todayRevenue,
        todayOrdersCount: todayOrders.length,
        pendingOrdersCount,
        activeOrdersCount,
        totalMenuCount,
        activeMenuCount,
        totalSessions,
        activeTodayLogs,
        recentOrders,
        recentLogs,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
