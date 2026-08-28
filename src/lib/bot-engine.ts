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

  if (categories.length === 0 || menus.length === 0) {
    text += "_(Menu saat ini sedang diperbarui)_\n";
    return text;
  }

  for (const cat of categories) {
    const catMenus = menus.filter(
      (m: any) => m.categoryId && (m.categoryId._id || m.categoryId).toString() === (cat._id as any).toString()
    );

    if (catMenus.length === 0) continue;

    text += `🍽️ *${cat.name.toUpperCase()}*\n`;
    text += "─────────────────────────\n";

    for (const m of catMenus) {
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

async function handleCheckOrderStatus(phone: string, text: string, configs: BotConfigMap): Promise<void> {
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
    await sendWhatsAppMessage(
      phone,
      `ℹ️ Belum ada riwayat pesanan yang tercatat untuk nomor ini kak.\n\nKetik *MENU* untuk melihat katalog dan mulai memesan! 🍽️`,
      configs
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

  await sendWhatsAppMessage(phone, msg, configs);
}

async function handleProcessOrderItems(
  phone: string,
  text: string,
  tempData: any,
  session: any,
  configs: BotConfigMap
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
    await sendWhatsAppMessage(phone, msg, configs);
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
    reply += `• ${it.menu_name} (${it.quantity}x @ ${p}) = *${s}*\n`;
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

  await sendWhatsAppMessage(phone, reply, configs);
  return { status: true, message: 'Items parsed and stored' };
}

async function handleFinalizeOrder(
  phone: string,
  tempData: any,
  session: any,
  configs: BotConfigMap
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

  await sendWhatsAppMessage(phone, invoiceMsg, configs);

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

export async function processInboundWebhook(data: InboundPayload): Promise<{
  status: boolean;
  message: string;
  replies?: string[];
}> {
  await connectDB();

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
    return { status: true, message: 'Ignored Group/Empty Phone' };
  }

  const rawJson = JSON.stringify(data);
  await logBotMessage(phone, 'inbound', type, text || (type === 'image' ? '[GAMBAR]' : ''), rawJson, 'received');

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

  // 2. Admin Quick WhatsApp Commands
  if (isAdmin) {
    if (cmdLower === 'pause bot') {
      await setBotConfig('bot_active', '0');
      await sendWhatsAppMessage(phone, "⏸️ *Bot Telah di-PAUSE secara Global.*\nBot tidak akan membalas chat pelanggan sampai kamu kirim *play bot*.", configs);
      return { status: true, message: 'Bot Paused Globally' };
    }

    if (cmdLower === 'play bot') {
      await setBotConfig('bot_active', '1');
      await sendWhatsAppMessage(phone, "▶️ *Bot Telah di-AKTIFKAN kembali.*\nBot sekarang membalas chat pelanggan secara otomatis.", configs);
      return { status: true, message: 'Bot Activated Globally' };
    }

    if (cmdLower === 'status bot') {
      const activeConfigs = await getBotConfigs();
      const statusStr = activeConfigs.bot_active === '1' ? '✅ AKTIF' : '⏸️ PAUSED';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });
      const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });

      const msg = `ℹ️ *STATUS BOT RESTO*\n═════════════════\n• Status Bot: *${statusStr}*\n• Pesanan Hari Ini: *${todayOrders}*\n• Pesanan Pending: *${pendingOrders}*\n• Jam Server: *${new Date().toLocaleString('id-ID')}*`;
      await sendWhatsAppMessage(phone, msg, configs);
      return { status: true, message: 'Status sent to admin' };
    }

    if (cmdLower === 'whitelist on' || cmdLower === 'whitelist 1') {
      await setBotConfig('whitelist_mode', '1');
      const nums = getWhitelistNumbers(configs.whitelist_numbers);
      await sendWhatsAppMessage(phone, `🛡️ *Mode Whitelist DI-AKTIFKAN!*\nBot saat ini hanya akan membalas ${nums.length} nomor terdaftar dalam whitelist.`, configs);
      return { status: true, message: 'Whitelist mode ON' };
    }

    if (cmdLower === 'whitelist off' || cmdLower === 'whitelist 0') {
      await setBotConfig('whitelist_mode', '0');
      await sendWhatsAppMessage(phone, `🌐 *Mode Whitelist DI-NONAKTIFKAN!*\nBot sekarang membalas semua pesan publik dari siapapun.`, configs);
      return { status: true, message: 'Whitelist mode OFF' };
    }

    const addMatch = text.match(/^whitelist\s+add\s+(\+?62\d+|08\d+|\d+)/i);
    if (addMatch) {
      const target = normalizePhone(addMatch[1]);
      const currentList = getWhitelistNumbers(configs.whitelist_numbers);
      if (!currentList.includes(target)) {
        currentList.push(target);
        await setBotConfig('whitelist_numbers', currentList.join(', '));
      }
      await sendWhatsAppMessage(phone, `✅ Nomor *${target}* berhasil ditambahkan ke whitelist!`, configs);
      return { status: true, message: 'Whitelist number added' };
    }

    const delMatch = text.match(/^whitelist\s+(del|remove|hapus)\s+(\+?62\d+|08\d+|\d+)/i);
    if (delMatch) {
      const target = normalizePhone(delMatch[2]);
      const currentList = getWhitelistNumbers(configs.whitelist_numbers);
      const filtered = currentList.filter((n) => n !== target);
      await setBotConfig('whitelist_numbers', filtered.join(', '));
      await sendWhatsAppMessage(phone, `🗑️ Nomor *${target}* telah dihapus dari whitelist.`, configs);
      return { status: true, message: 'Whitelist number removed' };
    }

    if (cmdLower === 'whitelist list' || cmdLower === 'whitelist info') {
      const isMode = configs.whitelist_mode === '1' ? '✅ AKTIF' : '❌ NONAKTIF';
      const nums = getWhitelistNumbers(configs.whitelist_numbers);
      const listStr = nums.length === 0 ? '_(Belum ada nomor)_' : nums.join('\n• ');
      const msg = `🛡️ *PENGATURAN WHITELIST BOT*\n═════════════════\n• Status Mode: *${isMode}*\n• Total Nomor: *${nums.length}*\n\n*Daftar Nomor:*\n• ${listStr}`;
      await sendWhatsAppMessage(phone, msg, configs);
      return { status: true, message: 'Whitelist list sent' };
    }

    const playTarget = text.match(/^play\s+(\+?62\d+|08\d+|\d+)/i);
    if (playTarget) {
      const target = normalizePhone(playTarget[1]);
      await BotSession.findOneAndUpdate(
        { phone: target },
        { isPaused: false, state: 'IDLE', tempData: {} },
        { upsert: true }
      );
      await sendWhatsAppMessage(phone, `▶️ Bot diaktifkan kembali untuk nomor *${target}*.`, configs);
      await sendWhatsAppMessage(
        target,
        `Halo kak! Admin kami sudah selesai membantu ya. Bot kami aktif kembali untuk membantu kebutuhan pesanan kakak 😊\nKetik *MENU* untuk melihat katalog.`,
        configs
      );
      return { status: true, message: `Play target ${target}` };
    }

    const pauseTarget = text.match(/^pause\s+(\+?62\d+|08\d+|\d+)/i);
    if (pauseTarget) {
      const target = normalizePhone(pauseTarget[1]);
      await BotSession.findOneAndUpdate(
        { phone: target },
        { isPaused: true, pausedAt: new Date() },
        { upsert: true }
      );
      await sendWhatsAppMessage(phone, `⏸️ Bot di-pause untuk nomor *${target}*.`, configs);
      return { status: true, message: `Pause target ${target}` };
    }
  }

  // 3. Admin direct reply from device
  if (isFromMe) {
    await BotSession.findOneAndUpdate(
      { phone },
      { isPaused: true, pausedAt: new Date() },
      { upsert: true }
    );
    return { status: true, message: 'User paused because Admin replied manually' };
  }

  // 4. Global Active Check
  if (!botActive && !isAdmin) {
    return { status: true, message: 'Bot Inactive Globally' };
  }

  // 5. Whitelist Mode Check
  if (!(await isPhoneWhitelisted(phone, configs)) && !isAdmin) {
    await logBotMessage(phone, 'inbound', type, text, rawJson, 'ignored_not_whitelisted');
    return { status: true, message: 'Phone not whitelisted' };
  }

  // 6. User Session
  let session = await BotSession.findOne({ phone });
  if (!session) {
    session = await BotSession.create({ phone, state: 'IDLE', tempData: {}, isPaused: false });
  }

  let tempData = session.tempData || {};

  // Check if session is paused
  if (session.isPaused) {
    const pausedAt = session.pausedAt ? new Date(session.pausedAt).getTime() : Date.now();
    const diffMins = (Date.now() - pausedAt) / (1000 * 60);
    if (diffMins < 60) {
      return { status: true, message: 'User is paused' };
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
      await sendWhatsAppMessage(phone, reply, configs);

      if (adminPhone) {
        const adminNotif = `🔔 *BUKTI TRANSFER MASUK!*\n═════════════════════\n• No. Order: *#${latestUnpaid.invoiceNo}*\n• Pembeli: *${latestUnpaid.customerName}* (${phone})\n• Total: *Rp ${Number(latestUnpaid.grandTotal).toLocaleString('id-ID')}*\n• Status: *Menunggu Verifikasi*\n\nSilakan cek di Admin Dashboard untuk verifikasi.`;
        await sendWhatsAppMessage(adminPhone, adminNotif, configs);
      }

      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      return { status: true, message: 'Payment proof processed' };
    } else {
      const reply = `Terima kasih atas kiriman gambarnya kak! 😊\nJika kakak ingin memesan makanan/minuman, silakan ketik *MENU* atau *ORDER*.`;
      await sendWhatsAppMessage(phone, reply, configs);
      return { status: true, message: 'General image received' };
    }
  }

  // 8. Global Escape Keywords
  const currentState = session.state || 'IDLE';

  if (cmdLower === 'batal' || cmdLower === 'cancel' || cmdLower === 'reset') {
    session.state = 'IDLE';
    session.tempData = {};
    await session.save();
    await sendWhatsAppMessage(phone, `❌ Sesi pesanan sebelumnya telah dibatalkan.\n\nAda yang bisa kami bantu lagi? Ketik *MENU* untuk melihat katalog.`, configs);
    return { status: true, message: 'Session reset' };
  }

  if (cmdLower === 'admin' || cmdLower === 'cs' || cmdLower === 'owner' || cmdLower === 'bantuan' || cmdLower === 'staf' || (currentState === 'IDLE' && cmdLower === '5')) {
    session.isPaused = true;
    session.pausedAt = new Date();
    await session.save();

    await sendWhatsAppMessage(phone, `👨‍💼 *Menghubungkan ke Admin / Staf*\n\nPesan kakak sudah kami teruskan ke admin kami. Staf kami akan segera membalas chat kakak secara manual.\n\n_Bot dijeda sementara waktu untuk nomor ini._`, configs);

    if (adminPhone) {
      const dispPhone = displayPhone(phone);
      await sendWhatsAppMessage(adminPhone, `🔔 *PELANGGAN BUTUH BANTUAN ADMIN!*\nNomor: *${dispPhone}* (${phone})\nPesan terakhir: "${text}"\n\n_Bot otomatis di-pause untuk nomor ini agar admin bisa chat langsung._`, configs);
    }
    return { status: true, message: 'Admin handoff requested' };
  }

  // 9. State Machine & Flow Ordering
  if (currentState === 'IDLE') {
    if (cmdLower === '1' || cmdLower === 'menu' || cmdLower === 'katalog' || cmdLower === 'daftar menu' || cmdLower === 'pricelist') {
      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      const catalog = await getFormattedMenuForBot();
      await sendWhatsAppMessage(phone, catalog, configs);
      return { status: true, message: 'Menu catalog sent' };
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
      await sendWhatsAppMessage(phone, infoMsg, configs);
      return { status: true, message: 'Info sent' };
    }

    if (cmdLower === '3' || cmdLower.startsWith('status') || cmdLower.startsWith('cek')) {
      await handleCheckOrderStatus(phone, text, configs);
      return { status: true, message: 'Status checked' };
    }
  }

  // Quick Order Shortcut: e.g. "ORDER M1 2, D1 1"
  const orderMatch = text.match(/^(order|pesan)\s+(.+)$/i);
  if (orderMatch) {
    const itemsText = orderMatch[2].trim();
    return await handleProcessOrderItems(phone, itemsText, tempData, session, configs);
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
        await sendWhatsAppMessage(phone, guide, configs);
        return { status: true, message: 'Ordering guide sent' };
      }

      // Default Welcome Message
      const welcomeTpl = configs.welcome_message || `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`;
      const welcomeMsg = welcomeTpl.replace(/{store_name}/g, storeName);
      await sendWhatsAppMessage(phone, welcomeMsg, configs);
      return { status: true, message: 'Welcome sent' };

    case 'ORDERING_ITEMS':
      return await handleProcessOrderItems(phone, text, tempData, session, configs);

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
        await sendWhatsAppMessage(
          phone,
          `⚠️ Pilihan tidak valid. Silakan balas dengan angka:\n*1* untuk Makan di Tempat (Dine-In)\n*2* untuk Bungkus (Takeaway)\n*3* untuk Pesan Antar (Delivery)\n\n_(Atau ketik *BATAL* untuk membatalkan)_`,
          configs
        );
        return { status: true, message: 'Invalid order type selection' };
      }

      tempData.order_type = chosenType;
      tempData.delivery_fee = chosenType === 'delivery' ? 10000 : 0;
      session.state = 'ORDERING_NAME_ADDRESS';
      session.tempData = tempData;
      await session.save();

      if (chosenType === 'dine_in') {
        await sendWhatsAppMessage(phone, `🍽️ *Makan di Tempat (Dine-In)*\n\nBoleh minta *Nama Pemesan & Nomor Meja* kakak?\nContoh: *Budi Santoso - Meja 05*`, configs);
      } else if (chosenType === 'takeaway') {
        await sendWhatsAppMessage(phone, `🛍️ *Bungkus Bawa Pulang (Takeaway)*\n\nBoleh minta *Nama Lengkap Pemesan* kakak?\nContoh: *Rina Rahayu*`, configs);
      } else {
        await sendWhatsAppMessage(phone, `🛵 *Pesan Antar (Delivery)*\n\nBoleh minta *Nama & Alamat Lengkap Pengiriman* kakak beserta patokannya?\nContoh: *Andi - Jl. Mawar No. 12, RT 02/03 (Pagar Hitam), Surabaya*`, configs);
      }
      return { status: true, message: 'Order type chosen' };

    case 'ORDERING_NAME_ADDRESS':
      const nameInput = text.trim();
      if (nameInput.length < 2) {
        await sendWhatsAppMessage(phone, `⚠️ Mohon masukkan nama / alamat yang jelas ya kak.`, configs);
        return { status: true, message: 'Invalid address input' };
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

      await sendWhatsAppMessage(
        phone,
        `📝 Ada *catatan khusus* untuk pesanan ini?\n(Contoh: *Sambal dipisah, es sedikit, jangan pakai daun bawang*).\n\nKetik catatanmu, atau balas *-* (tanda strip) jika tidak ada.`,
        configs
      );
      return { status: true, message: 'Name/address received' };

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
        summary += `• ${it.menu_name} (${it.quantity}x @ ${itemPrice}) = *${itemSub}*\n`;
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

      await sendWhatsAppMessage(phone, summary, configs);
      return { status: true, message: 'Summary sent' };

    case 'ORDERING_CONFIRM':
      if (['ya', 'oke', 'ok', 'benar', '1', 'siap', 'y', 'yes', 'deal'].includes(cmdLower)) {
        return await handleFinalizeOrder(phone, tempData, session, configs);
      } else if (['batal', 'tidak', 'gak', 'ga', '2', 'cancel', 'no'].includes(cmdLower)) {
        session.state = 'IDLE';
        session.tempData = {};
        await session.save();
        await sendWhatsAppMessage(phone, `❌ Pesanan berhasil dibatalkan. Terima kasih!\n\nKetik *MENU* jika ingin melihat daftar menu kami kembali.`, configs);
        return { status: true, message: 'Order cancelled by user' };
      } else {
        await sendWhatsAppMessage(phone, `⚠️ Mohon balas *YA* jika pesanan sudah benar, atau *BATAL* untuk membatalkan.`, configs);
        return { status: true, message: 'Waiting valid confirm' };
      }

    default:
      session.state = 'IDLE';
      session.tempData = {};
      await session.save();
      await sendWhatsAppMessage(phone, `Halo kak! Ketik *MENU* untuk melihat katalog menu makanan & minuman kami 😊`, configs);
      return { status: true, message: 'Fallback to default IDLE' };
  }
}
