import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/Order';
import BotSession from '@/models/BotSession';
import { getSessionUserFromRequest } from '@/lib/auth';
import { displayPhone } from '@/lib/wablas';

export interface CustomerProfile {
  id: string;
  phone: string;
  displayPhone: string;
  name: string;
  channel: 'telegram' | 'whatsapp';
  totalOrders: number;
  totalSpent: number;
  orderTypes: string[];
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  addresses: string[];
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  status: 'active' | 'idle' | 'inactive';
}

export async function GET(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';
    const tierFilter = searchParams.get('tier') || 'all';
    const channelFilter = searchParams.get('channel') || 'all';

    // 1. Agregasi data dari Orders
    const orderAgg = await Order.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$customerPhone',
          name: { $first: '$customerName' },
          totalOrders: { $sum: 1 },
          paidOrders: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, 1, 0]
            }
          },
          totalSpent: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', ['paid', 'verified']] }, '$grandTotal', 0]
            }
          },
          orderTypes: { $addToSet: '$orderType' },
          addresses: { $addToSet: '$deliveryAddress' },
          lastOrderAt: { $first: '$createdAt' },
          firstOrderAt: { $last: '$createdAt' },
          recentInvoices: { $push: '$invoiceNo' },
        }
      }
    ]);

    // 2. Ambil sesi bot untuk menangkap kontak yang belum pernah order
    const sessions = await BotSession.find({}).sort({ updatedAt: -1 }).lean();
    const sessionMap = new Map<string, any>();
    sessions.forEach(s => {
      if (s.phone) sessionMap.set(String(s.phone).trim(), s);
    });

    const customerMap = new Map<string, CustomerProfile>();

    // Proses data dari pesanan
    for (const item of orderAgg) {
      const rawPhone = String(item._id || '').trim();
      if (!rawPhone) continue;

      const isTelegram = rawPhone.startsWith('tg_') || /^\d{8,12}$/.test(rawPhone) && !rawPhone.startsWith('62') && !rawPhone.startsWith('08');
      const channel: 'telegram' | 'whatsapp' = isTelegram ? 'telegram' : 'whatsapp';
      const cleanAddresses = (item.addresses || []).filter((a: string) => Boolean(a && a.trim()));

      const spent = item.totalSpent || 0;
      const count = item.totalOrders || 0;

      let tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze' = 'Bronze';
      if (spent >= 1000000 || count >= 10) {
        tier = 'Platinum';
      } else if (spent >= 350000 || count >= 5) {
        tier = 'Gold';
      } else if (spent >= 100000 || count >= 2) {
        tier = 'Silver';
      }

      // Status keaktifan berdasarkan order terakhir (30 hari = active, 90 hari = idle, >90 = inactive)
      let status: 'active' | 'idle' | 'inactive' = 'active';
      if (item.lastOrderAt) {
        const diffDays = (Date.now() - new Date(item.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 60) status = 'inactive';
        else if (diffDays > 21) status = 'idle';
      }

      customerMap.set(rawPhone, {
        id: rawPhone,
        phone: rawPhone,
        displayPhone: isTelegram ? `Telegram ID: ${rawPhone.replace('tg_', '')}` : displayPhone(rawPhone),
        name: item.name || 'Pelanggan Leafly',
        channel,
        totalOrders: count,
        totalSpent: spent,
        orderTypes: item.orderTypes || [],
        lastOrderAt: item.lastOrderAt ? new Date(item.lastOrderAt).toISOString() : null,
        firstOrderAt: item.firstOrderAt ? new Date(item.firstOrderAt).toISOString() : null,
        addresses: cleanAddresses,
        tier,
        status,
      });
    }

    // Tambahkan kontak dari sesi chat yang belum pernah order
    for (const [sPhone, session] of sessionMap.entries()) {
      if (!customerMap.has(sPhone)) {
        const isTelegram = sPhone.startsWith('tg_') || (!sPhone.startsWith('62') && !sPhone.startsWith('08') && sPhone.length < 13);
        const name = session.tempData?.customerName || session.tempData?.name || `Pengunjung ${sPhone.slice(-4)}`;
        customerMap.set(sPhone, {
          id: sPhone,
          phone: sPhone,
          displayPhone: isTelegram ? `Telegram ID: ${sPhone.replace('tg_', '')}` : displayPhone(sPhone),
          name,
          channel: isTelegram ? 'telegram' : 'whatsapp',
          totalOrders: 0,
          totalSpent: 0,
          orderTypes: [],
          lastOrderAt: null,
          firstOrderAt: session.createdAt ? new Date(session.createdAt).toISOString() : null,
          addresses: session.tempData?.deliveryAddress ? [session.tempData.deliveryAddress] : [],
          tier: 'Bronze',
          status: 'idle',
        });
      }
    }

    // Ubah map jadi array
    let customers = Array.from(customerMap.values());

    // Filter Search
    if (search) {
      customers = customers.filter(
        c =>
          c.name.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search) ||
          c.displayPhone.toLowerCase().includes(search)
      );
    }

    // Filter Tier
    if (tierFilter !== 'all') {
      customers = customers.filter(c => c.tier.toLowerCase() === tierFilter.toLowerCase());
    }

    // Filter Channel
    if (channelFilter !== 'all') {
      customers = customers.filter(c => c.channel === channelFilter);
    }

    // Sort default: total spent desc, lalu total orders desc
    customers.sort((a, b) => b.totalSpent - a.totalSpent || b.totalOrders - a.totalOrders);

    // Hitung statistik ringkasan
    const totalCustomers = customerMap.size;
    const allList = Array.from(customerMap.values());
    const totalSpentAll = allList.reduce((acc, curr) => acc + curr.totalSpent, 0);
    const totalOrdersAll = allList.reduce((acc, curr) => acc + curr.totalOrders, 0);
    const vipCount = allList.filter(c => c.tier === 'Platinum' || c.tier === 'Gold').length;
    const activeCount = allList.filter(c => c.status === 'active').length;
    const aov = totalOrdersAll > 0 ? Math.round(totalSpentAll / totalOrdersAll) : 0;

    return NextResponse.json({
      status: true,
      data: customers,
      stats: {
        totalCustomers,
        activeCustomers: activeCount,
        vipCustomers: vipCount,
        totalRevenue: totalSpentAll,
        averageOrderValue: aov,
        channelBreakdown: {
          telegram: allList.filter(c => c.channel === 'telegram').length,
          whatsapp: allList.filter(c => c.channel === 'whatsapp').length,
        },
      },
    });
  } catch (error: any) {
    console.error('Customer API Error:', error);
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
