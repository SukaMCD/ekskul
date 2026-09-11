import connectDB from './db';
import Category from '@/models/Category';
import Menu from '@/models/Menu';
import Order from '@/models/Order';
import BotSession from '@/models/BotSession';
import {
  getBotConfigs,
  setBotConfig,
  normalizePhone,
  displayPhone,
  isPhoneWhitelisted,
  getWhitelistNumbers,
  sendWhatsAppMessage,
  logBotMessage,
  BotConfigMap,
} from './wablas';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  TELEGRAM_MAIN_KEYBOARD,
  TELEGRAM_ORDER_TYPE_KEYBOARD,
  TELEGRAM_CONFIRM_KEYBOARD,
  TELEGRAM_CANCEL_KEYBOARD,
  makeTelegramPaymentKeyboard,
  buildDynamicMainMenuKeyboard,
  buildMenuKeyboard,
  buildQuantityKeyboard,
  buildCartKeyboard,
  buildTableKeyboard,
  buildDeliveryLocationKeyboard,
  buildQuickNotesKeyboard,
} from './telegram';
import { createXenditInvoice } from './xendit';
import { askGroqChatbot } from './groq';

export async function generateInvoiceNo(): Promise<string> {
  await connectDB();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${dateStr}-`;

  const todayCount = await Order.countDocuments({
    invoiceNo: { $regex: `^${prefix}` },
  });

  const nextNumber = String(todayCount + 1).padStart(3, '0');
  return `${prefix}${nextNumber}`;
}

export async function getFormattedMenuForBot(): Promise<string> {
  await connectDB();
  const categories = await Category.find({ isActive: true }).sort({ displayOrder: 1 });
  const menus = await Menu.find({ isAvailable: true }).populate('categoryId').sort({ code: 1 });

  let text = "📋 *KATALOG MENU & HARGA*\n";
  text += "═════════════════════════\n\n";

  if (menus.length === 0) {
    text += "_(Menu saat ini sedang diperbarui / belum ada item menu yang aktif)_\n";
    return text;
  }

  const processedMenuIds = new Set<string>();

  for (const cat of categories) {
    const catIdStr = cat._id.toString();
    const catMenus = menus.filter((m: any) => {
      const mCatId = m.categoryId?._id ? m.categoryId._id.toString() : (m.categoryId ? m.categoryId.toString() : '');
      return mCatId === catIdStr;
    });

    if (catMenus.length === 0) continue;

    text += `🍽️ *${cat.name.toUpperCase()}*\n`;
    text += "─────────────────────────\n";

    for (const m of catMenus) {
      processedMenuIds.add(m._id.toString());
      const priceStr = 'Rp ' + Number(m.price).toLocaleString('id-ID');
      const stockInfo = m.trackStock ? ` _(Stok: ${m.stock !== undefined ? m.stock : 50})_` : '';
      text += `• *[${m.code}]* ${m.name} : *${priceStr}*${stockInfo}\n`;
      if (m.description) {
        text += `  _${m.description}_\n`;
      }
    }
    text += "\n";
  }

  // Any remaining menus not categorized
  const otherMenus = menus.filter((m: any) => !processedMenuIds.has(m._id.toString()));
  if (otherMenus.length > 0) {
    if (categories.length > 0) {
      text += `🍽️ *MENU LAINNYA*\n`;
      text += "─────────────────────────\n";
    }
    for (const m of otherMenus) {
      const priceStr = 'Rp ' + Number(m.price).toLocaleString('id-ID');
      const stockInfo = m.trackStock ? ` _(Stok: ${m.stock !== undefined ? m.stock : 50})_` : '';
      text += `• *[${m.code}]* ${m.name} : *${priceStr}*${stockInfo}\n`;
      if (m.description) {
        text += `  _${m.description}_\n`;
      }
    }
    text += "\n";
  }

  text += "═════════════════════════\n";
  text += "💡 *CARA MEMESAN:*\n";
  text += "Ketik *ORDER* diikuti kode menu & jumlah.\n";
  text += "Contoh: *ORDER M1 2, D1 1*\n\n";
  text += "Atau cukup ketik *ORDER* untuk dipandu langkah demi langkah 😊";

  return text;
}

export interface InboundPayload {
  platform?: 'telegram' | 'whatsapp' | string;
  chatId?: string | number;
  phone?: string;
  from?: string;
  sender?: string;
  messageType?: string;
  type?: string;
  isGroup?: boolean;
  groupId?: string;
  isFromMe?: boolean;
  fromMe?: boolean;
  message?: string;
  caption?: string;
  text?: string;
  file?: string;
  url?: string;
  image?: string;
  pushName?: string;
  username?: string;
  interactive?: {
    button_reply?: { title: string };
    list_reply?: { title: string };
  };
  [key: string]: any;
}

type SendFn = (
  targetPhone: string,
  msg: string,
  options?: {
    keyboard?: 'main' | 'order_type' | 'confirm' | 'cancel' | 'none';
    replyMarkup?: any;
  }
) => Promise<void>;

async function handleCheckOrderStatus(
  phone: string,
  text: string,
  configs: BotConfigMap,
  sendMsg: SendFn
): Promise<void> {
  await connectDB();
  let order: any = null;

  const invMatch = text.match(/(ORD-[\d-]+)/i);
  if (invMatch) {
    order = await Order.findOne({ invoiceNo: invMatch[1].toUpperCase() });
  }

  if (!order) {
    order = await Order.findOne({ customerPhone: phone }).sort({ createdAt: -1 });
  }

  if (!order) {
    await sendMsg(
      phone,
      `ℹ️ Belum ada riwayat pesanan yang tercatat untuk nomor ini kak.\n\nKetik *MENU* untuk melihat katalog dan mulai memesan! 🍽️`
    );
    return;
  }

  const statusLabels: Record<string, string> = {
    pending: 'Menunggu Konfirmasi / Pembayaran ⏳',
    confirmed: 'Pesanan Dikonfirmasi ✅',
    cooking: 'Sedang Dimasak / Disiapkan di Dapur 🍳🔥',
    ready: 'Siap Diambil / Siap Antar 📦✨',
    delivered: 'Selesai / Sudah Diterima 🎉',
    cancelled: 'Dibatalkan ❌',
  };

  const paymentLabels: Record<string, string> = {
    unpaid: 'Belum Bayar ❌',
    paid: 'Menunggu Verifikasi Bukti ⏳',
    verified: 'Lunas / Terverifikasi ✅',
  };

  const statusStr = statusLabels[order.orderStatus] || order.orderStatus;
  const paymentStr = paymentLabels[order.paymentStatus] || order.paymentStatus;

  let msg = "📋 *STATUS PESANAN KAKAK*\n";
  msg += "═════════════════════════\n";
  msg += `No. Invoice: *#${order.invoiceNo}*\n`;
  msg += `Nama: *${order.customerName}*\n`;
  msg += `Waktu Pesan: *${new Date(order.createdAt).toLocaleString('id-ID')} WIB*\n`;
  msg += `Status Pesanan: *${statusStr}*\n`;
  msg += `Status Bayar: *${paymentStr}*\n`;
  msg += "─────────────────────────\n";
  msg += "*Rincian Item:*\n";
  if (order.items && order.items.length > 0) {
    for (const it of order.items) {
      msg += `• ${it.quantity}x ${it.menuName}\n`;
    }
  }
  msg += `Total: *Rp ${Number(order.grandTotal).toLocaleString('id-ID')}*\n`;
  msg += "═════════════════════════\n";

  if (order.paymentStatus === 'unpaid') {
    msg += "\n💡 *Pengingat:* Mohon selesaikan pembayaran dan kirim foto bukti transfer ke chat ini ya kak.";
  }

  await sendMsg(phone, msg);
}

async function handleAddSingleItemToCart(
  phone: string,
  menu: any,
  qty: number,
  tempData: any,
  session: any,
  configs: BotConfigMap,
  sendMsg: SendFn,
  availableMenus: any[],
  replies: string[]
): Promise<{ status: boolean; message: string; replies: string[] }> {
  // Cek ketersediaan stok
  const currentStock = menu.stock !== undefined ? menu.stock : 50;
  if (menu.trackStock && currentStock <= 0) {
    session.state = 'ORDERING_ITEMS';
    session.markModified('tempData');
    await session.save();
    await sendMsg(
      phone,
      `⚠️ Maaf kak, menu *${menu.name}* saat ini sedang habis (Stok: 0). Silakan pilih menu lainnya:`,
      { replyMarkup: buildMenuKeyboard(availableMenus, (tempData.items || []).length) }
    );
    return { status: true, message: 'Out of stock', replies };
  }

  if (menu.trackStock && qty > currentStock) {
    await sendMsg(
      phone,
      `⚠️ Maaf kak, stok untuk *${menu.name}* hanya tersisa *${currentStock}* porsi. Silakan klik jumlah porsi yang sesuai:`,
      { replyMarkup: buildQuantityKeyboard(menu.name) }
    );
    return { status: true, message: 'Stock exceeded', replies };
  }

  if (!tempData.items) tempData.items = [];
  const existingIdx = tempData.items.findIndex((it: any) => it.menuCode === menu.code);
  if (existingIdx >= 0) {
    tempData.items[existingIdx].quantity += qty;
    tempData.items[existingIdx].subtotal = tempData.items[existingIdx].quantity * Number(menu.price);
  } else {
    tempData.items.push({
      menuId: menu._id,
      menuCode: menu.code,
      menuName: menu.name,
      price: Number(menu.price),
      quantity: qty,
      subtotal: Number(menu.price) * qty,
      notes: '',
    });
  }

  tempData.total_items = tempData.items.reduce((sum: number, it: any) => sum + Number(it.quantity), 0);
  tempData.subtotal = tempData.items.reduce((sum: number, it: any) => sum + Number(it.subtotal), 0);
  delete tempData.pending_menu_code;

  session.state = 'ORDERING_ITEMS';
  session.tempData = tempData;
  session.markModified('tempData');
  await session.save();

  let confirmMsg = `✅ *${qty}x ${menu.name}* dimasukkan ke keranjang!\n`;
  confirmMsg += `🛒 Total Keranjang: *${tempData.total_items} item* (Rp ${Number(tempData.subtotal).toLocaleString('id-ID')})\n\n`;
  confirmMsg += `Silakan klik menu lain di bawah untuk menambah, atau klik **✅ Selesai & Lanjut** jika sudah selesai:`;

  await sendMsg(phone, confirmMsg, {
    replyMarkup: buildMenuKeyboard(availableMenus, tempData.total_items),
  });
  return { status: true, message: 'Item added to cart', replies };
}

async function handleProcessOrderItems(
  phone: string,
  text: string,
  tempData: any,
  session: any,
  configs: BotConfigMap,
  sendMsg: SendFn
): Promise<{ status: boolean; message: string }> {
  await connectDB();
  const entries = text.split(/[,;\n]+/);
  const parsedItems: any[] = [];
  const unrecognized: string[] = [];
  const stockErrors: string[] = [];
  let totalItems = 0;
  let subtotal = 0;

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([A-Za-z0-9]+)\s*[:xX]?\s*(\d+)?\s*[xX]?$/i);
    if (match) {
      const code = match[1].toUpperCase().trim();
      const qty = match[2] && parseInt(match[2], 10) > 0 ? parseInt(match[2], 10) : 1;

      const menu = await Menu.findOne({ code, isAvailable: true });
      if (menu) {
        const availableStock = menu.stock !== undefined ? menu.stock : 50;
        if (menu.trackStock && availableStock <= 0) {
          stockErrors.push(`• *${menu.name}* (${code}): Stok Habis ❌`);
          continue;
        }
        if (menu.trackStock && qty > availableStock) {
          stockErrors.push(`• *${menu.name}* (${code}): Sisa stok hanya *${availableStock}* porsi (dipesan: ${qty}) ⚠️`);
          continue;
        }

        const itemSub = Number(menu.price) * qty;
        parsedItems.push({
          menuId: menu._id,
          menuCode: menu.code,
          menuName: menu.name,
          price: Number(menu.price),
          quantity: qty,
          subtotal: itemSub,
          notes: '',
        });
        totalItems += qty;
        subtotal += itemSub;
      } else {
        unrecognized.push(code);
      }
    } else {
      unrecognized.push(trimmed);
    }
  }

  if (stockErrors.length > 0 && parsedItems.length === 0) {
    let msg = "⚠️ *Maaf kak, item yang dipesan tidak dapat diproses karena kendala stok:*\n";
    msg += stockErrors.join('\n') + '\n\n';
    msg += "Ketik *MENU* untuk melihat daftar menu dan stok yang tersedia, atau ketik *BATAL* untuk keluar.";
    await sendMsg(phone, msg);
    return { status: true, message: 'Stock not available' };
  }

  if (parsedItems.length === 0) {
    // Coba tanyakan ke Groq AI Chatbot jika pelanggan bertanya seputar menu/resto
    try {
      const aiReply = await askGroqChatbot({
        userMessage: text,
        customerName: session.customerName,
        configs,
      });

      if (aiReply) {
        const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });
        let replyWithHelp = `${aiReply}\n\n`;
        replyWithHelp += `─────────────────────────\n`;
        replyWithHelp += `💡 _Silakan klik tombol menu di bawah jika ingin memesan, atau ketik *BATAL* untuk keluar:_`;

        await sendMsg(phone, replyWithHelp, {
          replyMarkup: buildMenuKeyboard(availableMenus, (tempData.items || []).length),
        });
        return { status: true, message: 'Groq AI Q&A during ordering' };
      }
    } catch (e: any) {
      console.error('[BotEngine] Groq AI Q&A error during ordering:', e.message);
    }

    let msg = "⚠️ Maaf kak, kami belum bisa mengenali format pesanan tersebut.\n\n";
    msg += "💡 *Contoh format yang benar:*\n";
    msg += "• *M1 2, D1 1* (2 Ayam Geprek, 1 Kopi Aren)\n";
    msg += "• *P1 1, S1 2*\n\n";
    msg += "Atau cukup **klik tombol menu** di bawah ini, atau ketik *BATAL* untuk keluar.";
    await sendMsg(phone, msg);
    return { status: true, message: 'Unrecognized items' };
  }

  tempData.items = parsedItems;
  tempData.total_items = totalItems;
  tempData.subtotal = subtotal;

  session.state = 'ORDERING_TYPE';
  session.tempData = tempData;
  session.markModified('tempData');
  await session.save();

  let reply = "✅ *Item Pesanan Dicatat:*\n";
  for (const it of parsedItems) {
    const p = 'Rp ' + Number(it.price).toLocaleString('id-ID');
    const s = 'Rp ' + Number(it.subtotal).toLocaleString('id-ID');
    reply += `• ${it.menuName || it.menu_name} (${it.quantity}x @ ${p}) = *${s}*\n`;
  }
  reply += `Subtotal: *Rp ${subtotal.toLocaleString('id-ID')}*\n`;

  if (stockErrors.length > 0) {
    reply += `\n⚠️ *Catatan Stok Dilewati:*\n${stockErrors.join('\n')}\n`;
  }

  if (unrecognized.length > 0) {
    reply += `\n_(Catatan: Kode [${unrecognized.join(', ')}] tidak ditemukan dan dilewati)_\n`;
  }

  reply += "\n═══════════════════════\n";
  reply += "Selanjutnya, pesanan ini untuk:\n";
  reply += "1️⃣ *Makan di Tempat (Dine-In)*\n";
  reply += "2️⃣ *Bungkus (Takeaway)*\n";
  reply += "3️⃣ *Pesan Antar (Delivery)*\n\n";
  reply += "Balas dengan angka *1*, *2*, atau *3* ya kak.";

  await sendMsg(phone, reply, { keyboard: 'order_type' });
  return { status: true, message: 'Items parsed and stored' };
}

async function handleFinalizeOrder(
  phone: string,
  tempData: any,
  session: any,
  configs: BotConfigMap,
  sendMsg: SendFn
): Promise<{ status: boolean; message: string }> {
  await connectDB();

  // 1. Verifikasi ketersediaan stok sebelum pesanan dibuat
  const unavailableList: string[] = [];
  const items = tempData.items || [];
  for (const it of items) {
    let menuDoc = null;
    if (it.menuId) {
      menuDoc = await Menu.findById(it.menuId);
    }
    if (!menuDoc && it.menuCode) {
      menuDoc = await Menu.findOne({ code: it.menuCode.toUpperCase() });
    }
    if (menuDoc && menuDoc.trackStock) {
      const stock = menuDoc.stock !== undefined ? menuDoc.stock : 50;
      if (stock < it.quantity) {
        unavailableList.push(`• *${menuDoc.name}* (sisa ${stock}, dipesan ${it.quantity})`);
      }
    }
  }

  if (unavailableList.length > 0) {
    session.state = 'IDLE';
    session.tempData = {};
    await session.save();
    await sendMsg(
      phone,
      `⚠️ *Pesanan tidak dapat diproses karena stok telah berubah:*\n${unavailableList.join('\n')}\n\nSilakan ketik *ORDER* untuk memilih menu kembali.`
    );
    return { status: false, message: 'Stock unavailable at finalize' };
  }

  const invoiceNo = await generateInvoiceNo();
  const adminPhone = normalizePhone(configs.admin_phone || '');
  const bankInfo = configs.bank_info || 'Pembayaran BCA / QRIS';

  // 2. Hitung subtotal, ongkir, dan grandTotal dengan fallback proteksi
  let subtotal = Number(tempData.subtotal || 0);
  if ((!subtotal || isNaN(subtotal) || subtotal <= 0) && items.length > 0) {
    subtotal = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
  }
  const deliveryFee = Number(tempData.delivery_fee || 0);
  const grandTotal = Number(tempData.grand_total) > 0 ? Number(tempData.grand_total) : (subtotal + deliveryFee);
  const totalItems = Number(tempData.total_items) > 0 ? Number(tempData.total_items) : items.reduce((s: number, it: any) => s + Number(it.quantity || 1), 0);

  const customerName = (tempData.customer_name && tempData.customer_name !== 'undefined') ? tempData.customer_name : 'Pelanggan';
  const deliveryAddress = (tempData.delivery_address && tempData.delivery_address !== 'undefined') ? tempData.delivery_address : '-';
  const orderType = tempData.order_type || 'dine_in';

  // 3. Buat invoice Xendit jika diaktifkan & API key terisi
  const xenditSecret = (configs.xendit_secret_key || '').trim();
  const isXenditActive = configs.xendit_enabled !== '0' && Boolean(xenditSecret);
  let xenditInvoiceUrl = '';
  let xenditInvoiceId = '';

  if (isXenditActive && grandTotal > 0) {
    const xenditItems = items.map((it: any) => ({
      name: it.menuName,
      quantity: it.quantity,
      price: it.price,
    }));

    if (deliveryFee > 0) {
      xenditItems.push({
        name: 'Ongkos Kirim (Delivery)',
        quantity: 1,
        price: deliveryFee,
      });
    }

    const xenditRes = await createXenditInvoice({
      externalId: invoiceNo,
      amount: grandTotal,
      description: `Pesanan #${invoiceNo} - ${customerName}`,
      customerName: customerName,
      customerPhone: phone,
      items: xenditItems,
      secretKey: xenditSecret,
    });

    if (xenditRes.success && xenditRes.data) {
      xenditInvoiceUrl = xenditRes.data.invoice_url;
      xenditInvoiceId = xenditRes.data.id;
    } else {
      console.warn('[BOT] Xendit invoice creation error, fallback to manual transfer:', xenditRes.error);
    }
  }

  const orderData = {
    invoiceNo,
    customerPhone: phone,
    customerName: customerName,
    orderType: orderType,
    deliveryAddress: deliveryAddress,
    notes: tempData.notes || '-',
    totalItems: totalItems,
    subtotal: subtotal,
    deliveryFee: deliveryFee,
    discount: 0,
    grandTotal: grandTotal,
    paymentMethod: xenditInvoiceUrl ? 'Xendit (QRIS / VA / E-Wallet)' : 'Transfer Bank / QRIS',
    paymentStatus: 'unpaid',
    orderStatus: 'pending',
    xenditInvoiceId,
    xenditInvoiceUrl,
    items: items,
  };

  const newOrder = await Order.create(orderData);

  session.state = 'IDLE';
  session.tempData = {};
  session.markModified('tempData');
  await session.save();

  let invoiceMsg = "🎉 *PESANAN BERHASIL DIBUAT!*\n";
  invoiceMsg += "═════════════════════════\n";
  invoiceMsg += `No. Invoice: *#${invoiceNo}*\n`;
  invoiceMsg += `Nama: *${newOrder.customerName}*\n`;
  invoiceMsg += "Status: *Menunggu Pembayaran ⏳*\n";
  invoiceMsg += `Total Tagihan: *Rp ${Number(newOrder.grandTotal).toLocaleString('id-ID')}*\n`;
  invoiceMsg += "═════════════════════════\n\n";

  if (xenditInvoiceUrl) {
    invoiceMsg += "💳 *PEMBAYARAN OTOMATIS (XENDIT):*\n";
    invoiceMsg += "Silakan klik tombol *Bayar Sekarang* di bawah ini untuk membayar via:\n";
    invoiceMsg += "• *QRIS* (GoPay, OVO, DANA, ShopeePay, LinkAja)\n";
    invoiceMsg += "• *Virtual Account* (BCA, BRI, BNI, Mandiri, Permata)\n";
    invoiceMsg += "• *E-Wallet / Retail Outlets*\n\n";
    invoiceMsg += `🔗 *Link Pembayaran:*\n${xenditInvoiceUrl}\n\n`;
    invoiceMsg += "⚡ *INFO OTOMATIS:* Begitu pembayaran berhasil, pesanan Anda *otomatis terverifikasi LUNAS* dan langsung dimasak di dapur tanpa perlu kirim bukti transfer!\n\n";
    invoiceMsg += "Ketik *STATUS* kapan saja untuk memantau status pesanan kakak. Terima kasih! 🙏🍽️";

    const paymentMarkup = makeTelegramPaymentKeyboard(xenditInvoiceUrl);
    await sendMsg(phone, invoiceMsg, { replyMarkup: paymentMarkup });
  } else {
    invoiceMsg += "💳 *CARA PEMBAYARAN MANUAL:*\n";
    invoiceMsg += `${bankInfo}\n\n`;
    invoiceMsg += "📸 *PENTING:* Setelah transfer, silakan *kirim foto bukti transfer* langsung ke chat ini ya kak agar pesanan langsung kami proses!\n\n";
    invoiceMsg += "Ketik *STATUS* kapan saja untuk memantau status pesanan kakak. Terima kasih! 🙏😊";

    await sendMsg(phone, invoiceMsg);
  }

  const adminChatId = String(configs.telegram_admin_chat_id || '').trim();
  if (adminPhone || adminChatId) {
    const typeLabel =
      newOrder.orderType === 'dine_in'
        ? 'DINE-IN'
        : newOrder.orderType === 'takeaway'
        ? 'TAKEAWAY'
        : 'DELIVERY';
    const disp = phone.length > 15 ? phone : displayPhone(phone);
    let adminAlert = "🔥 *PESANAN BARU MASUK!* 🔥\n";
    adminAlert += "═════════════════════════\n";
    adminAlert += `No. Order: *#${invoiceNo}*\n`;
    adminAlert += `Tipe: *${typeLabel}*\n`;
    adminAlert += `Pelanggan: *${newOrder.customerName}* (${disp})\n`;
    adminAlert += `Tujuan/Meja: *${newOrder.deliveryAddress}*\n`;
    adminAlert += `Catatan: *${newOrder.notes}*\n`;
    adminAlert += "─────────────────────────\n";
    adminAlert += "*Daftar Menu:*\n";
    for (const it of newOrder.items) {
      adminAlert += `• ${it.quantity}x ${it.menuName}\n`;
    }
    adminAlert += "─────────────────────────\n";
    adminAlert += `💰 *Total: Rp ${Number(newOrder.grandTotal).toLocaleString('id-ID')}*\n`;
    adminAlert += `Metode: *${newOrder.paymentMethod}*\n`;
    if (xenditInvoiceUrl) {
      adminAlert += `Status: *Menunggu Bayar via Xendit*\n\n`;
    } else {
      adminAlert += "Status: *Belum Bayar (Menunggu Transfer)*\n\n";
    }
    adminAlert += "_Buka Admin Dashboard untuk update status atau pantau status bot._";

    if (adminChatId) {
      await sendTelegramMessage(adminChatId, adminAlert, configs);
    }
    if (adminPhone && configs.gateway_provider !== 'telegram') {
      await sendWhatsAppMessage(adminPhone, adminAlert, configs);
    }
  }

  return { status: true, message: 'Order created successfully' };
}

export async function processInboundWebhook(
  data: InboundPayload,
  isSimulation = false
): Promise<{
  status: boolean;
  message: string;
  replies?: string[];
}> {
  await connectDB();

  const replies: string[] = [];

  // 1. Extract payload fields
  const isTelegram = data.platform === 'telegram' || Boolean(data.chatId);
  const rawIdentifier = data.chatId ? String(data.chatId) : (data.phone || data.from || data.sender || '');
  const phone = isTelegram ? rawIdentifier.trim() : normalizePhone(rawIdentifier);
  let type = (data.messageType || data.type || 'text').toLowerCase();
  const isGroup = Boolean(data.isGroup || (data.groupId && data.groupId !== '0'));
  const isFromMe = Boolean(data.isFromMe || data.fromMe);

  let text = '';
  if (typeof data.message === 'string') text = data.message;
  else if (typeof data.caption === 'string') text = data.caption;
  else if (typeof data.text === 'string') text = data.text;
  else if (data.interactive?.button_reply?.title) text = data.interactive.button_reply.title;
  else if (data.interactive?.list_reply?.title) text = data.interactive.list_reply.title;

  text = (text || '').trim();

  const hasFile = Boolean(data.file || data.url || data.image);
  const imageUrl = data.file || data.url || data.image || '';
  if (hasFile && (type === 'text' || !type)) {
    type = 'image';
  }

  if (isGroup || !phone) {
    return { status: true, message: 'Ignored Group/Empty Phone', replies: [] };
  }

  const rawJson = JSON.stringify(data);
  await logBotMessage(
    phone,
    'inbound',
    isTelegram ? (type === 'image' ? 'telegram_image' : 'telegram_text') : type,
    text || (type === 'image' ? '[GAMBAR/BUKTI]' : ''),
    rawJson,
    isSimulation ? 'simulated_inbound' : 'received'
  );

  // Load configs
  const configs = await getBotConfigs();
  const adminPhone = normalizePhone(configs.admin_phone || '');
  const adminChatId = String(configs.telegram_admin_chat_id || '').trim();
  const botActive = configs.bot_active === '1';
  const storeName = configs.store_name || 'Resto Sedap Rasa';
  const storeAddr = configs.store_address || 'Jl. Boulevard Raya No. 88, Surabaya';
  const storeGmaps = configs.store_gmaps || '';
  const storeHours = configs.store_hours || '10.00 - 22.00 WIB';
  const bankInfo = configs.bank_info || 'Pembayaran BCA / QRIS';

  const isAdmin =
    (phone === adminPhone && Boolean(adminPhone)) ||
    (Boolean(adminChatId) && String(phone) === adminChatId);

  // Normalize slash commands (e.g. /menu, /start, /order, /status)
  let cleanText = text;
  if (cleanText.startsWith('/')) {
    cleanText = cleanText.replace(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s*|$)/i, '$1 ').trim();
  }

  // Strip common emojis to recognize button clicks (e.g. "🍽️ Lihat Menu", "📝 Pesan (ORDER)", "1️⃣ Makan di Tempat")
  let textWithoutEmoji = cleanText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
  let cmdLower = textWithoutEmoji.toLowerCase();

  // Normalize button aliases:
  if (cmdLower.includes('lihat menu') || cmdLower === 'menu' || cmdLower === 'katalog') {
    cmdLower = 'menu';
  } else if (cmdLower === 'pesan (order)' || cmdLower === 'order' || cmdLower === 'pesan') {
    cmdLower = 'order';
  } else if (cmdLower.includes('cek status') || cmdLower === 'status') {
    cmdLower = 'status';
  } else if (cmdLower.includes('info resto') || cmdLower === 'info') {
    cmdLower = 'info';
  } else if (cmdLower.includes('bantuan admin') || cmdLower.includes('admin / cs') || cmdLower === 'admin' || cmdLower === 'cs') {
    cmdLower = 'admin';
  } else if (cmdLower.includes('batal') || cmdLower === 'cancel') {
    cmdLower = 'batal';
  } else if (cmdLower.includes('makan di tempat') || cmdLower.includes('dine-in') || cmdLower.includes('dine in')) {
    cmdLower = '1';
  } else if (cmdLower.includes('bungkus') || cmdLower.includes('takeaway')) {
    cmdLower = '2';
  } else if (cmdLower.includes('pesan antar') || cmdLower.includes('delivery')) {
    cmdLower = '3';
  } else if (cmdLower.includes('buat pesanan') || cmdLower.startsWith('ya')) {
    cmdLower = 'ya';
  }

  // Unified send message helper that captures replies for simulator and dispatches to Telegram / WA
  const sendMsg: SendFn = async (
    targetPhone: string,
    msg: string,
    opts?: {
      keyboard?: 'main' | 'order_type' | 'confirm' | 'cancel' | 'none';
      replyMarkup?: any;
    }
  ) => {
    replies.push(msg);
    if (isSimulation) {
      await logBotMessage(targetPhone, 'outbound', isTelegram ? 'telegram_text' : 'text', msg, '', 'simulated');
    } else if (isTelegram || configs.gateway_provider === 'telegram') {
      let replyMarkup: any = opts?.replyMarkup;
      if (!replyMarkup) {
        if (opts?.keyboard === 'order_type') replyMarkup = TELEGRAM_ORDER_TYPE_KEYBOARD;
        else if (opts?.keyboard === 'confirm') replyMarkup = TELEGRAM_CONFIRM_KEYBOARD;
        else if (opts?.keyboard === 'cancel') replyMarkup = TELEGRAM_CANCEL_KEYBOARD;
        else if (opts?.keyboard === 'none') replyMarkup = undefined;
          const activeOrder = await Order.findOne({
            customerPhone: targetPhone,
            orderStatus: { $in: ['pending', 'confirmed', 'cooking'] },
            grandTotal: { $gt: 0 },
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          }).sort({ createdAt: -1 });
          replyMarkup = buildDynamicMainMenuKeyboard(activeOrder);
      }

      await sendTelegramMessage(targetPhone, msg, configs, { reply_markup: replyMarkup });
    } else {
      await sendWhatsAppMessage(targetPhone, msg, configs);
    }
  };

  // Telegram /start handler: resets session and sends welcome
  if (cmdLower === 'start' || text === '/start') {
    let session = await BotSession.findOne({ phone });
    if (session) {
      session.state = 'IDLE';
      session.tempData = {};
      session.isPaused = false;
      await session.save();
    }
    const welcomeTpl =
      configs.welcome_message ||
      `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`;
    const welcomeMsg = welcomeTpl.replace(/{store_name}/g, storeName);
    await sendMsg(phone, welcomeMsg);
    return { status: true, message: 'Telegram /start welcome sent', replies };
  }

  // 2. Admin Quick Commands
  if (isAdmin) {
    if (cmdLower === 'pause bot') {
      await setBotConfig('bot_active', '0');
      await sendMsg(phone, "⏸️ *Bot Telah di-PAUSE secara Global.*\nBot tidak akan membalas chat pelanggan sampai kamu kirim *play bot*.");
      return { status: true, message: 'Bot Paused Globally', replies };
    }

    if (cmdLower === 'play bot') {
      await setBotConfig('bot_active', '1');
      await sendMsg(phone, "▶️ *Bot Telah di-AKTIFKAN kembali.*\nBot sekarang membalas chat pelanggan secara otomatis.");
      return { status: true, message: 'Bot Activated Globally', replies };
    }

    if (cmdLower === 'status bot') {
      const activeConfigs = await getBotConfigs();
      const statusStr = activeConfigs.bot_active === '1' ? '✅ AKTIF' : '⏸️ PAUSED';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });
      const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });

      const msg = `ℹ️ *STATUS BOT RESTO*\n═════════════════\n• Status Bot: *${statusStr}*\n• Pesanan Hari Ini: *${todayOrders}*\n• Pesanan Pending: *${pendingOrders}*\n• Jam Server: *${new Date().toLocaleString('id-ID')}*`;
      await sendMsg(phone, msg);
      return { status: true, message: 'Status sent to admin', replies };
    }

    if (cmdLower === 'whitelist on' || cmdLower === 'whitelist 1') {
      await setBotConfig('whitelist_mode', '1');
      const nums = getWhitelistNumbers(configs.whitelist_numbers);
      await sendMsg(phone, `🛡️ *Mode Whitelist DI-AKTIFKAN!*\nBot saat ini hanya akan membalas ${nums.length} nomor terdaftar dalam whitelist.`);
      return { status: true, message: 'Whitelist mode ON', replies };
    }

    if (cmdLower === 'whitelist off' || cmdLower === 'whitelist 0') {
      await setBotConfig('whitelist_mode', '0');
      await sendMsg(phone, `🌐 *Mode Whitelist DI-NONAKTIFKAN!*\nBot sekarang membalas semua pesan publik dari siapapun.`);
      return { status: true, message: 'Whitelist mode OFF', replies };
    }

    const addMatch = text.match(/^whitelist\s+add\s+(\+?62\d+|08\d+|\d+)/i);
    if (addMatch) {
      const target = normalizePhone(addMatch[1]);
      const currentList = getWhitelistNumbers(configs.whitelist_numbers);
      if (!currentList.includes(target)) {
        currentList.push(target);
        await setBotConfig('whitelist_numbers', currentList.join(', '));
      }
      await sendMsg(phone, `✅ Nomor *${target}* berhasil ditambahkan ke whitelist!`);
      return { status: true, message: 'Whitelist number added', replies };
    }

    const delMatch = text.match(/^whitelist\s+(del|remove|hapus)\s+(\+?62\d+|08\d+|\d+)/i);
    if (delMatch) {
      const target = normalizePhone(delMatch[2]);
      const currentList = getWhitelistNumbers(configs.whitelist_numbers);
      const filtered = currentList.filter((n) => n !== target);
      await setBotConfig('whitelist_numbers', filtered.join(', '));
      await sendMsg(phone, `🗑️ Nomor *${target}* telah dihapus dari whitelist.`);
      return { status: true, message: 'Whitelist number removed', replies };
    }

    if (cmdLower === 'whitelist list' || cmdLower === 'whitelist info') {
      const isMode = configs.whitelist_mode === '1' ? '✅ AKTIF' : '❌ NONAKTIF';
      const nums = getWhitelistNumbers(configs.whitelist_numbers);
      const listStr = nums.length === 0 ? '_(Belum ada nomor)_' : nums.join('\n• ');
      const msg = `🛡️ *PENGATURAN WHITELIST BOT*\n═════════════════\n• Status Mode: *${isMode}*\n• Total Nomor: *${nums.length}*\n\n*Daftar Nomor:*\n• ${listStr}`;
      await sendMsg(phone, msg);
      return { status: true, message: 'Whitelist list sent', replies };
    }

    const playTarget = text.match(/^play\s+(\+?62\d+|08\d+|\d+)/i);
    if (playTarget) {
      const target = normalizePhone(playTarget[1]);
      await BotSession.findOneAndUpdate(
        { phone: target },
        { isPaused: false, state: 'IDLE', tempData: {} },
        { upsert: true }
      );
      await sendMsg(phone, `▶️ Bot diaktifkan kembali untuk nomor *${target}*.`);
      await sendWhatsAppMessage(
        target,
        `Halo kak! Admin kami sudah selesai membantu ya. Bot kami aktif kembali untuk membantu kebutuhan pesanan kakak 😊\nKetik *MENU* untuk melihat katalog.`,
        configs
      );
      return { status: true, message: `Play target ${target}`, replies };
    }

    const pauseTarget = text.match(/^pause\s+(\+?62\d+|08\d+|\d+)/i);
    if (pauseTarget) {
      const target = normalizePhone(pauseTarget[1]);
      await BotSession.findOneAndUpdate(
        { phone: target },
        { isPaused: true, pausedAt: new Date() },
        { upsert: true }
      );
      await sendMsg(phone, `⏸️ Bot di-pause untuk nomor *${target}*.`);
      return { status: true, message: `Pause target ${target}`, replies };
    }
  }

  // 3. Admin direct reply from device
  if (isFromMe && !isSimulation) {
    await BotSession.findOneAndUpdate(
      { phone },
      { isPaused: true, pausedAt: new Date() },
      { upsert: true }
    );
    return { status: true, message: 'User paused because Admin replied manually', replies: [] };
  }

  // 4. Global Active Check
  if (!botActive && !isAdmin && !isSimulation) {
    return { status: true, message: 'Bot Inactive Globally', replies: [] };
  }

  // 5. Whitelist Mode Check
  if (!(await isPhoneWhitelisted(phone, configs)) && !isAdmin && !isSimulation) {
    await logBotMessage(phone, 'inbound', type, text, rawJson, 'ignored_not_whitelisted');
    return { status: true, message: 'Phone not whitelisted', replies: [] };
  }

  // 6. User Session
  let session = await BotSession.findOne({ phone });
  if (!session) {
    session = await BotSession.create({ phone, state: 'IDLE', tempData: {}, isPaused: false });
  }

  let tempData = session.tempData || {};

  // Check if session is paused
  if (session.isPaused && !isSimulation) {
    const pausedAt = session.pausedAt ? new Date(session.pausedAt).getTime() : Date.now();
    const diffMins = (Date.now() - pausedAt) / (1000 * 60);
    if (diffMins < 60) {
      return { status: true, message: 'User is paused', replies: [] };
    } else {
      session.isPaused = false;
      session.pausedAt = undefined;
      await session.save();
    }
  }

  // 7. Payment Proof Image Detection
  if (type === 'image' || (type === 'text' && !text && hasFile)) {
    const latestUnpaid = await Order.findOne({
      customerPhone: phone,
      paymentStatus: { $in: ['unpaid', 'paid'] },
    }).sort({ createdAt: -1 });

    if (latestUnpaid) {
      latestUnpaid.paymentStatus = 'paid';
      latestUnpaid.proofImage = imageUrl || 'Uploaded via WA';
      await latestUnpaid.save();

      const reply = `📸 *Bukti Pembayaran Diterima!*\n\nTerima kasih kak! Bukti transfer untuk pesanan *#${latestUnpaid.invoiceNo}* sudah kami terima dan sedang diverifikasi oleh admin/dapur kami.\n\nPesanan akan segera disiapkan! 🍳\nKetik *STATUS* untuk cek status pesanan kapan saja.`;
      await sendMsg(phone, reply);

      if (adminChatId && !isSimulation) {
        const adminNotif = `🔔 *BUKTI TRANSFER MASUK!*\n═════════════════════\n• No. Order: *#${latestUnpaid.invoiceNo}*\n• Pembeli: *${latestUnpaid.customerName}* (ID: ${phone})\n• Total: *Rp ${Number(latestUnpaid.grandTotal).toLocaleString('id-ID')}*\n• Status: *Menunggu Verifikasi*\n\nSilakan verifikasi di Admin Dashboard.`;
        if (latestUnpaid.proofImage && latestUnpaid.proofImage.startsWith('http')) {
          await sendTelegramPhoto(adminChatId, latestUnpaid.proofImage, adminNotif, configs);
        } else {
          await sendTelegramMessage(adminChatId, adminNotif, configs);
        }
      }
      if (adminPhone && !isSimulation && !isTelegram) {
        const adminNotif = `🔔 *BUKTI TRANSFER MASUK!*\n═════════════════════\n• No. Order: *#${latestUnpaid.invoiceNo}*\n• Pembeli: *${latestUnpaid.customerName}* (${phone})\n• Total: *Rp ${Number(latestUnpaid.grandTotal).toLocaleString('id-ID')}*\n• Status: *Menunggu Verifikasi*\n\nSilakan cek di Admin Dashboard untuk verifikasi.`;
        await sendWhatsAppMessage(adminPhone, adminNotif, configs);
      }

      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      return { status: true, message: 'Payment proof processed', replies };
    } else {
      const reply = `Terima kasih atas kiriman gambarnya kak! 😊\nJika kakak ingin memesan makanan/minuman, silakan ketik *MENU* atau *ORDER*.`;
      await sendMsg(phone, reply);
      return { status: true, message: 'General image received', replies };
    }
  }

  // 8. Global Escape & Info Keywords (Active in any state)
  const currentState = session.state || 'IDLE';

  if (cmdLower === 'batal' || cmdLower === 'cancel' || cmdLower === 'reset') {
    session.state = 'IDLE';
    session.tempData = {};
    session.isPaused = false;
    await session.save();
    await sendMsg(phone, `❌ Sesi pesanan sebelumnya telah dibatalkan.\n\nAda yang bisa kami bantu lagi? Ketik *MENU* untuk melihat katalog.`);
    return { status: true, message: 'Session reset', replies };
  }

  if ((currentState === 'IDLE' && cmdLower === '1') || cmdLower === 'menu' || cmdLower === 'katalog' || cmdLower === 'daftar menu' || cmdLower === 'pricelist') {
    session.state = 'IDLE';
    session.tempData = {};
    await session.save();
    try {
      const catalog = await getFormattedMenuForBot();
      const msgToSend = catalog && catalog.trim().length > 10
        ? catalog
        : `📋 *KATALOG MENU*\n\n_(Menu saat ini belum tersedia atau sedang diperbarui)_\n\nSilakan hubungi admin untuk informasi menu terbaru, atau ketik *INFO* untuk detail toko.`;
      await sendMsg(phone, msgToSend);
    } catch (err: any) {
      await sendMsg(phone, `⚠️ Gagal memuat katalog menu. Silakan coba lagi atau ketik *INFO*.`);
    }
    return { status: true, message: 'Menu catalog sent', replies };
  }

  if ((currentState === 'IDLE' && cmdLower === '4') || cmdLower === 'info' || cmdLower === 'lokasi' || cmdLower === 'alamat' || cmdLower === 'jam' || cmdLower === 'rekening' || cmdLower === 'qris') {
    let infoMsg = `ℹ️ *INFORMASI ${storeName}*\n`;
    infoMsg += `═══════════════════════\n`;
    infoMsg += `📍 *Alamat:* ${storeAddr}\n`;
    if (storeGmaps) {
      infoMsg += `🗺️ *Google Maps:* ${storeGmaps}\n`;
    }
    infoMsg += `⏰ *Jam Operasional:* ${storeHours}\n\n`;
    infoMsg += `${bankInfo}\n`;
    infoMsg += `═══════════════════════\n`;
    infoMsg += `Ketik *MENU* untuk melihat menu, atau *ORDER* untuk pesan sekarang!`;
    await sendMsg(phone, infoMsg);
    return { status: true, message: 'Info sent', replies };
  }

  // Dynamic Button: Bayar Pesanan Pending
  const payBtnMatch = text.match(/(?:💳\s*)?bayar\s*(?:#)?(ORD-[\d-]+)?/i);
  if (payBtnMatch) {
    const invNo = payBtnMatch[1];
    const query: any = {
      customerPhone: phone,
      orderStatus: { $in: ['pending', 'confirmed'] },
      paymentStatus: 'unpaid',
      grandTotal: { $gt: 0 },
    };
    if (invNo) query.invoiceNo = invNo;
    const targetOrder = await Order.findOne(query).sort({ createdAt: -1 });

    if (targetOrder) {
      let billMsg = `💳 *TAGIHAN PESANAN #${targetOrder.invoiceNo}*\n`;
      billMsg += `═════════════════════════\n`;
      for (const it of targetOrder.items) {
        billMsg += `• ${it.menuName} (${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')})\n`;
      }
      if (targetOrder.deliveryFee > 0) {
        billMsg += `• Ongkos Kirim: Rp ${Number(targetOrder.deliveryFee).toLocaleString('id-ID')}\n`;
      }
      billMsg += `─────────────────────────\n`;
      billMsg += `💰 *Total: Rp ${Number(targetOrder.grandTotal).toLocaleString('id-ID')}*\n\n`;

      if (targetOrder.xenditInvoiceUrl) {
        billMsg += `Silakan klik tombol di bawah untuk membayar via **QRIS, VA Bank, atau E-Wallet**:`;
        await sendTelegramMessage(phone, billMsg, configs, {
          reply_markup: makeTelegramPaymentKeyboard(targetOrder.xenditInvoiceUrl),
        });
        return { status: true, message: 'Existing payment link sent', replies };
      } else {
        const xenditSecret = configs.xendit_secret_key || process.env.XENDIT_SECRET_KEY || '';
        const xenditRes = await createXenditInvoice({
          externalId: targetOrder.invoiceNo,
          amount: targetOrder.grandTotal,
          description: `Pesanan #${targetOrder.invoiceNo} - ${targetOrder.customerName}`,
          customerName: targetOrder.customerName || 'Pelanggan',
          customerPhone: phone,
          items: targetOrder.items.map((it: any) => ({
            name: it.menuName,
            quantity: it.quantity,
            price: it.price,
          })),
          secretKey: xenditSecret,
        });

        if (xenditRes.success && xenditRes.data) {
          targetOrder.xenditInvoiceId = xenditRes.data.id;
          targetOrder.xenditInvoiceUrl = xenditRes.data.invoice_url;
          await targetOrder.save();

          billMsg += `Silakan klik tombol di bawah untuk membayar via **QRIS, VA Bank, atau E-Wallet**:`;
          await sendTelegramMessage(phone, billMsg, configs, {
            reply_markup: makeTelegramPaymentKeyboard(xenditRes.data.invoice_url),
          });
          return { status: true, message: 'New payment link sent', replies };
        } else {
          billMsg += `_Silakan transfer ke rekening berikut:_\n\n${bankInfo}`;
          await sendMsg(phone, billMsg);
          return { status: true, message: 'Manual bank info sent', replies };
        }
      }
    }
  }

  // Dynamic Button: Batalkan Pesanan Tertentu
  const cancelSpecificMatch = text.match(/(?:❌\s*)?batal(?:kan)?\s*(?:#)?(ORD-[\d-]+)/i);
  if (cancelSpecificMatch) {
    const invNo = cancelSpecificMatch[1];
    const targetOrder = await Order.findOne({ invoiceNo: invNo, customerPhone: phone });
    if (targetOrder) {
      targetOrder.orderStatus = 'cancelled';
      await targetOrder.save();
      await sendMsg(phone, `✅ Pesanan *#${invNo}* telah berhasil dibatalkan.\n\nTombol tagihan telah dibersihkan. Silakan klik *Lihat Menu* atau *Pesan (ORDER)* untuk membuat pesanan baru.`);
      return { status: true, message: 'Specific order cancelled', replies };
    }
  }

  // Dynamic Button: Status Dapur
  const kitchenMatch = text.match(/(?:🍳\s*)?status\s*dapur/i);
  if (kitchenMatch) {
    const activeOrder = await Order.findOne({
      customerPhone: phone,
      orderStatus: { $in: ['cooking', 'confirmed'] },
      grandTotal: { $gt: 0 },
    }).sort({ createdAt: -1 });

    if (activeOrder) {
      let msg = `🍳 *STATUS DAPUR: #${activeOrder.invoiceNo}*\n`;
      msg += `═════════════════════════\n`;
      msg += `Pesanan kakak saat ini sedang **dipersiapkan & dimasak** oleh tim dapur kami 👨‍🍳\n\n`;
      msg += `Estimasi selesai: Sekitar 10-20 menit.\n`;
      msg += `Kami akan langsung mengirimkan notifikasi saat pesanan siap disajikan / diantar!`;
      await sendMsg(phone, msg);
      return { status: true, message: 'Kitchen status sent', replies };
    }
  }

  if ((currentState === 'IDLE' && cmdLower === '3') || (cmdLower === 'status' || cmdLower === 'cek status' || /(ORD-[\d-]+)/i.test(text))) {
    await handleCheckOrderStatus(phone, text, configs, sendMsg);
    return { status: true, message: 'Status checked', replies };
  }

  if (cmdLower === 'admin' || cmdLower === 'cs' || cmdLower === 'owner' || cmdLower === 'bantuan' || cmdLower === 'staf' || (currentState === 'IDLE' && cmdLower === '5')) {
    session.isPaused = true;
    session.pausedAt = new Date();
    await session.save();

    await sendMsg(phone, `👨‍💼 *Menghubungkan ke Admin / Staf*\n\nPesan kakak sudah kami teruskan ke admin kami. Staf kami akan segera membalas chat kakak secara manual.\n\n_Bot dijeda sementara waktu untuk nomor ini._`);

    if (adminChatId && !isSimulation) {
      await sendTelegramMessage(
        adminChatId,
        `🔔 *PELANGGAN BUTUH BANTUAN ADMIN!*\nUser: *${data.pushName || phone}* (ID: ${phone})\nPesan terakhir: "${text}"\n\n_Bot otomatis di-pause untuk nomor ini agar admin bisa chat langsung._`,
        configs
      );
    }
    if (adminPhone && !isSimulation && !isTelegram) {
      const dispPhone = displayPhone(phone);
      await sendWhatsAppMessage(adminPhone, `🔔 *PELANGGAN BUTUH BANTUAN ADMIN!*\nNomor: *${dispPhone}* (${phone})\nPesan terakhir: "${text}"\n\n_Bot otomatis di-pause untuk nomor ini agar admin bisa chat langsung._`, configs);
    }
    return { status: true, message: 'Admin handoff requested', replies };
  }

  // Quick Order Shortcut: e.g. "ORDER M1 2, D1 1"
  const orderMatch = text.match(/^(order|pesan)\s+(.+)$/i);
  if (orderMatch) {
    const itemsText = orderMatch[2].trim();
    const res = await handleProcessOrderItems(phone, itemsText, tempData, session, configs, sendMsg);
    return { ...res, replies };
  }

  // Direct AI Question: e.g. "tanya makanan apa yang rekomendasi?" or "ai es tehnya manis gak?"
  const aiQueryMatch = text.match(/^(tanya|ask|ai|\/tanya|\/ai)\s+(.+)$/i);
  if (aiQueryMatch) {
    const userQuestion = aiQueryMatch[2].trim();
    try {
      const aiReply = await askGroqChatbot({
        userMessage: userQuestion,
        customerName: data.pushName,
        configs,
      });
      if (aiReply) {
        await sendMsg(phone, aiReply);
        return { status: true, message: 'Groq AI response sent', replies };
      }
    } catch (err: any) {
      console.error('[BotEngine] Direct AI error:', err.message);
    }
  }

  // Flow State Machine
  switch (currentState) {
    case 'IDLE':
      if (cmdLower === '2' || cmdLower === 'order' || cmdLower === 'pesan' || cmdLower === 'beli') {
        const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });
        session.state = 'ORDERING_ITEMS';
        session.tempData = { items: [], total_items: 0, subtotal: 0 };
        session.markModified('tempData');
        await session.save();

        let guide = "📝 *PILIH MENU MAKANAN / MINUMAN*\n";
        guide += "═════════════════════════\n";
        guide += "Silakan **klik tombol menu** di bawah untuk memilih porsi, atau ketik kode menu (contoh: *M1 2*).\n\n";
        guide += "_Ketik *BATAL* kapan saja jika ingin membatalkan._";

        await sendMsg(phone, guide, { replyMarkup: buildMenuKeyboard(availableMenus, 0) });
        return { status: true, message: 'Ordering guide sent with menu keyboard', replies };
      }

      // Deteksi jika pesan adalah pertanyaan/pernyataan (bukan salam pembuka sederhana)
      const isSimpleGreeting = /^(halo|hai|hi|hei|p|ping|tes|test|selamat\s+(pagi|siang|sore|malam)|mulai|start|\/start|assalamualaikum|kulonuwun)$/i.test(text.trim());

      if (!isSimpleGreeting && text.trim().length > 1) {
        try {
          const aiReply = await askGroqChatbot({
            userMessage: text,
            customerName: data.pushName,
            configs,
          });

          if (aiReply) {
            await sendMsg(phone, aiReply);
            return { status: true, message: 'Groq AI Q&A sent in IDLE', replies };
          }
        } catch (err: any) {
          console.error('[BotEngine] Groq AI Q&A error in IDLE:', err.message);
        }
      }

      // Default Welcome Message
      const welcomeTpl = configs.welcome_message || `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`;
      const welcomeMsg = welcomeTpl.replace(/{store_name}/g, storeName);
      await sendMsg(phone, welcomeMsg);
      return { status: true, message: 'Welcome sent', replies };

    case 'ORDERING_ITEMS': {
      const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });
      const cleanLower = text.toLowerCase().trim();

      // 1. Cek jika user klik "✅ Selesai & Lanjut"
      if (cleanLower.includes('selesai') || cleanLower.includes('lanjut') || cleanLower === 'deal') {
        const currentItems = tempData.items || [];
        if (currentItems.length === 0) {
          await sendMsg(
            phone,
            "⚠️ Keranjang belanja kakak masih kosong. Silakan klik menu di bawah terlebih dahulu ya kak:",
            { replyMarkup: buildMenuKeyboard(availableMenus, 0) }
          );
          return { status: true, message: 'Cart empty', replies };
        }

        session.state = 'ORDERING_TYPE';
        session.markModified('tempData');
        await session.save();

        let reply = "✅ *Daftar Item Pesanan Kakak:*\n";
        for (const it of currentItems) {
          reply += `• ${it.menuName} (${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')}) = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        reply += `Subtotal: *Rp ${Number(tempData.subtotal).toLocaleString('id-ID')}*\n\n`;
        reply += "═══════════════════════\n";
        reply += "Selanjutnya, pesanan ini untuk:\n";
        reply += "1️⃣ *Makan di Tempat (Dine-In)*\n";
        reply += "2️⃣ *Bungkus (Takeaway)*\n";
        reply += "3️⃣ *Pesan Antar (Delivery)*\n\n";
        reply += "Silakan klik salah satu tombol di bawah:";

        await sendMsg(phone, reply, { keyboard: 'order_type' });
        return { status: true, message: 'Proceeded to order type', replies };
      }

      // 2. Cek jika user klik "🛒 Keranjang"
      if (cleanLower.includes('keranjang') || cleanLower.includes('cart')) {
        const currentItems = tempData.items || [];
        if (currentItems.length === 0) {
          await sendMsg(
            phone,
            "🛒 *Keranjang Belanja:* Masih Kosong\n\nSilakan klik salah satu tombol menu di bawah untuk mulai memesan:",
            { replyMarkup: buildMenuKeyboard(availableMenus, 0) }
          );
          return { status: true, message: 'Cart empty', replies };
        }

        let cartMsg = "🛒 *RINCIAN KERANJANG BELANJA:*\n";
        cartMsg += "═════════════════════════\n";
        for (const it of currentItems) {
          cartMsg += `• ${it.menuName}\n  ${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')} = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        cartMsg += "─────────────────────────\n";
        cartMsg += `💰 *Subtotal: Rp ${Number(tempData.subtotal).toLocaleString('id-ID')}* (${tempData.total_items} item)\n\n`;
        cartMsg += "Klik *Tambah Menu Lain* untuk menambah menu, atau *✅ Selesai & Lanjut* untuk proses pesanan:";

        await sendMsg(phone, cartMsg, { replyMarkup: buildCartKeyboard() });
        return { status: true, message: 'Cart displayed', replies };
      }

      // 3. Cek jika user klik "🗑️ Kosongkan Keranjang"
      if (cleanLower.includes('kosongkan')) {
        tempData.items = [];
        tempData.subtotal = 0;
        tempData.total_items = 0;
        session.tempData = tempData;
        session.markModified('tempData');
        await session.save();

        await sendMsg(
          phone,
          "🗑️ Keranjang telah dikosongkan.\nSilakan klik menu di bawah untuk memilih pesanan baru:",
          { replyMarkup: buildMenuKeyboard(availableMenus, 0) }
        );
        return { status: true, message: 'Cart cleared', replies };
      }

      // 4. Cek jika user klik "📋 Katalog Lengkap"
      if (cleanLower.includes('katalog lengkap')) {
        const catalog = await getFormattedMenuForBot();
        await sendMsg(phone, catalog, {
          replyMarkup: buildMenuKeyboard(availableMenus, (tempData.items || []).length),
        });
        return { status: true, message: 'Full catalog sent in ordering', replies };
      }

      // 5. Cek jika user klik tombol menu (misal: "🍽️ M1. Ayam Geprek..." atau ketik "M1")
      const cleanTextNoEmoji = text.replace(/🍽️/g, '').trim();
      const matchedMenu = availableMenus.find((m) => {
        const codeUpper = m.code.toUpperCase();
        return (
          cleanTextNoEmoji.toUpperCase().startsWith(codeUpper + '.') ||
          cleanTextNoEmoji.toUpperCase().startsWith(codeUpper + ' ') ||
          cleanTextNoEmoji.toUpperCase() === codeUpper ||
          cleanTextNoEmoji.toLowerCase() === m.name.toLowerCase() ||
          cleanTextNoEmoji.toLowerCase().includes(m.name.toLowerCase())
        );
      });

      if (matchedMenu && !text.includes(',') && !text.includes(';') && !/\d+\s*,\s*/.test(text)) {
        const singleQtyMatch = cleanTextNoEmoji.match(new RegExp(`^${matchedMenu.code}\\s*[:xX]?\s*(\\d+)$`, 'i'));
        if (singleQtyMatch && singleQtyMatch[1]) {
          const qty = parseInt(singleQtyMatch[1], 10);
          return handleAddSingleItemToCart(phone, matchedMenu, qty, tempData, session, configs, sendMsg, availableMenus, replies);
        }

        tempData.pending_menu_code = matchedMenu.code;
        session.state = 'ORDERING_QTY';
        session.tempData = tempData;
        session.markModified('tempData');
        await session.save();

        let porsiMsg = `🍽️ *${matchedMenu.name}* (${matchedMenu.code})\n`;
        porsiMsg += `💰 Harga: *Rp ${Number(matchedMenu.price).toLocaleString('id-ID')}* / porsi\n`;
        if (matchedMenu.description) {
          porsiMsg += `_${matchedMenu.description}_\n`;
        }
        porsiMsg += `\nBerapa porsi yang ingin kakak pesan?\nSilakan **klik tombol jumlah porsi** di bawah:`;

        await sendMsg(phone, porsiMsg, { replyMarkup: buildQuantityKeyboard(matchedMenu.name) });
        return { status: true, message: 'Quantity keyboard sent', replies };
      }

      // 6. Fallback ke parser multi-item (misal: "M1 2, D1 1")
      const itemsRes = await handleProcessOrderItems(phone, text, tempData, session, configs, sendMsg);
      return { ...itemsRes, replies };
    }

    case 'ORDERING_QTY': {
      const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });
      const cleanLower = text.toLowerCase().trim();

      if (cleanLower.includes('pilih menu lain') || cleanLower.includes('kembali') || cleanLower.includes('ganti menu')) {
        session.state = 'ORDERING_ITEMS';
        session.markModified('tempData');
        await session.save();
        await sendMsg(phone, "Silakan klik menu yang ingin dipesan:", {
          replyMarkup: buildMenuKeyboard(availableMenus, (tempData.items || []).length),
        });
        return { status: true, message: 'Back to menu list from qty', replies };
      }

      if (cleanLower.includes('lihat keranjang') || cleanLower.includes('keranjang')) {
        let cartMsg = "🛒 *RINCIAN KERANJANG BELANJA:*\n";
        cartMsg += "═════════════════════════\n";
        for (const it of (tempData.items || [])) {
          cartMsg += `• ${it.menuName} (${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')}) = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        cartMsg += `Subtotal: *Rp ${Number(tempData.subtotal || 0).toLocaleString('id-ID')}*\n`;
        await sendMsg(phone, cartMsg, { replyMarkup: buildCartKeyboard() });
        return { status: true, message: 'Cart shown from qty', replies };
      }

      const qtyMatch = text.match(/(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      const menuCode = tempData.pending_menu_code;
      const menu = availableMenus.find((m) => m.code.toUpperCase() === (menuCode || '').toUpperCase());

      if (!menu) {
        session.state = 'ORDERING_ITEMS';
        session.markModified('tempData');
        await session.save();
        await sendMsg(phone, "⚠️ Silakan pilih menu di bawah ini:", {
          replyMarkup: buildMenuKeyboard(availableMenus, (tempData.items || []).length),
        });
        return { status: true, message: 'Menu not found in qty step', replies };
      }

      return handleAddSingleItemToCart(phone, menu, qty, tempData, session, configs, sendMsg, availableMenus, replies);
    }

    case 'ORDERING_TYPE': {
      const typeMap: Record<string, 'dine_in' | 'takeaway' | 'delivery'> = {
        '1': 'dine_in',
        'dine in': 'dine_in',
        'dine-in': 'dine_in',
        'makan di tempat': 'dine_in',
        '2': 'takeaway',
        'take away': 'takeaway',
        'takeaway': 'takeaway',
        'bungkus': 'takeaway',
        '3': 'delivery',
        'delivery': 'delivery',
        'antar': 'delivery',
        'kirim': 'delivery',
      };

      const chosenType = typeMap[cmdLower];
      if (!chosenType) {
        await sendMsg(
          phone,
          `⚠️ Pilihan tidak valid. Silakan klik salah satu pilihan di bawah:`,
          { keyboard: 'order_type' }
        );
        return { status: true, message: 'Invalid order type selection', replies };
      }

      tempData.order_type = chosenType;
      tempData.delivery_fee = chosenType === 'delivery' ? 10000 : 0;
      session.state = 'ORDERING_NAME_ADDRESS';
      session.tempData = tempData;
      session.markModified('tempData');
      await session.save();

      if (chosenType === 'dine_in') {
        await sendMsg(
          phone,
          `🍽️ *Makan di Tempat (Dine-In)*\n\nSilakan **klik nomor meja kakak** di bawah ini:`,
          { replyMarkup: buildTableKeyboard() }
        );
      } else if (chosenType === 'takeaway') {
        await sendMsg(
          phone,
          `🛍️ *Bungkus Bawa Pulang (Takeaway)*\n\nBoleh minta *Nama Lengkap Pemesan* kakak? (Contoh: *${data.pushName || 'Rina'}*)`
        );
      } else {
        await sendMsg(
          phone,
          `🛵 *Pesan Antar (Delivery)*\n\nSilakan klik tombol **📍 Kirim Lokasi GPS Saya** di bawah untuk membagikan alamat otomatis, atau ketik alamat manual:`,
          { replyMarkup: buildDeliveryLocationKeyboard() }
        );
      }
      return { status: true, message: 'Order type chosen', replies };
    }

    case 'ORDERING_NAME_ADDRESS': {
      const nameInput = text.trim();
      const oType = tempData.order_type || 'dine_in';

      if (oType === 'dine_in') {
        if (/^meja\s*\d+/i.test(nameInput)) {
          tempData.delivery_address = nameInput.toUpperCase();
          tempData.customer_name = data.pushName || 'Pelanggan';
        } else {
          const parts = nameInput.split('-');
          tempData.customer_name = parts[0].trim();
          tempData.delivery_address = parts[1] ? parts[1].trim() : 'Makan di Tempat (Meja Belum Ditentukan)';
        }
      } else if (oType === 'takeaway') {
        tempData.customer_name = nameInput;
        tempData.delivery_address = 'Takeaway / Ambil di Toko';
      } else {
        // Delivery
        if (nameInput.includes('maps.google.com') || nameInput.startsWith('📍')) {
          tempData.delivery_address = nameInput;
          tempData.customer_name = data.pushName || 'Pelanggan';
        } else {
          const parts = nameInput.split('-');
          if (parts.length >= 2) {
            tempData.customer_name = parts[0].trim();
            tempData.delivery_address = parts.slice(1).join('-').trim();
          } else {
            tempData.customer_name = data.pushName || 'Pelanggan';
            tempData.delivery_address = nameInput;
          }
        }
      }

      session.state = 'ORDERING_NOTES';
      session.tempData = tempData;
      session.markModified('tempData');
      await session.save();

      let notePrompt = `📝 Ada *catatan khusus* untuk pesanan ini?\n(Contoh: *Sambal dipisah, es sedikit, tanpa daun bawang*).\n\nSilakan **klik salah satu opsi catatan cepat** di bawah:`;
      await sendMsg(phone, notePrompt, { replyMarkup: buildQuickNotesKeyboard() });
      return { status: true, message: 'Name/address received, prompt notes', replies };
    }

    case 'ORDERING_NOTES': {
      let notes = text.trim();
      if (notes === '-' || notes.includes('Tanpa Catatan') || ['tidak ada', 'gada', 'ga ada', 'tidak', 'no', 'strip'].includes(notes.toLowerCase())) {
        notes = '-';
      }
      tempData.notes = notes;

      const items = tempData.items || [];
      let subtotal = Number(tempData.subtotal || 0);
      if ((!subtotal || isNaN(subtotal) || subtotal <= 0) && items.length > 0) {
        subtotal = items.reduce((s: number, it: any) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        tempData.subtotal = subtotal;
      }
      const deliveryFee = Number(tempData.delivery_fee || 0);
      const grandTotal = subtotal + deliveryFee;
      tempData.grand_total = grandTotal;

      session.state = 'ORDERING_CONFIRM';
      session.tempData = tempData;
      session.markModified('tempData');
      await session.save();

      const typeTitle =
        tempData.order_type === 'dine_in'
          ? 'Dine-In (Makan di Tempat)'
          : tempData.order_type === 'takeaway'
          ? 'Takeaway (Bungkus)'
          : 'Delivery (Pesan Antar)';

      let summary = "🧾 *RINGKASAN PESANAN KAKAK*\n";
      summary += "═════════════════════════\n";
      summary += `👤 *Pemesan:* ${tempData.customer_name}\n`;
      summary += `📌 *Tipe:* ${typeTitle}\n`;
      summary += `📍 *Tujuan/Meja:* ${tempData.delivery_address}\n`;
      summary += `📝 *Catatan:* ${tempData.notes}\n`;
      summary += "─────────────────────────\n";
      summary += "*DAFTAR ITEM:*\n";
      for (const it of items) {
        const itemPrice = 'Rp ' + Number(it.price).toLocaleString('id-ID');
        const itemSub = 'Rp ' + Number(it.subtotal).toLocaleString('id-ID');
        summary += `• ${it.menuName || it.menu_name} (${it.quantity}x @ ${itemPrice}) = *${itemSub}*\n`;
      }
      summary += "─────────────────────────\n";
      summary += `Subtotal: *Rp ${subtotal.toLocaleString('id-ID')}*\n`;
      if (deliveryFee > 0) {
        summary += `Ongkir: *Rp ${deliveryFee.toLocaleString('id-ID')}*\n`;
      }
      summary += `💰 *TOTAL BAYAR: Rp ${grandTotal.toLocaleString('id-ID')}*\n`;
      summary += "═════════════════════════\n\n";
      summary += "Apakah data pesanan di atas sudah benar?\n";
      summary += "Silakan klik tombol **✅ YA, Buat Pesanan** di bawah untuk memproses pembayaran:";

      await sendMsg(phone, summary, { keyboard: 'confirm' });
      return { status: true, message: 'Summary sent', replies };
    }

    case 'ORDERING_CONFIRM':
      if (['ya', 'oke', 'ok', 'benar', '1', 'siap', 'y', 'yes', 'deal'].includes(cmdLower)) {
        const finRes = await handleFinalizeOrder(phone, tempData, session, configs, sendMsg);
        return { ...finRes, replies };
      } else if (['batal', 'tidak', 'gak', 'ga', '2', 'cancel', 'no'].includes(cmdLower)) {
        session.state = 'IDLE';
        session.tempData = {};
        session.markModified('tempData');
        await session.save();
        await sendMsg(phone, `❌ Pesanan berhasil dibatalkan. Terima kasih!\n\nKetik *MENU* jika ingin melihat daftar menu kami kembali.`);
        return { status: true, message: 'Order cancelled by user', replies };
      } else {
        await sendMsg(phone, `⚠️ Mohon klik **✅ YA, Buat Pesanan** jika sudah benar, atau **❌ Batal** untuk membatalkan.`, { keyboard: 'confirm' });
        return { status: true, message: 'Waiting valid confirm', replies };
      }

    default:
      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      await sendMsg(phone, `Halo kak! Ketik *MENU* untuk melihat katalog menu makanan & minuman kami 😊`);
      return { status: true, message: 'Fallback to default IDLE', replies };
  }
}
