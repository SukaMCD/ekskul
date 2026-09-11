import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/Order';
import Menu from '@/models/Menu';
import { getBotConfigs, logBotMessage, normalizePhone, displayPhone } from '@/lib/wablas';
import { sendTelegramMessage } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/wablas';
import { verifyXenditWebhookToken } from '@/lib/xendit';

export async function GET(request: NextRequest) {
  try {
    const configs = await getBotConfigs();
    const isConfigured = Boolean(configs.xendit_secret_key);
    const hasWebhookToken = Boolean(configs.xendit_webhook_token);

    return NextResponse.json({
      status: true,
      service: 'Xendit Webhook Handler',
      xendit_enabled: configs.xendit_enabled !== '0',
      xendit_configured: isConfigured,
      webhook_token_configured: hasWebhookToken,
      server_time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const configs = await getBotConfigs();

    // 1. Verifikasi callback token dari Xendit
    const incomingToken = request.headers.get('x-callback-token');
    const expectedToken = configs.xendit_webhook_token;

    if (!verifyXenditWebhookToken(incomingToken, expectedToken)) {
      console.warn('[XENDIT WEBHOOK] Unauthorized callback token attempt:', incomingToken);
      return NextResponse.json({ error: 'Invalid callback token' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: 'Empty payload' }, { status: 400 });
    }

    const status = String(payload.status || '').toUpperCase();
    const externalId = String(payload.external_id || '').trim();
    const invoiceId = String(payload.id || '').trim();

    console.log(`[XENDIT WEBHOOK] Received invoice callback: ID=${invoiceId}, ExternalId=${externalId}, Status=${status}`);

    // Kita memproses saat status PAID atau SETTLED
    if (status !== 'PAID' && status !== 'SETTLED') {
      return NextResponse.json({
        ok: true,
        message: `Ignored status ${status} for invoice ${invoiceId}`,
      });
    }

    // 2. Cari pesanan berdasarkan invoiceNo atau xenditInvoiceId
    const order = await Order.findOne({
      $or: [
        { invoiceNo: externalId.replace(/^#/, '') },
        { invoiceNo: externalId },
        { xenditInvoiceId: invoiceId },
      ],
    });

    if (!order) {
      console.warn(`[XENDIT WEBHOOK] Order not found for external_id: ${externalId}, id: ${invoiceId}`);
      return NextResponse.json({ ok: true, message: 'Order not found, acknowledged' });
    }

    // Idempotency: Jika sudah terverifikasi sebelumnya, jangan kurangi stok dua kali
    if (order.paymentStatus === 'verified') {
      return NextResponse.json({
        ok: true,
        message: `Order #${order.invoiceNo} already marked verified`,
      });
    }

    // 3. Update status pembayaran pesanan
    const paymentChannel =
      payload.payment_channel ||
      payload.payment_method ||
      'Xendit QRIS / VA / E-Wallet';

    order.paymentStatus = 'verified';
    if (order.orderStatus === 'pending') {
      order.orderStatus = 'cooking';
    }
    order.paymentChannel = paymentChannel;
    order.paidAt = new Date(payload.paid_at || Date.now());
    if (invoiceId && !order.xenditInvoiceId) {
      order.xenditInvoiceId = invoiceId;
    }
    await order.save();

    // 4. Pengurangan stok menu secara atomik
    const stockDeductionLogs: string[] = [];
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        let menuDoc = null;
        if (item.menuId) {
          menuDoc = await Menu.findById(item.menuId);
        }
        if (!menuDoc && item.menuCode) {
          menuDoc = await Menu.findOne({ code: item.menuCode.toUpperCase() });
        }

        if (menuDoc) {
          const qty = Number(item.quantity) || 1;
          const currentStock = menuDoc.stock !== undefined ? menuDoc.stock : 50;
          const newStock = Math.max(0, currentStock - qty);
          const shouldDisable = menuDoc.trackStock && newStock <= 0;

          await Menu.findByIdAndUpdate(menuDoc._id, {
            $set: {
              stock: newStock,
              ...(shouldDisable ? { isAvailable: false } : {}),
            },
          });

          stockDeductionLogs.push(
            `${menuDoc.name} (${menuDoc.code}): ${currentStock} -> ${newStock} (${qty} dipotong)${shouldDisable ? ' [STOK HABIS]' : ''}`
          );
        }
      }
    }

    console.log(`[XENDIT WEBHOOK] Stock deducted for order #${order.invoiceNo}:`, stockDeductionLogs);

    // 5. Notifikasi Lunas ke Telegram / WhatsApp Pelanggan
    const customerPhone = String(order.customerPhone || '').trim();
    const amountStr = Number(order.grandTotal).toLocaleString('id-ID');

    let customerMsg = "🎉 *PEMBAYARAN ANDA TELAH DITERIMA & LUNAS!* 🎉\n";
    customerMsg += "═════════════════════════\n";
    customerMsg += `No. Invoice: *#${order.invoiceNo}*\n`;
    customerMsg += `Metode Bayar: *${paymentChannel}*\n`;
    customerMsg += `Total Tagihan: *Rp ${amountStr}*\n`;
    customerMsg += "Status Bayar: *LUNAS (Verified) ✅*\n";
    customerMsg += "Status Pesanan: *Sedang Dimasak / Disiapkan di Dapur 🍳🔥*\n";
    customerMsg += "═════════════════════════\n\n";
    customerMsg += "Terima kasih banyak atas pembayaran kakak! Pesanan langsung dipersiapkan oleh staf dapur kami.\n\n";
    customerMsg += "Ketik *STATUS* kapan saja untuk memantau kemajuan pesanan kakak. Selamat menikmati hidangan kami! 🙏🍽️";

    const isTelegramCustomer =
      configs.gateway_provider === 'telegram' ||
      /^\d{6,12}$/.test(customerPhone) ||
      !customerPhone.startsWith('62');

    if (isTelegramCustomer) {
      await sendTelegramMessage(customerPhone, customerMsg, configs);
    } else {
      await sendWhatsAppMessage(customerPhone, customerMsg, configs);
    }

    // 6. Notifikasi Alert ke Telegram Admin
    const adminChatId = String(configs.telegram_admin_chat_id || '').trim();
    const adminPhone = normalizePhone(configs.admin_phone || '');

    let adminAlert = "💰 *PEMBAYARAN MASUK OTOMATIS (XENDIT)!* 💰\n";
    adminAlert += "═════════════════════════\n";
    adminAlert += `No. Order: *#${order.invoiceNo}*\n`;
    adminAlert += `Pelanggan: *${order.customerName}* (${customerPhone})\n`;
    adminAlert += `Metode: *${paymentChannel}*\n`;
    adminAlert += `Nominal: *Rp ${amountStr}*\n`;
    adminAlert += `Status: *LUNAS & STOK BERKURANG OTOMATIS ✅*\n`;
    adminAlert += "─────────────────────────\n";
    adminAlert += "*Menu yang dipesan:*\n";
    for (const it of order.items) {
      adminAlert += `• ${it.quantity}x ${it.menuName}\n`;
    }
    if (stockDeductionLogs.length > 0) {
      adminAlert += "─────────────────────────\n";
      adminAlert += "*Update Stok:*\n";
      for (const logItem of stockDeductionLogs) {
        adminAlert += `• ${logItem}\n`;
      }
    }
    adminAlert += "═════════════════════════\n";
    adminAlert += "_Pesanan telah otomatis dialihkan ke antrean dapur (Cooking)._";

    if (adminChatId) {
      await sendTelegramMessage(adminChatId, adminAlert, configs);
    }
    if (adminPhone && configs.gateway_provider !== 'telegram') {
      await sendWhatsAppMessage(adminPhone, adminAlert, configs);
    }

    await logBotMessage(
      customerPhone,
      'outbound',
      'xendit_paid',
      `Pembayaran Lunas untuk #${order.invoiceNo} via ${paymentChannel}. Stok berhasil dipotong.`,
      JSON.stringify(payload),
      'success'
    );

    return NextResponse.json({
      ok: true,
      message: `Order #${order.invoiceNo} successfully updated to paid/cooking and stock deducted.`,
      stockUpdates: stockDeductionLogs,
    });
  } catch (error: any) {
    console.error('[XENDIT WEBHOOK] Processing error:', error);
    try {
      await logBotMessage('xendit_webhook', 'inbound', 'error', error.message, error.stack || '', 'failed');
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
