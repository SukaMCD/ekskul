import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/Order';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getBotConfigs, sendWhatsAppMessage } from '@/lib/wablas';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    await connectDB();
    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ status: false, message: 'Pesanan tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ status: true, data: order });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const { orderStatus, paymentStatus, sendWaNotif } = await request.json();
    await connectDB();

    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ status: false, message: 'Pesanan tidak ditemukan' }, { status: 404 });
    }

    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    // Send WhatsApp notification if requested
    if (sendWaNotif && order.customerPhone) {
      const configs = await getBotConfigs();
      const storeName = configs.store_name || 'Resto Kami';
      let statusText = '';

      switch (orderStatus) {
        case 'confirmed':
          statusText = `✅ *Pesanan Dikonfirmasi!*\nPesanan kakak *#${order.invoiceNo}* sudah kami terima dan segera masuk antrean dapur ya!`;
          break;
        case 'cooking':
          statusText = `🍳 *Sedang Dimasak!*\nPesanan *#${order.invoiceNo}* saat ini sedang disiapkan oleh tim dapur *${storeName}*. Harap ditunggu ya kak!`;
          break;
        case 'ready':
          if (order.orderType === 'dine_in') {
            statusText = `🍽️ *Makanan Siap Disajikan!*\nPesanan *#${order.invoiceNo}* sudah siap dan akan diantar ke meja kakak. Selamat menikmati!`;
          } else if (order.orderType === 'takeaway') {
            statusText = `🛍️ *Pesanan Siap Diambil!*\nPesanan *#${order.invoiceNo}* sudah selesai dikemas dan siap diambil di counter/kasir. Terima kasih!`;
          } else {
            statusText = `🛵 *Sedang Diantar Kurir!*\nPesanan *#${order.invoiceNo}* sedang dalam perjalanan ke alamat kakak:\n📍 _${order.deliveryAddress}_\n\nMohon pastikan nomor telepon tetap aktif.`;
          }
          break;
        case 'delivered':
          statusText = `🎉 *Pesanan Selesai!*\nTerima kasih banyak sudah memesan di *${storeName}* kak! Semoga makanannya enak dan cocok di lidah 😊🙏\n\nKetik *MENU* kapan saja jika ingin memesan lagi.`;
          break;
        case 'cancelled':
          statusText = `❌ *Pesanan Dibatalkan*\nMohon maaf, pesanan *#${order.invoiceNo}* telah dibatalkan oleh admin/restoran. Silakan hubungi kami jika ada kendala.`;
          break;
      }

      if (statusText) {
        await sendWhatsAppMessage(order.customerPhone, statusText, configs);
      }
    }

    return NextResponse.json({
      status: true,
      message: `Status pesanan #${order.invoiceNo} berhasil diperbarui!`,
      data: order,
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
