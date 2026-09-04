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
      text += `• *[${m.code}]* ${m.name} : *${priceStr}*\n`;
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
      text += `🍽️ *MENU LAINNYA*\n─────────────────────────\n`;
    }
    for (const m of otherMenus) {
      const priceStr = 'Rp ' + Number(m.price).toLocaleString('id-ID');
      text += `• *[${m.code}]* ${m.name} : *${priceStr}*\n`;
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
  interactive?: {
    button_reply?: { title: string };
    list_reply?: { title: string };
  };
  [key: string]: any;
}

type SendFn = (targetPhone: string, msg: string) => Promise<void>;

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

  if (parsedItems.length === 0) {
    let msg = "⚠️ Maaf kak, kami belum bisa mengenali format pesanan tersebut.\n\n";
    msg += "💡 *Contoh format yang benar:*\n";
    msg += "• *M1 2, D1 1* (2 Ayam Geprek, 1 Kopi Aren)\n";
    msg += "• *P1 1, S1 2*\n\n";
    msg += "Ketik *MENU* untuk melihat daftar kode menu, atau ketik *BATAL* untuk keluar.";
    await sendMsg(phone, msg);
    return { status: true, message: 'Unrecognized items' };
  }

  tempData.items = parsedItems;
  tempData.total_items = totalItems;
  tempData.subtotal = subtotal;

  session.state = 'ORDERING_TYPE';
  session.tempData = tempData;
  await session.save();

  let reply = "✅ *Item Pesanan Dicatat:*\n";
  for (const it of parsedItems) {
    const p = 'Rp ' + Number(it.price).toLocaleString('id-ID');
    const s = 'Rp ' + Number(it.subtotal).toLocaleString('id-ID');
    reply += `• ${it.menuName || it.menu_name} (${it.quantity}x @ ${p}) = *${s}*\n`;
  }
  reply += `Subtotal: *Rp ${subtotal.toLocaleString('id-ID')}*\n`;

  if (unrecognized.length > 0) {
    reply += `\n_(Catatan: Kode [${unrecognized.join(', ')}] tidak ditemukan dan dilewati)_\n`;
  }

  reply += "\n═══════════════════════\n";
  reply += "Selanjutnya, pesanan ini untuk:\n";
  reply += "1️⃣ *Makan di Tempat (Dine-In)*\n";
  reply += "2️⃣ *Bungkus (Takeaway)*\n";
  reply += "3️⃣ *Pesan Antar (Delivery)*\n\n";
  reply += "Balas dengan angka *1*, *2*, atau *3* ya kak.";

  await sendMsg(phone, reply);
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
  const invoiceNo = await generateInvoiceNo();
  const adminPhone = normalizePhone(configs.admin_phone || '');
  const bankInfo = configs.bank_info || 'Pembayaran BCA / QRIS';

  const orderData = {
    invoiceNo,
    customerPhone: phone,
    customerName: tempData.customer_name || 'Pelanggan',
    orderType: tempData.order_type || 'delivery',
    deliveryAddress: tempData.delivery_address || '-',
    notes: tempData.notes || '-',
    totalItems: Number(tempData.total_items || 0),
    subtotal: Number(tempData.subtotal || 0),
    deliveryFee: Number(tempData.delivery_fee || 0),
    discount: 0,
    grandTotal: Number(tempData.grand_total || 0),
    paymentMethod: 'Transfer Bank / QRIS',
    paymentStatus: 'unpaid',
    orderStatus: 'pending',
    items: tempData.items || [],
  };

  const newOrder = await Order.create(orderData);

  session.state = 'IDLE';
  session.tempData = {};
  await session.save();

  let invoiceMsg = "🎉 *PESANAN BERHASIL DIBUAT!*\n";
  invoiceMsg += "═════════════════════════\n";
  invoiceMsg += `No. Invoice: *#${invoiceNo}*\n`;
  invoiceMsg += `Nama: *${newOrder.customerName}*\n`;
  invoiceMsg += "Status: *Menunggu Pembayaran ⏳*\n";
  invoiceMsg += `Total Tagihan: *Rp ${Number(newOrder.grandTotal).toLocaleString('id-ID')}*\n`;
  invoiceMsg += "═════════════════════════\n\n";
  invoiceMsg += "💳 *CARA PEMBAYARAN:*\n";
  invoiceMsg += `${bankInfo}\n\n`;
  invoiceMsg += "📸 *PENTING:* Setelah transfer, silakan *kirim foto bukti transfer* langsung ke chat WhatsApp ini ya kak agar pesanan langsung kami masak!\n\n";
  invoiceMsg += "Ketik *STATUS* kapan saja untuk memantau status pesanan kakak. Terima kasih! 🙏😊";

  await sendMsg(phone, invoiceMsg);

  if (adminPhone) {
    const typeLabel =
      newOrder.orderType === 'dine_in'
        ? 'DINE-IN'
        : newOrder.orderType === 'takeaway'
        ? 'TAKEAWAY'
        : 'DELIVERY';
    let adminAlert = "🔥 *PESANAN BARU MASUK!* 🔥\n";
    adminAlert += "═════════════════════════\n";
    adminAlert += `No. Order: *#${invoiceNo}*\n`;
    adminAlert += `Tipe: *${typeLabel}*\n`;
    adminAlert += `Pelanggan: *${newOrder.customerName}* (${displayPhone(phone)})\n`;
    adminAlert += `Tujuan/Meja: *${newOrder.deliveryAddress}*\n`;
    adminAlert += `Catatan: *${newOrder.notes}*\n`;
    adminAlert += "─────────────────────────\n";
    adminAlert += "*Daftar Menu:*\n";
    for (const it of newOrder.items) {
      adminAlert += `• ${it.quantity}x ${it.menuName}\n`;
    }
    adminAlert += "─────────────────────────\n";
    adminAlert += `💰 *Total: Rp ${Number(newOrder.grandTotal).toLocaleString('id-ID')}*\n`;
    adminAlert += "Status: *Belum Bayar*\n\n";
    adminAlert += "_Buka Admin Dashboard untuk update status atau kirim notifikasi siap._";

    await sendWhatsAppMessage(adminPhone, adminAlert, configs);
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
  const rawPhone = data.phone || data.from || data.sender || '';
  const phone = normalizePhone(rawPhone);
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
  await logBotMessage(phone, 'inbound', type, text || (type === 'image' ? '[GAMBAR]' : ''), rawJson, isSimulation ? 'simulated_inbound' : 'received');

  // Load configs
  const configs = await getBotConfigs();
  const adminPhone = normalizePhone(configs.admin_phone || '');
  const botActive = configs.bot_active === '1';
  const storeName = configs.store_name || 'Resto Sedap Rasa';
  const storeAddr = configs.store_address || 'Jl. Boulevard Raya No. 88, Surabaya';
  const storeGmaps = configs.store_gmaps || '';
  const storeHours = configs.store_hours || '10.00 - 22.00 WIB';
  const bankInfo = configs.bank_info || 'Pembayaran BCA / QRIS';

  const isAdmin = phone === adminPhone && Boolean(adminPhone);
  const cmdLower = text.toLowerCase();

  // Unified send message helper that captures replies for simulator and dispatches to WA when live
  const sendMsg: SendFn = async (targetPhone: string, msg: string) => {
    replies.push(msg);
    if (isSimulation) {
      await logBotMessage(targetPhone, 'outbound', 'text', msg, '', 'simulated');
    } else {
      await sendWhatsAppMessage(targetPhone, msg, configs);
    }
  };

  // 2. Admin Quick WhatsApp Commands
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

      if (adminPhone && !isSimulation) {
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

  if (cmdLower === '1' || cmdLower === 'menu' || cmdLower === 'katalog' || cmdLower === 'daftar menu' || cmdLower === 'pricelist') {
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

  if (cmdLower === '4' || cmdLower === 'info' || cmdLower === 'lokasi' || cmdLower === 'alamat' || cmdLower === 'jam' || cmdLower === 'rekening' || cmdLower === 'qris') {
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

  if (cmdLower === '3' || cmdLower.startsWith('status') || cmdLower.startsWith('cek')) {
    await handleCheckOrderStatus(phone, text, configs, sendMsg);
    return { status: true, message: 'Status checked', replies };
  }

  if (cmdLower === 'admin' || cmdLower === 'cs' || cmdLower === 'owner' || cmdLower === 'bantuan' || cmdLower === 'staf' || (currentState === 'IDLE' && cmdLower === '5')) {
    session.isPaused = true;
    session.pausedAt = new Date();
    await session.save();

    await sendMsg(phone, `👨‍💼 *Menghubungkan ke Admin / Staf*\n\nPesan kakak sudah kami teruskan ke admin kami. Staf kami akan segera membalas chat kakak secara manual.\n\n_Bot dijeda sementara waktu untuk nomor ini._`);

    if (adminPhone && !isSimulation) {
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

  // Flow State Machine
  switch (currentState) {
    case 'IDLE':
      if (cmdLower === '2' || cmdLower === 'order' || cmdLower === 'pesan' || cmdLower === 'beli') {
        session.state = 'ORDERING_ITEMS';
        session.tempData = {};
        await session.save();

        let guide = "📝 *FORMAT PEMESANAN MAKANAN/MINUMAN*\n";
        guide += "═════════════════════════\n";
        guide += "Silakan ketik kode menu dan jumlah pesanan kakak.\n\n";
        guide += "💡 *Contoh penulisan:*\n";
        guide += "• *M1 2, D1 1* (2 Ayam Geprek + 1 Kopi Aren)\n";
        guide += "• *P1 1, S1 1, D2 2*\n\n";
        guide += "_Belum hafal kodenya? Ketik *MENU* untuk lihat daftar menu._\n";
        guide += "_Ketik *BATAL* kapan saja jika ingin membatalkan._";
        await sendMsg(phone, guide);
        return { status: true, message: 'Ordering guide sent', replies };
      }

      // Default Welcome Message
      const welcomeTpl = configs.welcome_message || `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`;
      const welcomeMsg = welcomeTpl.replace(/{store_name}/g, storeName);
      await sendMsg(phone, welcomeMsg);
      return { status: true, message: 'Welcome sent', replies };

    case 'ORDERING_ITEMS':
      const itemsRes = await handleProcessOrderItems(phone, text, tempData, session, configs, sendMsg);
      return { ...itemsRes, replies };

    case 'ORDERING_TYPE':
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
          `⚠️ Pilihan tidak valid. Silakan balas dengan angka:\n*1* untuk Makan di Tempat (Dine-In)\n*2* untuk Bungkus (Takeaway)\n*3* untuk Pesan Antar (Delivery)\n\n_(Atau ketik *BATAL* untuk membatalkan)_`
        );
        return { status: true, message: 'Invalid order type selection', replies };
      }

      tempData.order_type = chosenType;
      tempData.delivery_fee = chosenType === 'delivery' ? 10000 : 0;
      session.state = 'ORDERING_NAME_ADDRESS';
      session.tempData = tempData;
      await session.save();

      if (chosenType === 'dine_in') {
        await sendMsg(phone, `🍽️ *Makan di Tempat (Dine-In)*\n\nBoleh minta *Nama Pemesan & Nomor Meja* kakak?\nContoh: *Budi Santoso - Meja 05*`);
      } else if (chosenType === 'takeaway') {
        await sendMsg(phone, `🛍️ *Bungkus Bawa Pulang (Takeaway)*\n\nBoleh minta *Nama Lengkap Pemesan* kakak?\nContoh: *Rina Rahayu*`);
      } else {
        await sendMsg(phone, `🛵 *Pesan Antar (Delivery)*\n\nBoleh minta *Nama & Alamat Lengkap Pengiriman* kakak beserta patokannya?\nContoh: *Andi - Jl. Mawar No. 12, RT 02/03 (Pagar Hitam), Surabaya*`);
      }
      return { status: true, message: 'Order type chosen', replies };

    case 'ORDERING_NAME_ADDRESS':
      const nameInput = text.trim();
      if (nameInput.length < 2) {
        await sendMsg(phone, `⚠️ Mohon masukkan nama / alamat yang jelas ya kak.`);
        return { status: true, message: 'Invalid address input', replies };
      }

      const oType = tempData.order_type || 'delivery';
      if (oType === 'dine_in') {
        const parts = nameInput.split('-');
        tempData.customer_name = parts[0].trim();
        tempData.delivery_address = parts[1] ? parts[1].trim() : 'Meja Belum Ditentukan';
      } else if (oType === 'takeaway') {
        tempData.customer_name = nameInput;
        tempData.delivery_address = 'Takeaway / Ambil di Toko';
      } else {
        const parts = nameInput.split('-');
        if (parts.length >= 2) {
          tempData.customer_name = parts[0].trim();
          tempData.delivery_address = parts.slice(1).join('-').trim();
        } else {
          tempData.customer_name = `Kakak ${phone.slice(-4)}`;
          tempData.delivery_address = nameInput;
        }
      }

      session.state = 'ORDERING_NOTES';
      session.tempData = tempData;
      await session.save();

      await sendMsg(
        phone,
        `📝 Ada *catatan khusus* untuk pesanan ini?\n(Contoh: *Sambal dipisah, es sedikit, jangan pakai daun bawang*).\n\nKetik catatanmu, atau balas *-* (tanda strip) jika tidak ada.`
      );
      return { status: true, message: 'Name/address received', replies };

    case 'ORDERING_NOTES':
      let notes = text.trim();
      if (notes === '-' || ['tidak ada', 'gada', 'ga ada', 'tidak', 'no'].includes(notes.toLowerCase())) {
        notes = '-';
      }
      tempData.notes = notes;

      const items = tempData.items || [];
      const subtotal = Number(tempData.subtotal || 0);
      const deliveryFee = Number(tempData.delivery_fee || 0);
      const grandTotal = subtotal + deliveryFee;
      tempData.grand_total = grandTotal;

      session.state = 'ORDERING_CONFIRM';
      session.tempData = tempData;
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
      summary += "Ketik *YA* untuk memproses pesanan.\n";
      summary += "Ketik *BATAL* untuk membatalkan.";

      await sendMsg(phone, summary);
      return { status: true, message: 'Summary sent', replies };

    case 'ORDERING_CONFIRM':
      if (['ya', 'oke', 'ok', 'benar', '1', 'siap', 'y', 'yes', 'deal'].includes(cmdLower)) {
        const finRes = await handleFinalizeOrder(phone, tempData, session, configs, sendMsg);
        return { ...finRes, replies };
      } else if (['batal', 'tidak', 'gak', 'ga', '2', 'cancel', 'no'].includes(cmdLower)) {
        session.state = 'IDLE';
        session.tempData = {};
        await session.save();
        await sendMsg(phone, `❌ Pesanan berhasil dibatalkan. Terima kasih!\n\nKetik *MENU* jika ingin melihat daftar menu kami kembali.`);
        return { status: true, message: 'Order cancelled by user', replies };
      } else {
        await sendMsg(phone, `⚠️ Mohon balas *YA* jika pesanan sudah benar, atau *BATAL* untuk membatalkan.`);
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
