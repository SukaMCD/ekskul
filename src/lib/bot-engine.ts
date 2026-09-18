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
} from './telegram';
import { createXenditInvoice } from './xendit';
import { askGroqChatbot, analyzeSentiment, parseOrderWithGroq, ParsedOrderResult } from './groq';

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
    keyboard?: 'main' | 'order_type' | 'confirm' | 'express_confirm' | 'cancel' | 'none';
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
      `Waduh maaf ya Kak, menu *${menu.name}* kebetulan stoknya lagi habis nih 🥺 Mau coba menu lainnya Kak? (Bisa ketik *MENU* untuk lihat daftar yang ready yaa)`
    );
    return { status: true, message: 'Out of stock', replies };
  }

  if (menu.trackStock && qty > currentStock) {
    await sendMsg(
      phone,
      `Untuk *${menu.name}*, stok di dapur tinggal sisa *${currentStock}* porsi lagi nih Kak. Mau pesan berapa porsi Kak? 😊`
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

  let confirmMsg = `Sip Kak, *${qty}x ${menu.name}* udah masuk keranjang ya! 👍\n`;
  confirmMsg += `🛒 Total Keranjang: *${tempData.total_items} item* (Rp ${Number(tempData.subtotal).toLocaleString('id-ID')})\n\n`;
  confirmMsg += `Mau nambah menu lain atau langsung diproses nih Kak? Ketik menu berikutnya, atau ketik *SELESAI* kalau udah cukup yaa 😊`;

  await sendMsg(phone, confirmMsg);
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
          stockErrors.push(`• *${menu.name}*: stoknya kebetulan lagi habis nih Kak 🥺`);
          continue;
        }
        if (menu.trackStock && qty > availableStock) {
          stockErrors.push(`• *${menu.name}*: sisa di dapur tinggal *${availableStock}* porsi lagi nih Kak (tadi Kakak pesan ${qty})`);
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
    let msg = "Yah maaf banget ya Kak 🙏 Untuk menu yang Kakak mau kebetulan stoknya lagi ada kendala nih:\n\n";
    msg += stockErrors.join('\n') + '\n\n';
    msg += "Mau coba pilih menu lainnya Kak? Kakak bisa ketik *MENU* untuk intip daftar yang masih ready yaa 😊";
    await sendMsg(phone, msg);
    return { status: true, message: 'Stock not available' };
  }

  if (parsedItems.length === 0) {
    // 1. Coba deteksi pesanan bahasa alami dengan AI Groq terlebih dahulu
    try {
      const parsedOrder = await parseOrderWithGroq({
        userMessage: text,
        customerName: session.tempData?.customer_name || session.customerName,
        configs,
        phone,
      });

      if (parsedOrder && parsedOrder.isOrderIntent && parsedOrder.items.length > 0) {
        return applyParsedOrderToSession({
          phone,
          parsedOrder,
          session,
          tempData,
          pushName: session.tempData?.customer_name || session.customerName,
          sendMsg,
        });
      }
    } catch (e: any) {
      console.error('[BotEngine] AI Order Parsing in handleProcessOrderItems error:', e.message);
    }

    // 2. Coba tanyakan ke Groq AI Chatbot jika pelanggan bertanya seputar menu/resto
    try {
      const aiReply = await askGroqChatbot({
        userMessage: text,
        customerName: session.tempData?.customer_name || session.customerName,
        configs,
        phone,
      });

      if (aiReply) {
        let replyWithHelp = `${aiReply}\n\n`;
        replyWithHelp += `─────────────────────────\n`;
        replyWithHelp += `💡 _Ketik nama menu yang mau dipesan (atau ketik *MENU* untuk lihat katalog yaa):_`;

        await sendMsg(phone, replyWithHelp);
        return { status: true, message: 'Groq AI Q&A during ordering' };
      }
    } catch (e: any) {
      console.error('[BotEngine] Groq AI Q&A error during ordering:', e.message);
    }

    let msg = "Maaf ya Kak, aku belum nangkep nih tadi mau pesan apa hehe 😅\n\n";
    msg += "Kakak bisa langsung ketik santai apa yang mau dipesan, contohnya:\n";
    msg += "• *Ayam Bakar 2, Es Teh 1*\n";
    msg += "• *Pesen Kopi Aren 2 di Meja 3*\n\n";
    msg += "Atau ketik *MENU* dulu ya kalau mau intip daftar lengkapnya 😊";
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

  let reply = "Sip Kak, pesanannya udah dicatat ya: ✨\n";
  for (const it of parsedItems) {
    const p = 'Rp ' + Number(it.price).toLocaleString('id-ID');
    const s = 'Rp ' + Number(it.subtotal).toLocaleString('id-ID');
    reply += `• ${it.menuName || it.menu_name} (${it.quantity}x @ ${p}) = *${s}*\n`;
  }
  reply += `Subtotal: *Rp ${subtotal.toLocaleString('id-ID')}*\n`;

  if (stockErrors.length > 0) {
    reply += `\n⚠️ _Catatan stok:_\n${stockErrors.join('\n')}\n`;
  }

  if (unrecognized.length > 0) {
    reply += `\n_(Menu [${unrecognized.join(', ')}] kebetulan belum ada di daftar jadi dilewati dulu ya Kak)_\n`;
  }

  reply += "\n─────────────────────────\n";
  reply += "Mau dinikmati di mana nih Kak?\n";
  reply += "1️⃣ Makan di Tempat (Dine-In)\n";
  reply += "2️⃣ Bungkus bawa pulang (Takeaway)\n";
  reply += "3️⃣ Pesan antar ke alamat (Delivery)\n\n";
  reply += "Ketik *1*, *2*, atau *3* ya Kak 😊";

  await sendMsg(phone, reply, { keyboard: 'order_type' });
  return { status: true, message: 'Items parsed and stored' };
}

async function applyParsedOrderToSession({
  phone,
  parsedOrder,
  session,
  tempData,
  pushName,
  sendMsg,
}: {
  phone: string;
  parsedOrder: ParsedOrderResult;
  session: any;
  tempData: any;
  pushName?: string;
  sendMsg: SendFn;
}): Promise<{ status: boolean; message: string }> {
  await connectDB();
  const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });

  // 1. Combine or set items
  const existingItems = Array.isArray(tempData.items) ? [...tempData.items] : [];
  for (const newItem of parsedOrder.items) {
    const existingIdx = existingItems.findIndex(
      (it: any) => it.menuCode.toUpperCase() === newItem.menuCode.toUpperCase()
    );
    if (existingIdx >= 0) {
      existingItems[existingIdx].quantity += newItem.quantity;
      existingItems[existingIdx].subtotal =
        existingItems[existingIdx].quantity * Number(existingItems[existingIdx].price);
      if (newItem.notes) {
        existingItems[existingIdx].notes = existingItems[existingIdx].notes
          ? `${existingItems[existingIdx].notes}, ${newItem.notes}`
          : newItem.notes;
      }
    } else {
      existingItems.push(newItem);
    }
  }

  // 2. Validate stock
  const stockErrors: string[] = [];
  const finalItems: any[] = [];
  for (const it of existingItems) {
    const menuDoc = availableMenus.find((m) => m.code.toUpperCase() === it.menuCode.toUpperCase());
    if (menuDoc && menuDoc.trackStock) {
      const stock = menuDoc.stock !== undefined ? menuDoc.stock : 50;
      if (stock <= 0) {
        stockErrors.push(`• *${menuDoc.name}*: stoknya kebetulan lagi habis nih Kak 🥺`);
        continue;
      }
      if (it.quantity > stock) {
        stockErrors.push(`• *${menuDoc.name}*: sisa di dapur tinggal *${stock}* porsi lagi nih Kak (tadi dipesan ${it.quantity})`);
        it.quantity = stock;
        it.subtotal = stock * it.price;
      }
    }
    finalItems.push(it);
  }

  if (finalItems.length === 0) {
    let err = "Yah maaf banget ya Kak 🙏 Untuk menu yang ingin dipesan kebetulan stoknya lagi habis nih:\n\n";
    err += stockErrors.join('\n') + '\n\n';
    err += "Mau coba pilih menu lainnya Kak? Ketik *MENU* untuk intip daftar yang masih ready yaa 😊";
    await sendMsg(phone, err);
    return { status: true, message: 'All items out of stock' };
  }

  const subtotal = finalItems.reduce((sum: number, it: any) => sum + Number(it.subtotal), 0);
  const totalItems = finalItems.reduce((sum: number, it: any) => sum + Number(it.quantity), 0);

  // 3. Determine orderType & table/address
  let orderType = parsedOrder.orderType || tempData.order_type;
  let tableNumber = parsedOrder.tableNumber || (tempData.order_type === 'dine_in' ? tempData.delivery_address : null);
  let deliveryAddress = parsedOrder.deliveryAddress || (tempData.order_type === 'delivery' ? tempData.delivery_address : null);

  // If tableNumber exists, it is definitely dine_in
  if (tableNumber) {
    orderType = 'dine_in';
  } else if (!orderType && tempData.table_auto_detected) {
    orderType = 'dine_in';
    tableNumber = tempData.delivery_address;
  }

  const customerName = pushName || tempData.customer_name || 'Pelanggan';

  tempData.items = finalItems;
  tempData.subtotal = subtotal;
  tempData.total_items = totalItems;
  tempData.customer_name = customerName;
  if (parsedOrder.notes) {
    tempData.notes = parsedOrder.notes;
  }

  // Skenario A: Dine-in tapi nomor meja belum ada
  if (orderType === 'dine_in' && !tableNumber) {
    tempData.order_type = 'dine_in';
    tempData.delivery_fee = 0;
    tempData.waiting_table_number = true;
    session.state = 'ORDERING_NAME_ADDRESS';
    session.tempData = tempData;
    session.markModified('tempData');
    await session.save();

    let askTable = parsedOrder.aiFriendlySummary ? `${parsedOrder.aiFriendlySummary}\n\n` : '';
    askTable += `Btw Kakak lagi duduk di **meja nomor berapa** nih biar nanti kita antarkan? 😊\n`;
    askTable += `_(Cukup balas nomor mejanya aja ya, contoh: *Meja 3*)_`;

    await sendMsg(phone, askTable);
    return { status: true, message: 'AI Dine-in waiting for table number' };
  }

  // Skenario B: Belum tahu tipe pesanan sama sekali
  if (!orderType) {
    session.state = 'ORDERING_TYPE';
    session.tempData = tempData;
    session.markModified('tempData');
    await session.save();

    let reply = parsedOrder.aiFriendlySummary ? `${parsedOrder.aiFriendlySummary}\n\n` : '';
    reply += "Sip, item pesanannya udah dicatat ya: ✨\n";
    for (const it of finalItems) {
      const note = it.notes ? ` _(${it.notes})_` : '';
      reply += `• ${it.quantity}x *${it.menuName}*${note} = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
    }
    reply += `Subtotal: *Rp ${Number(subtotal).toLocaleString('id-ID')}*\n\n`;
    reply += "Mau dinikmati di mana nih Kak?\n";
    reply += "1️⃣ Makan di Tempat (Dine-In)\n";
    reply += "2️⃣ Bungkus bawa pulang (Takeaway)\n";
    reply += "3️⃣ Pesan antar ke alamat (Delivery)\n\n";
    reply += "Ketik *1*, *2*, atau *3* ya Kak 😊";

    await sendMsg(phone, reply);
    return { status: true, message: 'AI order items parsed, asking order type' };
  }

  // Skenario C: Delivery tapi alamat belum ada
  if (orderType === 'delivery' && !deliveryAddress) {
    tempData.order_type = 'delivery';
    tempData.delivery_fee = 10000;
    session.state = 'ORDERING_NAME_ADDRESS';
    session.tempData = tempData;
    session.markModified('tempData');
    await session.save();

    let askAddr = parsedOrder.aiFriendlySummary ? `${parsedOrder.aiFriendlySummary}\n\n` : '';
    askAddr += `Siap kita antarkan ke tempat Kakak! 🛵✨\n\n`;
    askAddr += `Boleh minta alamat lengkap pengirimannya Kak? _(Sertakan patokan kalau ada yaa)_:`;

    await sendMsg(phone, askAddr);
    return { status: true, message: 'AI Delivery order waiting for address' };
  }

  // Skenario D: Semua data lengkap! (Dine-in dengan nomor meja, atau Takeaway, atau Delivery dengan alamat)
  // LANGSUNG JUMP KE ORDERING_CONFIRM TANPA FORM PANJANG!
  tempData.order_type = orderType;
  tempData.delivery_fee = orderType === 'delivery' ? 10000 : 0;
  tempData.delivery_address =
    orderType === 'dine_in'
      ? tableNumber
      : orderType === 'takeaway'
      ? 'Takeaway / Ambil di Toko'
      : deliveryAddress;
  tempData.grand_total = subtotal + tempData.delivery_fee;
  delete tempData.waiting_table_number;

  session.state = 'ORDERING_CONFIRM';
  session.tempData = tempData;
  session.markModified('tempData');
  await session.save();

  const typeTitle =
    orderType === 'dine_in'
      ? `Dine-In (${tempData.delivery_address})`
      : orderType === 'takeaway'
      ? 'Takeaway (Bungkus)'
      : `Delivery (${tempData.delivery_address})`;

  let summary = parsedOrder.aiFriendlySummary ? `${parsedOrder.aiFriendlySummary}\n\n` : '';
  summary += `Yuk dicek dulu rincian pesanannya Kak, udah pas? 📝\n`;
  summary += `═════════════════════════\n`;
  summary += `👤 *Nama:* ${tempData.customer_name}\n`;
  summary += `📌 *Tipe:* ${typeTitle}\n`;
  if (orderType !== 'takeaway') {
    summary += `📍 *Tujuan:* ${tempData.delivery_address}\n`;
  }
  if (tempData.notes && tempData.notes !== '-') {
    summary += `📝 *Catatan:* ${tempData.notes}\n`;
  }
  summary += `─────────────────────────\n`;
  summary += `*Menu yang Dipesan:*\n`;
  for (const it of finalItems) {
    const note = it.notes ? ` _(${it.notes})_` : '';
    summary += `• ${it.quantity}x *${it.menuName}*${note} : Rp ${Number(it.subtotal).toLocaleString('id-ID')}\n`;
  }
  summary += `─────────────────────────\n`;
  summary += `Subtotal: *Rp ${Number(subtotal).toLocaleString('id-ID')}*\n`;
  if (tempData.delivery_fee > 0) {
    summary += `Ongkos Kirim: *Rp ${Number(tempData.delivery_fee).toLocaleString('id-ID')}*\n`;
  }
  summary += `💰 *TOTAL BAYAR: Rp ${Number(tempData.grand_total).toLocaleString('id-ID')}*\n`;
  summary += `═════════════════════════\n\n`;
  if (stockErrors.length > 0) {
    summary += `⚠️ _Catatan Stok:_\n${stockErrors.join('\n')}\n\n`;
  }
  summary += `Kalau udah sesuai semua, balas *OKE* atau *YA* ya Kak biar langsung kita siapkan di dapur! 👨‍🍳🔥\n_(Atau ketik *BATAL* kalau mau diubah)_`;

  await sendMsg(phone, summary);
  return { status: true, message: 'AI Express order ready for confirmation' };
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
      `Waduh maaf banget ya Kak 🙏 Pas mau kita proses ke dapur, kebetulan stoknya baru aja habis/berubah nih:\n${unavailableList.join('\n')}\n\nKakak mau pilih menu lainnya? Bisa ketik *MENU* untuk cek daftar yang masih ready yaa 😊`
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

  let invoiceMsg = "🎉 *Pesanan Kakak udah berhasil dibuat!*\n";
  invoiceMsg += "═════════════════════════\n";
  invoiceMsg += `No. Invoice: *#${invoiceNo}*\n`;
  invoiceMsg += `Nama: *${newOrder.customerName}*\n`;
  invoiceMsg += "Status: *Menunggu Pembayaran ⏳*\n";
  invoiceMsg += `Total Tagihan: *Rp ${Number(newOrder.grandTotal).toLocaleString('id-ID')}*\n`;
  invoiceMsg += "═════════════════════════\n\n";

  if (xenditInvoiceUrl) {
    invoiceMsg += "💳 *Pembayaran via Xendit:*\n";
    invoiceMsg += "Kakak bisa langsung selesaikan pembayaran lewat link ini ya:\n";
    invoiceMsg += `🔗 ${xenditInvoiceUrl}\n\n`;
    invoiceMsg += "• Bisa bayar pakai *QRIS* (GoPay, OVO, DANA, ShopeePay)\n";
    invoiceMsg += "• Atau lewat *Virtual Account Bank* (BCA, BRI, BNI, Mandiri, Permata)\n\n";
    invoiceMsg += "⚡ Begitu pembayaran berhasil, pesanan Kakak otomatis terverifikasi dan langsung kami siapkan di dapur tanpa perlu kirim bukti transfer yaa!\n\n";
    invoiceMsg += "Ketik *STATUS* kapan aja kalau mau cek status pesanannya. Terima kasih banyak ya Kak! 🙏🍽️";

    await sendMsg(phone, invoiceMsg);
  } else {
    invoiceMsg += "💳 *Pembayaran Transfer Manual:*\n";
    invoiceMsg += `${bankInfo}\n\n`;
    invoiceMsg += "📸 Setelah transfer, boleh tolong *kirim foto bukti transfernya* ke chat ini ya Kak biar pesanan Kakak langsung kita proses ke dapur!\n\n";
    invoiceMsg += "Ketik *STATUS* kapan saja kalau mau cek perkembangan pesanannya. Makasih banyak ya Kak! 🙏😊";

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

  // Load configs
  const configs = await getBotConfigs();
  const adminPhone = normalizePhone(configs.admin_phone || '');
  const adminChatId = String(configs.telegram_admin_chat_id || '').trim();
  const botActive = configs.bot_active === '1';
  const storeName = configs.store_name || 'Leafly Resto';
  const storeAddr = configs.store_address || 'Jl. Boulevard Raya No. 88, Surabaya';
  const storeGmaps = configs.store_gmaps || '';
  const storeHours = configs.store_hours || '10.00 - 22.00 WIB';
  const bankInfo = configs.bank_info || 'Pembayaran BCA / QRIS';

  // Analisis sentimen pesan masuk
  let sentimentData: any = undefined;
  if (text && text.trim().length > 0) {
    try {
      sentimentData = await analyzeSentiment(text, configs);
    } catch {
      // ignore
    }
  }

  const rawJson = JSON.stringify(data);
  await logBotMessage(
    phone,
    'inbound',
    isTelegram ? (type === 'image' ? 'telegram_image' : 'telegram_text') : type,
    text || (type === 'image' ? '[GAMBAR/BUKTI]' : ''),
    rawJson,
    isSimulation ? 'simulated_inbound' : 'received',
    200,
    '',
    sentimentData
  );

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
      keyboard?: 'main' | 'order_type' | 'confirm' | 'express_confirm' | 'cancel' | 'none';
      replyMarkup?: any;
    }
  ) => {
    replies.push(msg);
    if (isSimulation) {
      await logBotMessage(targetPhone, 'outbound', isTelegram ? 'telegram_text' : 'text', msg, '', 'simulated');
    } else if (isTelegram || configs.gateway_provider === 'telegram') {
      // Tombol interaktif dinonaktifkan: bersihkan keyboard agar chat murni berbasis teks
      await sendTelegramMessage(targetPhone, msg, configs, {
        reply_markup: { remove_keyboard: true },
      });
    } else {
      await sendWhatsAppMessage(targetPhone, msg, configs);
    }
  };

  // Telegram /start handler: resets session and sends welcome, with QR Table deep-link support
  if (cmdLower === 'start' || text === '/start' || text.startsWith('/start')) {
    let session = await BotSession.findOne({ phone });
    if (!session) {
      session = await BotSession.create({ phone, state: 'IDLE', tempData: {}, isPaused: false });
    }

    // Check if /start has deep-link payload (e.g. /start meja_04, /start table_4, /start meja4, /start t3, /start dinein_2)
    const startParam = text.replace(/^\/start\s*/i, '').trim();
    const tableMatch = startParam.match(/(?:meja[_-]?|table[_-]?|dinein[_-]?|t)(\d+)/i);

    if (tableMatch && tableMatch[1]) {
      const tableNum = String(parseInt(tableMatch[1], 10)).padStart(2, '0');
      const tableName = `MEJA ${tableNum}`;

      session.state = 'IDLE';
      session.tempData = {
        order_type: 'dine_in',
        delivery_address: tableName,
        customer_name: data.pushName || data.username || 'Pelanggan',
        table_auto_detected: true,
      };
      session.isPaused = false;
      session.markModified('tempData');
      await session.save();

      let qrWelcome = `🍽️ *SELAMAT DATANG DI ${storeName.toUpperCase()}!* 🍽️\n`;
      qrWelcome += `═════════════════════════\n`;
      qrWelcome += `Halo Kak *${data.pushName || 'Pelanggan'}*! Kakak terhubung di *${tableName}*.\n\n`;
      qrWelcome += `✨ *Pesan Cepat AI (Tanpa Isi Form Panjang):*\n`;
      qrWelcome += `Cukup ketik santai apa yang ingin dipesan, contoh:\n`;
      qrWelcome += `• _"Pesen Kopi Aren 2 sama Roti Bakar 1 ya"_\n`;
      qrWelcome += `• _"Ayam Geprek 2 pedes banget, Es Teh Manis 2"_\n\n`;
      qrWelcome += `Atau ketik *MENU* untuk melihat katalog lengkap. Mau pesan apa hari ini kak? 😊`;

      await sendMsg(phone, qrWelcome);
      return { status: true, message: `Dine-in table ${tableName} auto-configured via QR`, replies };
    }

    session.state = 'IDLE';
    session.tempData = {};
    session.isPaused = false;
    await session.save();

    const welcomeTpl =
      configs.welcome_message ||
      `Halo Kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nKakak bisa langsung chat santai mau pesan apa, atau ketik pilihan ini ya:\n• *MENU* : Lihat daftar menu & harga\n• *ORDER* : Buat pesanan baru\n• *STATUS* : Cek status pesanan\n• *INFO* : Jam operasional & alamat resto\n• *ADMIN* : Ngobrol langsung dengan staf kami`;
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
  const senderName = data.pushName || data.username || 'Pelanggan';
  let session = await BotSession.findOne({ phone });
  if (!session) {
    session = await BotSession.create({
      phone,
      state: 'IDLE',
      tempData: { customer_name: senderName },
      isPaused: false,
    });
  } else if (data.pushName && session.tempData?.customer_name !== data.pushName) {
    if (!session.tempData) session.tempData = {};
    session.tempData.customer_name = data.pushName;
    session.markModified('tempData');
    await session.save();
  }

  let tempData = session.tempData || {};
  if (!tempData.customer_name) {
    tempData.customer_name = senderName;
  }

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

      const reply = `Terima kasih banyak ya Kak! 📸✨\n\nBukti transfer untuk pesanan *#${latestUnpaid.invoiceNo}* sudah kami terima dan sedang dicek tim kami. Pesanan Kakak langsung kami siapkan yaa 🍳\n\nKakak bisa ketik *STATUS* kapan saja untuk pantau pesanannya.`;
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
      const reply = `Makasih kiriman fotonya ya Kak! 😊\nKalau Kakak mau pesan makanan atau minuman, langsung ketik aja pesanannya atau ketik *MENU* yaa~`;
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
    await sendMsg(phone, `Siap Kak, pesanan sebelumnya sudah dibatalkan ya. Santai aja, kalau mau pesan lagi atau butuh bantuan tinggal chat yaa 😊`);
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
        : `📋 *Daftar Menu Resto*\n\n_(Menu saat ini sedang dalam pembaruan tim dapur ya Kak)_\n\nKakak bisa tanya langsung ke staf kami lewat ketik *ADMIN*, atau ketik *INFO* yaa 😊`;
      await sendMsg(phone, msgToSend);
    } catch (err: any) {
      await sendMsg(phone, `⚠️ Waduh, maaf ya Kak ada kendala pas memuat menu. Coba lagi sebentar lagi atau ketik *INFO* yaa.`);
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
        billMsg += `Silakan buka tautan berikut untuk membayar via **QRIS, VA Bank, atau E-Wallet**:\n${targetOrder.xenditInvoiceUrl}`;
        await sendMsg(phone, billMsg);
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

          billMsg += `Silakan buka tautan berikut untuk membayar via **QRIS, VA Bank, atau E-Wallet**:\n${xenditRes.data.invoice_url}`;
          await sendMsg(phone, billMsg);
          return { status: true, message: 'New payment link sent', replies };
        } else {
          billMsg += `_Silakan transfer ke rekening berikut:_\n\n${bankInfo}`;
          await sendMsg(phone, billMsg);
          return { status: true, message: 'Manual bank info sent', replies };
        }
      }
    }
  }

  // Batalkan Pesanan Tertentu
  const cancelSpecificMatch = text.match(/(?:❌\s*)?batal(?:kan)?\s*(?:#)?(ORD-[\d-]+)/i);
  if (cancelSpecificMatch) {
    const invNo = cancelSpecificMatch[1];
    const targetOrder = await Order.findOne({ invoiceNo: invNo, customerPhone: phone });
    if (targetOrder) {
      targetOrder.orderStatus = 'cancelled';
      await targetOrder.save();
      await sendMsg(phone, `✅ Pesanan *#${invNo}* telah berhasil dibatalkan.\n\nSilakan ketik *MENU* atau *ORDER* untuk membuat pesanan baru.`);
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

    await sendMsg(phone, `Halo Kak, chat Kakak sudah kami sambungkan ke staf kami yaa. Sebentar lagi staf kami akan langsung balas chat Kakak di sini 😊\n\n_(Bot dijeda sementara waktu agar Kakak bisa ngobrol langsung)_`);

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
    // Hanya proses secara manual jika teksnya ketat berupa kode menu singkat (misal: "M1 2, D1 1")
    // Jika mengandung kata-kata bahasa manusia (ayam, bakar, meja, alamat, bungkus, dll), serahkan ke AI parser!
    const isStrictCodePattern =
      /^([A-Za-z0-9]{1,4}\s*[:xX]?\s*\d*\s*[,;\s]*)+$/.test(itemsText) &&
      !/(alamat|meja|bawa|pulang|bungkus|antar|kirim|takeaway|delivery|dine|toko|kos|jalan|jl|pedes|pedas|manis|sambal|makan|porsi)/i.test(itemsText);

    if (isStrictCodePattern) {
      const res = await handleProcessOrderItems(phone, itemsText, tempData, session, configs, sendMsg);
      return { ...res, replies };
    }
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
        phone,
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

        let guide = "Mau pesan apa nih Kak hari ini? 🍽️✨\n\n";
        guide += "Kakak bisa langsung ketik santai apa yang mau dipesan, contohnya:\n";
        guide += "• _\"Pesen Kopi Aren 2 di meja 3\"_\n";
        guide += "• _\"Ayam Geprek 2 pedes banget, Es Teh Manis 1 bungkus\"_\n\n";
        guide += "Atau kalau mau intip daftar lengkapnya dulu, ketik *MENU* yaa 😊";

        await sendMsg(phone, guide);
        return { status: true, message: 'Ordering guide sent', replies };
      }

      // Deteksi jika pesan adalah pertanyaan/pernyataan (bukan salam pembuka sederhana)
      const isSimpleGreeting = /^(halo|hai|hi|hei|p|ping|tes|test|selamat\s+(pagi|siang|sore|malam)|mulai|start|\/start|assalamualaikum|kulonuwun)$/i.test(text.trim());

      if (!isSimpleGreeting && text.trim().length > 1) {
        // 1. Coba deteksi apakah pesan merupakan pesanan dengan AI Groq
        try {
          const parsedOrder = await parseOrderWithGroq({
            userMessage: text,
            customerName: data.pushName,
            configs,
            phone,
          });

          if (parsedOrder && parsedOrder.isOrderIntent && parsedOrder.items.length > 0) {
            const aiOrderRes = await applyParsedOrderToSession({
              phone,
              parsedOrder,
              session,
              tempData,
              pushName: data.pushName,
              sendMsg,
            });
            return { ...aiOrderRes, replies };
          }
        } catch (err: any) {
          console.error('[BotEngine] AI Order Parsing error in IDLE:', err.message);
        }

        // 2. Jika bukan pesanan, jawab pertanyaan dengan Groq AI Chatbot
        try {
          const aiReply = await askGroqChatbot({
            userMessage: text,
            customerName: data.pushName,
            configs,
            phone,
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
      const welcomeTpl = configs.welcome_message || `Halo Kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nKakak bisa langsung chat santai mau pesan apa, atau ketik pilihan ini ya:\n• *MENU* : Lihat daftar menu & harga\n• *ORDER* : Buat pesanan baru\n• *STATUS* : Cek status pesanan\n• *INFO* : Jam operasional & alamat resto\n• *ADMIN* : Ngobrol langsung dengan staf kami`;
      const welcomeMsg = welcomeTpl.replace(/{store_name}/g, storeName);
      await sendMsg(phone, welcomeMsg);
      return { status: true, message: 'Welcome sent', replies };

    case 'ORDERING_ITEMS': {
      const availableMenus = await Menu.find({ isAvailable: true }).sort({ code: 1 });
      const cleanLower = text.toLowerCase().trim();

      // 1. Cek jika user ketik "selesai" / "lanjut"
      if (cleanLower.includes('selesai') || cleanLower.includes('lanjut') || cleanLower === 'deal') {
        const currentItems = tempData.items || [];
        if (currentItems.length === 0) {
          await sendMsg(
            phone,
            "Keranjang Kakak masih kosong nih. Yuk ketik menu yang mau dipesan (atau ketik *MENU* buat intip pilihannya yaa):"
          );
          return { status: true, message: 'Cart empty', replies };
        }

        session.state = 'ORDERING_TYPE';
        session.markModified('tempData');
        await session.save();

        let reply = "Sip, ini daftar pesanan Kakak sejauh ini ya: ✨\n";
        for (const it of currentItems) {
          reply += `• ${it.menuName} (${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')}) = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        reply += `Subtotal: *Rp ${Number(tempData.subtotal).toLocaleString('id-ID')}*\n\n`;
        reply += "─────────────────────────\n";
        reply += "Mau dinikmati di mana nih Kak?\n";
        reply += "1️⃣ Makan di Tempat (Dine-In)\n";
        reply += "2️⃣ Bungkus bawa pulang (Takeaway)\n";
        reply += "3️⃣ Pesan antar ke alamat (Delivery)\n\n";
        reply += "Ketik *1*, *2*, atau *3* ya Kak 😊";

        await sendMsg(phone, reply);
        return { status: true, message: 'Proceeded to order type', replies };
      }

      // 2. Cek jika user ketik "keranjang" / "cart"
      if (cleanLower.includes('keranjang') || cleanLower.includes('cart')) {
        const currentItems = tempData.items || [];
        if (currentItems.length === 0) {
          await sendMsg(
            phone,
            "Keranjang belanja Kakak masih kosong nih 😊\nYuk ketik menu yang mau dipesan, atau ketik *MENU* untuk lihat daftar yaa!"
          );
          return { status: true, message: 'Cart empty', replies };
        }

        let cartMsg = "🛒 *Isi Keranjang Belanja Kakak:*\n";
        cartMsg += "═════════════════════════\n";
        for (const it of currentItems) {
          cartMsg += `• ${it.menuName}\n  ${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')} = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        cartMsg += "─────────────────────────\n";
        cartMsg += `💰 *Subtotal: Rp ${Number(tempData.subtotal).toLocaleString('id-ID')}* (${tempData.total_items} item)\n\n`;
        cartMsg += "Mau nambah menu lain? Tinggal ketik aja ya. Kalau sudah selesai, ketik *SELESAI* ya Kak 😊";

        await sendMsg(phone, cartMsg);
        return { status: true, message: 'Cart displayed', replies };
      }

      // 3. Cek jika user ketik "kosongkan keranjang"
      if (cleanLower.includes('kosongkan')) {
        tempData.items = [];
        tempData.subtotal = 0;
        tempData.total_items = 0;
        session.tempData = tempData;
        session.markModified('tempData');
        await session.save();

        await sendMsg(
          phone,
          "Siap, keranjang belanja sudah dikosongkan ya Kak 👍\nSilakan ketik menu baru yang ingin dipesan (atau ketik *MENU* yaa):"
        );
        return { status: true, message: 'Cart cleared', replies };
      }

      // 4. Cek jika user ketik "katalog" / "menu"
      if (cleanLower.includes('katalog lengkap') || cleanLower === 'katalog') {
        const catalog = await getFormattedMenuForBot();
        await sendMsg(phone, catalog);
        return { status: true, message: 'Full catalog sent in ordering', replies };
      }

      // 5. Cek jika user input nama / kode menu (misal: "M1" atau "Ayam Geprek")
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

        let porsiMsg = `Mau pesan berapa porsi *${matchedMenu.name}*-nya Kak? 😊\n`;
        porsiMsg += `💰 Rp ${Number(matchedMenu.price).toLocaleString('id-ID')} / porsi\n`;
        if (matchedMenu.description) {
          porsiMsg += `_${matchedMenu.description}_\n`;
        }
        porsiMsg += `\nCukup balas dengan angka porsi yaa (contoh: *1* atau *2*):`;

        await sendMsg(phone, porsiMsg);
        return { status: true, message: 'Quantity prompt sent', replies };
      }

      // 6. Coba deteksi pesanan bahasa alami dengan AI Groq
      try {
        const parsedOrder = await parseOrderWithGroq({
          userMessage: text,
          customerName: data.pushName,
          configs,
          phone,
        });

        if (parsedOrder && parsedOrder.isOrderIntent && parsedOrder.items.length > 0) {
          const aiOrderRes = await applyParsedOrderToSession({
            phone,
            parsedOrder,
            session,
            tempData,
            pushName: data.pushName,
            sendMsg,
          });
          return { ...aiOrderRes, replies };
        }
      } catch (err: any) {
        console.error('[BotEngine] AI Order Parsing error in ORDERING_ITEMS:', err.message);
      }

      // 7. Fallback ke parser multi-item (misal: "M1 2, D1 1")
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
        await sendMsg(phone, "Silakan ketik nama menu yang ingin dipesan:");
        return { status: true, message: 'Back to menu list from qty', replies };
      }

      if (cleanLower.includes('lihat keranjang') || cleanLower.includes('keranjang')) {
        let cartMsg = "🛒 *RINCIAN KERANJANG BELANJA:*\n";
        cartMsg += "═════════════════════════\n";
        for (const it of (tempData.items || [])) {
          cartMsg += `• ${it.menuName} (${it.quantity}x @ Rp ${Number(it.price).toLocaleString('id-ID')}) = *Rp ${Number(it.subtotal).toLocaleString('id-ID')}*\n`;
        }
        cartMsg += `Subtotal: *Rp ${Number(tempData.subtotal || 0).toLocaleString('id-ID')}*\n`;
        await sendMsg(phone, cartMsg);
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
        await sendMsg(phone, "⚠️ Silakan ketik menu yang ingin dipesan (ketik *MENU* untuk katalog):");
        return { status: true, message: 'Menu not found in qty step', replies };
      }

      return handleAddSingleItemToCart(phone, menu, qty, tempData, session, configs, sendMsg, availableMenus, replies);
    }

    case 'ORDERING_TYPE': {
      let chosenType: 'dine_in' | 'takeaway' | 'delivery' | null = null;
      const cleanLower = text.toLowerCase();

      if (cleanLower.includes('dine') || cleanLower.includes('makan di tempat') || cmdLower === '1' || cleanLower.startsWith('1')) {
        chosenType = 'dine_in';
      } else if (cleanLower.includes('takeaway') || cleanLower.includes('bungkus') || cleanLower.includes('take away') || cmdLower === '2' || cleanLower.startsWith('2')) {
        chosenType = 'takeaway';
      } else if (cleanLower.includes('delivery') || cleanLower.includes('antar') || cleanLower.includes('kirim') || cmdLower === '3' || cleanLower.startsWith('3')) {
        chosenType = 'delivery';
      }

      if (!chosenType) {
        // Coba cek jika pelanggan menanyakan info atau merubah/menambah pesanan dengan AI
        try {
          const parsedOrder = await parseOrderWithGroq({
            userMessage: text,
            customerName: data.pushName,
            configs,
            phone,
          });
          if (
            parsedOrder &&
            parsedOrder.isOrderIntent &&
            (parsedOrder.items.length > 0 || parsedOrder.orderType || parsedOrder.tableNumber || parsedOrder.deliveryAddress)
          ) {
            const aiOrderRes = await applyParsedOrderToSession({
              phone,
              parsedOrder,
              session,
              tempData,
              pushName: data.pushName,
              sendMsg,
            });
            return { ...aiOrderRes, replies };
          }
        } catch {}

        try {
          const aiReply = await askGroqChatbot({
            userMessage: text,
            customerName: data.pushName,
            configs,
            phone,
          });
          if (aiReply) {
            await sendMsg(
              phone,
              `${aiReply}\n\n─────────────────────────\nSilakan balas pilihan tipe pesanan kakak (1: Dine-In, 2: Takeaway, 3: Delivery):`
            );
            return { status: true, message: 'AI Q&A handled in ORDERING_TYPE', replies };
          }
        } catch {}

        await sendMsg(
          phone,
          `⚠️ Silakan balas pilihan tipe pesanan kakak (1: Dine-In, 2: Takeaway, 3: Delivery):`
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
        tempData.customer_name = data.pushName || data.username || 'Pelanggan';
        await sendMsg(
          phone,
          `Siap, makan di tempat (Dine-In) ya Kak 🍽️\n\nBtw Kakak lagi duduk di meja berapa nih? Cukup ketik nomor mejanya ya (contoh: *Meja 3*):`
        );
      } else if (chosenType === 'takeaway') {
        const custName = data.pushName || data.username || 'Pelanggan';
        tempData.customer_name = custName;
        tempData.delivery_address = 'Takeaway / Ambil di Toko';
        tempData.delivery_fee = 0;
        const subtotal = Number(tempData.subtotal || 0);
        tempData.grand_total = subtotal;
        if (!tempData.notes) tempData.notes = '-';

        session.state = 'ORDERING_CONFIRM';
        session.tempData = tempData;
        session.markModified('tempData');
        await session.save();

        let summary = `Yuk dicek dulu pesanannya Kak, udah pas? 🛍️\n`;
        summary += `═════════════════════════\n`;
        summary += `👤 *Nama:* ${custName}\n`;
        summary += `📌 *Tipe:* Bungkus Bawa Pulang (Takeaway)\n`;
        if (tempData.notes && tempData.notes !== '-') {
          summary += `📝 *Catatan:* ${tempData.notes}\n`;
        }
        summary += `─────────────────────────\n`;
        summary += `*Menu yang Dipesan:*\n`;
        for (const it of (tempData.items || [])) {
          const note = it.notes ? ` _(${it.notes})_` : '';
          summary += `• ${it.quantity}x *${it.menuName}*${note} : Rp ${Number(it.subtotal).toLocaleString('id-ID')}\n`;
        }
        summary += `─────────────────────────\n`;
        summary += `💰 *TOTAL BAYAR: Rp ${Number(tempData.grand_total).toLocaleString('id-ID')}*\n`;
        summary += `═════════════════════════\n\n`;
        summary += `Kalau udah oke, ketik *YA* atau *OKE* ya Kak biar langsung kita siapkan di dapur! 👨‍🍳🔥\n_(Atau ketik *BATAL* kalau mau diubah)_`;

        await sendMsg(phone, summary);
        return { status: true, message: 'Takeaway fast confirmed with telegram name', replies };
      } else {
        tempData.customer_name = data.pushName || data.username || 'Pelanggan';
        await sendMsg(
          phone,
          `Siap, pesan antar (Delivery) ya Kak 🛵✨\n\nBoleh minta alamat lengkap pengirimannya Kak? _(Sertakan patokan kalau ada yaa)_:`
        );
      }
      return { status: true, message: 'Order type chosen', replies };
    }

    case 'ORDERING_NAME_ADDRESS': {
      const nameInput = text.trim();
      const oType = tempData.order_type || 'dine_in';
      tempData.customer_name = data.pushName || data.username || 'Pelanggan';

      if (oType === 'dine_in' || tempData.waiting_table_number) {
        let tableStr = nameInput;
        const numMatch = nameInput.match(/(\d+)/);
        if (numMatch) {
          tableStr = `MEJA ${String(parseInt(numMatch[1], 10)).padStart(2, '0')}`;
        } else if (/^meja\s*\d+/i.test(nameInput)) {
          tableStr = nameInput.toUpperCase();
        }
        tempData.delivery_address = tableStr;
        delete tempData.waiting_table_number;

        // Express bypass untuk Dine-In: jika item pesanan sudah ada, langsung lompat ke konfirmasi tanpa form panjang!
        if (Array.isArray(tempData.items) && tempData.items.length > 0) {
          const subtotal = Number(tempData.subtotal || 0);
          tempData.delivery_fee = 0;
          tempData.grand_total = subtotal;
          if (!tempData.notes) tempData.notes = '-';

          session.state = 'ORDERING_CONFIRM';
          session.tempData = tempData;
          session.markModified('tempData');
          await session.save();

          let summary = `Yuk dicek dulu pesanannya Kak, udah pas? 🍽️\n`;
          summary += `═════════════════════════\n`;
          summary += `👤 *Nama:* ${tempData.customer_name}\n`;
          summary += `📍 *Meja:* ${tempData.delivery_address}\n`;
          if (tempData.notes && tempData.notes !== '-') {
            summary += `📝 *Catatan:* ${tempData.notes}\n`;
          }
          summary += `─────────────────────────\n`;
          summary += `*Menu yang Dipesan:*\n`;
          for (const it of tempData.items) {
            const note = it.notes ? ` _(${it.notes})_` : '';
            summary += `• ${it.quantity}x *${it.menuName}*${note} : Rp ${Number(it.subtotal).toLocaleString('id-ID')}\n`;
          }
          summary += `─────────────────────────\n`;
          summary += `💰 *TOTAL BAYAR: Rp ${Number(tempData.grand_total).toLocaleString('id-ID')}*\n`;
          summary += `═════════════════════════\n\n`;
          summary += `Kalau udah oke, ketik *YA* atau *OKE* ya Kak biar langsung kita siapkan di dapur! 👨‍🍳🔥\n_(Atau ketik *BATAL* kalau mau diubah)_`;

          await sendMsg(phone, summary);
          return { status: true, message: 'Dine-in table set, jumped to confirm', replies };
        }
      } else if (oType === 'takeaway') {
        tempData.delivery_address = 'Takeaway / Ambil di Toko';
      } else {
        // Delivery
        tempData.delivery_address = nameInput;

        // Express bypass untuk Delivery: jika item sudah ada, langsung ke konfirmasi
        if (Array.isArray(tempData.items) && tempData.items.length > 0) {
          const subtotal = Number(tempData.subtotal || 0);
          tempData.delivery_fee = 10000;
          tempData.grand_total = subtotal + tempData.delivery_fee;
          if (!tempData.notes) tempData.notes = '-';

          session.state = 'ORDERING_CONFIRM';
          session.tempData = tempData;
          session.markModified('tempData');
          await session.save();

          let summary = `Yuk dicek dulu pesanannya Kak, udah pas? 🛵\n`;
          summary += `═════════════════════════\n`;
          summary += `👤 *Nama:* ${tempData.customer_name}\n`;
          summary += `📍 *Alamat:* ${tempData.delivery_address}\n`;
          if (tempData.notes && tempData.notes !== '-') {
            summary += `📝 *Catatan:* ${tempData.notes}\n`;
          }
          summary += `─────────────────────────\n`;
          summary += `*Menu yang Dipesan:*\n`;
          for (const it of tempData.items) {
            const note = it.notes ? ` _(${it.notes})_` : '';
            summary += `• ${it.quantity}x *${it.menuName}*${note} : Rp ${Number(it.subtotal).toLocaleString('id-ID')}\n`;
          }
          summary += `─────────────────────────\n`;
          summary += `Subtotal: *Rp ${Number(subtotal).toLocaleString('id-ID')}*\n`;
          summary += `Ongkir: *Rp 10.000*\n`;
          summary += `💰 *TOTAL BAYAR: Rp ${Number(tempData.grand_total).toLocaleString('id-ID')}*\n`;
          summary += `═════════════════════════\n\n`;
          summary += `Kalau udah oke, ketik *YA* atau *OKE* ya Kak biar langsung kita proses! 👨‍🍳🔥\n_(Atau ketik *BATAL* kalau mau diubah)_`;

          await sendMsg(phone, summary);
          return { status: true, message: 'Delivery address set, jumped to confirm', replies };
        }
      }

      session.state = 'ORDERING_NOTES';
      session.tempData = tempData;
      session.markModified('tempData');
      await session.save();

      let notePrompt = `Ada *catatan khusus* untuk pesanannya Kak? 😊\n(Misalnya: *pedas sedang, es sedikit, sambal dipisah*).\n\nKetik catatannya ya Kak (atau balas *-* jika tanpa catatan):`;
      await sendMsg(phone, notePrompt);
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

      let summary = "Yuk dicek dulu rincian pesanannya Kak, udah pas? 📝\n";
      summary += "═════════════════════════\n";
      summary += `👤 *Nama:* ${tempData.customer_name}\n`;
      summary += `📌 *Tipe:* ${typeTitle}\n`;
      summary += `📍 *Tujuan/Meja:* ${tempData.delivery_address}\n`;
      if (tempData.notes && tempData.notes !== '-') {
        summary += `📝 *Catatan:* ${tempData.notes}\n`;
      }
      summary += "─────────────────────────\n";
      summary += "*Menu yang Dipesan:*\n";
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
      summary += "Kalau udah pas semua, balas *YA* atau *OKE* ya Kak biar langsung kita siapkan di dapur! 👨‍🍳🔥\n_(Atau ketik *BATAL* kalau mau diubah)_";

      await sendMsg(phone, summary);
      return { status: true, message: 'Summary sent', replies };
    }

    case 'ORDERING_CONFIRM': {
      const confirmLower = text.toLowerCase().trim();

      // Tambah menu lain dari layar konfirmasi
      if (confirmLower.includes('tambah') || confirmLower.includes('tambah menu')) {
        session.state = 'ORDERING_ITEMS';
        session.markModified('tempData');
        await session.save();
        await sendMsg(
          phone,
          `Silakan ketik menu yang ingin ditambah (contoh: *Es Teh 1*):`
        );
        return { status: true, message: 'Back to ordering items from confirm', replies };
      }

      if (['ya', 'oke', 'ok', 'benar', '1', 'siap', 'y', 'yes', 'deal'].includes(cmdLower) || confirmLower.includes('ya') || confirmLower.includes('buat pesanan')) {
        const finRes = await handleFinalizeOrder(phone, tempData, session, configs, sendMsg);
        return { ...finRes, replies };
      } else if (['batal', 'tidak', 'gak', 'ga', '2', 'cancel', 'no'].includes(cmdLower) || confirmLower.includes('batal')) {
        session.state = 'IDLE';
        session.tempData = {};
        session.markModified('tempData');
        await session.save();
        await sendMsg(phone, `❌ Pesanan berhasil dibatalkan. Terima kasih!\n\nKetik *MENU* jika ingin melihat daftar menu kami kembali.`);
        return { status: true, message: 'Order cancelled by user', replies };
      } else {
        // Coba cek jika pelanggan malah mengetik tambahan menu di sini (misal "sama es teh 1 ya")
        try {
          const parsedOrder = await parseOrderWithGroq({
            userMessage: text,
            customerName: data.pushName,
            configs,
            phone,
          });
          if (parsedOrder && parsedOrder.isOrderIntent && parsedOrder.items.length > 0) {
            const aiOrderRes = await applyParsedOrderToSession({
              phone,
              parsedOrder,
              session,
              tempData,
              pushName: data.pushName,
              sendMsg,
            });
            return { ...aiOrderRes, replies };
          }
        } catch (err: any) {
          // ignore
        }

        await sendMsg(
          phone,
          `⚠️ Mohon balas *YA* jika sudah benar, ketik menu tambahan untuk menambah, atau *BATAL* untuk membatalkan.`
        );
        return { status: true, message: 'Waiting valid confirm', replies };
      }
    }

    default:
      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      await sendMsg(phone, `Halo kak! Ketik *MENU* untuk melihat katalog menu makanan & minuman kami 😊`);
      return { status: true, message: 'Fallback to default IDLE', replies };
  }
}
