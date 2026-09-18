import { BotConfigMap, getBotConfigs } from './wablas';
import { connectDB } from './db';
import Menu from '@/models/Menu';
import BotLog from '@/models/BotLog';

export function getGroqApiKey(configs?: BotConfigMap): string {
  return (
    configs?.groq_api_key ||
    process.env.GROQ_API_KEY ||
    ''
  );
}

export function getGroqModel(configs?: BotConfigMap): string {
  return (
    configs?.groq_model ||
    process.env.GROQ_MODEL ||
    'openai/gpt-oss-120b'
  );
}

export function isGroqEnabled(configs?: BotConfigMap): boolean {
  const enabledVal = configs?.groq_enabled !== undefined 
    ? configs.groq_enabled 
    : (process.env.GROQ_ENABLED || '1');
  return enabledVal === '1' || enabledVal === 'true';
}

export interface GroqChatOptions {
  userMessage: string;
  customerName?: string;
  configs?: BotConfigMap;
  phone?: string;
}

/**
 * Fetch recent conversation history from BotLog for multi-turn conversational memory
 */
async function getRecentChatHistory(
  phone?: string,
  limit: number = 6
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!phone) return [];
  try {
    await connectDB();
    const recentLogs = await BotLog.find({
      phone,
      messageBody: { $exists: true, $ne: '' },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const chronological = recentLogs.reverse();

    for (const log of chronological) {
      if (!log.messageBody || typeof log.messageBody !== 'string') continue;
      const trimmed = log.messageBody.trim();
      if (!trimmed || log.messageType === 'error') continue;

      // Truncate long catalog dumps or system notices to prevent token blowup
      const cleanContent = trimmed.length > 300 ? trimmed.slice(0, 300) + '...' : trimmed;
      history.push({
        role: log.direction === 'inbound' ? 'user' : 'assistant',
        content: cleanContent,
      });
    }
    return history;
  } catch (err) {
    return [];
  }
}

/**
 * Ask Groq LLM to respond to a customer's question intelligently,
 * injecting live restaurant info, multi-turn chat memory, and available menu catalog.
 */
export async function askGroqChatbot({
  userMessage,
  customerName,
  configs,
  phone,
}: GroqChatOptions): Promise<string | null> {
  const cfg = configs || (await getBotConfigs());
  if (!isGroqEnabled(cfg)) {
    return null;
  }

  const apiKey = getGroqApiKey(cfg);
  if (!apiKey) {
    console.warn('[Groq] API key is not configured.');
    return null;
  }

  const model = getGroqModel(cfg);

  try {
    await connectDB();
    const activeMenus = await Menu.find({ isAvailable: true }).sort({ category: 1, name: 1 });

    const menuSummary = activeMenus.map(m => {
      const stockInfo = m.trackStock ? `(Stok: ${m.stock})` : '(Tersedia)';
      return `- [${m.code || 'MENU'}] ${m.name}: Rp ${Number(m.price).toLocaleString('id-ID')} ${stockInfo}${m.description ? ` (${m.description})` : ''}`;
    }).join('\n');

    const storeName = cfg.store_name || 'Leafly Resto';
    const storeAddress = cfg.store_address || 'Jl. Boulevard Raya No. 88, Surabaya';
    const storeHours = cfg.store_hours || '10.00 - 22.00 WIB';
    const storeGmaps = cfg.store_gmaps || '';
    const bankInfo = cfg.bank_info || 'Menerima pembayaran QRIS, Virtual Account, dan E-Wallet (via Xendit)';

    const systemPrompt = `Kamu adalah kasir dan staf ramah dari resto "${storeName}".
Persona dan Gaya Komunikasi:
1. Kamu adalah orang asli (staf/kasir/waiter resto yang ramah), BUKAN robot AI, BUKAN asisten virtual.
2. JANGAN PERNAH menyebut dirimu sebagai "AI", "bot", "asisten virtual", atau "sistem kami".
3. Gaya bicaramu SANGAT MANUSIAWI, luwes, santai tapi tetap sopan santun khas Indonesia, seperti barista atau kasir resto muda yang asik dan ramah membalas chat WhatsApp pelanggan.
4. Gunakan sapaan akrab dan sopan: "Kak" atau "Kak ${customerName || ''}".
5. Pakai partikel dan kata percakapan sehari-hari yang natural (seperti: "nih", "ya Kak", "kebetulan", "banget", "bisa banget", "siap Kak", "yuk").
6. Jangan kaku dan jangan gunakan bahasa formal birokratis/korporat. Hindari kalimat klise mesin seperti "Tentu saja, saya adalah asisten AI yang siap melayani Anda...".
7. Jawaban harus padat, to-the-point, ramah, dan solutif (cukup 2-4 kalimat yang jelas).

Informasi Restoran:
- Nama Resto: ${storeName}
- Alamat: ${storeAddress}
${storeGmaps ? `- Google Maps: ${storeGmaps}` : ''}
- Jam Operasional: ${storeHours}
- Metode Pembayaran: QRIS, Transfer Bank / Virtual Account (BCA, Mandiri, BRI, BNI), E-Wallet (GoPay, OVO, DANA, ShopeePay), atau Tunai.
- Pemesanan Langsung: Pelanggan bisa langsung memesan santai di chat ini (misal: "Pesan Ayam Bakar 2 dibungkus alamat di Jl Melati no 4" atau "Kopi Aren 1 di meja 3"), nanti pesanan langsung kami buatkan invoice-nya.

Daftar Menu & Stok Saat Ini:
${menuSummary || '(Semua menu sedang dalam pembaruan sistem)'}

Panduan Rekomendasi & Menjawab:
- Jika ditanya rekomendasi, berikan rekomendasi menu yang ada di daftar di atas secara antusias dan menggugah selera.
- Jangan pernah mengarang menu yang tidak ada di daftar.
- Gunakan emoji secukupnya agar chat terasa hidup dan ramah (🍽️, 🍗, 🥤, ✨, 😊).`;

    // Ambil histori percakapan sebelumnya untuk memori multi-turn
    const recentHistory = await getRecentChatHistory(phone, 6);

    // Filter pesan terakhir agar tidak duplikat dengan userMessage saat ini
    const filteredHistory = recentHistory.filter(
      (h, idx) => !(idx === recentHistory.length - 1 && h.role === 'user' && h.content.trim() === userMessage.trim())
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds max

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...filteredHistory,
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 450,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Groq] Chat completions error:', response.status, errText);
      if (model !== 'qwen/qwen3.8-27b') {
        return askGroqFallback({ userMessage, systemPrompt, apiKey, model: 'qwen/qwen3.8-27b' });
      }
      return null;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return reply ? reply.trim() : null;
  } catch (err: any) {
    console.error('[Groq] Error calling Groq API:', err.message || err);
    return null;
  }
}

async function askGroqFallback({
  userMessage,
  systemPrompt,
  apiKey,
  model,
}: {
  userMessage: string;
  systemPrompt: string;
  apiKey: string;
  model: string;
}): Promise<string | null> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export interface ParsedOrderItem {
  menuId?: string;
  menuCode: string;
  menuName: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
}

export interface ParsedOrderResult {
  isOrderIntent: boolean;
  items: ParsedOrderItem[];
  orderType: 'dine_in' | 'takeaway' | 'delivery' | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  aiFriendlySummary?: string;
  rawJson?: any;
}

/**
 * Intelligent Natural Language Order Parser powered by Groq LLM.
 * Extracts order intent, menu items, quantities, custom notes, order type, and table/delivery details.
 * Features advanced disambiguation for mixed intent, colloquial Indonesian numbers, and few-shot guidance.
 */
export async function parseOrderWithGroq({
  userMessage,
  customerName,
  configs,
  phone,
}: GroqChatOptions): Promise<ParsedOrderResult | null> {
  const cfg = configs || (await getBotConfigs());
  if (!isGroqEnabled(cfg)) {
    return null;
  }

  const apiKey = getGroqApiKey(cfg);
  if (!apiKey) {
    return null;
  }

  try {
    await connectDB();
    const activeMenus = await Menu.find({ isAvailable: true }).sort({ categoryId: 1, code: 1 });
    if (!activeMenus || activeMenus.length === 0) {
      return null;
    }

    const menuCatalog = activeMenus.map((m: any) => {
      const stock = m.trackStock ? `(Stok: ${m.stock})` : '';
      return `[${m.code}] "${m.name}" - Rp ${Number(m.price).toLocaleString('id-ID')} ${stock}`;
    }).join('\n');

    const storeName = cfg.store_name || 'Leafly Resto';

    const systemPrompt = `Kamu adalah AI Kasir & Waiter cerdas restoran "${storeName}".
Tugas utamamu adalah menganalisis pesan pelanggan (${customerName ? `bernama Kak ${customerName}` : 'pelanggan'}) secara akurat dan mengekstrak rincian pesanan ke dalam format JSON terstruktur.

Daftar Menu Restoran yang Tersedia Saat Ini (Kode, Nama, Harga):
${menuCatalog}

Panduan Analisis & Ekstraksi Pesanan:
1. isOrderIntent (boolean):
   - Nilai TRUE jika pelanggan bermaksud memesan/order makanan/minuman (misal: "pesan ayam bakar...", "order kopi aren 2", "minta es teh 1", "bungkus nasi goreng", "pesan M1 2", "kirim ayam geprek ke jalan merdeka").
   - Nilai FALSE jika pelanggan HANYA menyapa ("halo", "hai", "p"), bertanya info ("buka jam berapa?", "rekomendasi apa ya?"), komplain, atau minta bantuan admin.

2. items (array):
   - menuCode: Kode resmi dari daftar menu di atas (misal "M1", "D2"). Wajib cocokkan ke menu paling relevan.
   - menuName: Nama resmi menu dari daftar di atas.
   - quantity: Jumlah porsi (integer minimal 1).
     * Jika pelanggan menyebut kata: "seporsi", "sebungkus", "segelas", "secangkir", "sebotol", "satu", "1" -> quantity: 1.
     * Jika menyebut: "dua", "2", "3", dst -> isi sesuai angka.
     * PENTING: Jika pelanggan TIDAK MENYEBUTKAN ANGKA (misal: "pesan ayam bakar"), DEFAULT BERI quantity: 1.
   - notes: Catatan khusus per menu (misal: "pedas manis", "level 5", "tanpa sambal", "es sedikit", "less sugar", "hangat", "kuah dipisah", "tanpa bawang"). Kosongkan "" jika tidak ada.

3. orderType (string: "dine_in" | "takeaway" | "delivery" | null):
   - ATURAN RESOLUSI AMBIGUITAS & KONFLIK KATA:
     * PRIORITAS DELIVERY (Pesan Antar): Jika pelanggan menyebutkan ALAMAT PENGIRIMAN ("alamat di ...", "ke jalan ...", "antar ke ...", "kirim ke ...", "ke perumahan ...", "ke kost ..."), MESKIPUN PELANGGAN MENYEBUT KATA "DI BAWA PULANG" ATAU "BUNGKUS" (misal: "pesan ayam bakar di bawa pulang alamat di xxx"), MAKA TETAPKAN orderType = "delivery" dan isi deliveryAddress dengan alamat tersebut. Karena pelanggan bermaksud dibungkus untuk dikirim ke alamat itu.
     * PRIORITAS TAKEAWAY (Bungkus Ambil Sendiri): Jika pelanggan menyebut "bungkus", "takeaway", "bawa pulang" TANPA menyebut alamat pengiriman, tetapkan orderType = "takeaway".
     * PRIORITAS DINE_IN (Makan di Tempat): Jika pelanggan menyebut nomor meja ("meja 4", "meja 02", "table 3"), "makan di sini", "di tempat", tetapkan orderType = "dine_in".
     * null jika belum menyebutkan jenis pesanan apapun.

4. tableNumber (string | null):
   - Jika orderType "dine_in" dan pelanggan menyebut nomor meja, ekstrak dalam format standar: "MEJA 01", "MEJA 04", dsb.
   - null jika bukan dine-in atau belum menyebut nomor meja.

5. deliveryAddress (string | null):
   - Jika orderType "delivery" dan ada alamat (misal "alamat di jalan mawar no 12"), ekstrak alamatnya ke field ini.
   - null jika tidak ada alamat.

6. notes (string | null):
   - Catatan umum keseluruhan pesanan jika ada, atau null.

7. aiFriendlySummary (string):
   - Kalimat konfirmasi singkat dan hangat ala kasir resto muda yang menyapa Kak ${customerName || ''}, mengonfirmasi pesanannya dengan santai, akrab, dan menyenangkan (jangan gunakan bahasa kaku/formal seperti robot AI).

Contoh Analisis Kasus Nyata (Few-Shot Examples):
---
Contoh 1 (Delivery dengan alamat & kata bawa pulang):
Input: "pesan ayam bakar di bawa pulang alamat di jalan mawar no 12 surabaya"
Output:
{
  "isOrderIntent": true,
  "items": [{ "menuCode": "M1", "menuName": "Ayam Bakar", "quantity": 1, "notes": "" }],
  "orderType": "delivery",
  "tableNumber": null,
  "deliveryAddress": "jalan mawar no 12 surabaya",
  "notes": null,
  "aiFriendlySummary": "Siap Kak! 1 porsi Ayam Bakar untuk diantar ke Jalan Mawar No 12 Surabaya sudah kami catat dengan senang hati 🛵✨"
}
---
Contoh 2 (Dine-in dengan nomor meja dan catatan custom):
Input: "pesen kopi aren 2 es sedikit sama ayam geprek 1 pedes banget makan di meja 4"
Output:
{
  "isOrderIntent": true,
  "items": [
    { "menuCode": "D1", "menuName": "Kopi Susu Aren", "quantity": 2, "notes": "Es sedikit" },
    { "menuCode": "M2", "menuName": "Ayam Geprek Sambal Bawang + Nasi", "quantity": 1, "notes": "Pedes banget" }
  ],
  "orderType": "dine_in",
  "tableNumber": "MEJA 04",
  "deliveryAddress": null,
  "notes": null,
  "aiFriendlySummary": "Baik Kak! 2 Kopi Susu Aren (es sedikit) dan 1 Ayam Geprek (pedes banget) untuk Meja 04 sudah kami catat ya 🍽️"
}
---
Contoh 3 (Takeaway bungkus tanpa alamat):
Input: "bungkus nasi goreng 2 porsi jangan pake telur"
Output:
{
  "isOrderIntent": true,
  "items": [{ "menuCode": "M3", "menuName": "Nasi Goreng Spesial UMKM", "quantity": 2, "notes": "Jangan pake telur" }],
  "orderType": "takeaway",
  "tableNumber": null,
  "deliveryAddress": null,
  "notes": null,
  "aiFriendlySummary": "Siap Kak! 2 porsi Nasi Goreng Spesial (tanpa telur) bungkus bawa pulang sudah kami siapkan 👍"
}
---
Contoh 4 (Bukan pesanan / tanya rekomendasi):
Input: "rekomendasi makanan yang pedas apa ya kak?"
Output:
{
  "isOrderIntent": false,
  "items": [],
  "orderType": null,
  "tableNumber": null,
  "deliveryAddress": null,
  "notes": null,
  "aiFriendlySummary": ""
}

Format output WAJIB HANYA JSON valid tanpa markdown/backticks/teks lain:`;

    // Sertakan konteks chat singkat jika tersedia
    const recentHistory = await getRecentChatHistory(phone, 3);
    const messagesPayload: any[] = [{ role: 'system', content: systemPrompt }];

    if (recentHistory.length > 0) {
      for (const h of recentHistory) {
        messagesPayload.push(h);
      }
    }
    messagesPayload.push({ role: 'user', content: userMessage });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s max

    const model = getGroqModel(cfg);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messagesPayload,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[Groq] parseOrderWithGroq API error:', response.status);
      return null;
    }

    const data = await response.json();
    let rawContent = data.choices?.[0]?.message?.content?.trim() || '';
    if (rawContent.includes('```json')) {
      rawContent = rawContent.replace(/```json\s*([\s\S]*?)\s*```/gi, '$1').trim();
    } else if (rawContent.includes('```')) {
      rawContent = rawContent.replace(/```\s*([\s\S]*?)\s*```/gi, '$1').trim();
    }

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      const sanitized = jsonMatch[0]
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      parsed = JSON.parse(sanitized);
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const isOrderIntent = Boolean(parsed.isOrderIntent);
    if (!isOrderIntent || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return {
        isOrderIntent,
        items: [],
        orderType: parsed.orderType || null,
        tableNumber: parsed.tableNumber || null,
        deliveryAddress: parsed.deliveryAddress || null,
        notes: parsed.notes || null,
        aiFriendlySummary: parsed.aiFriendlySummary || '',
      };
    }

    // Cross-validate and enrich items with database menu data
    const validItems: ParsedOrderItem[] = [];
    for (const rawItem of parsed.items) {
      const targetCode = String(rawItem.menuCode || '').toUpperCase().trim();
      const targetName = String(rawItem.menuName || '').toLowerCase().trim();

      // Find matching menu in database with smart fuzzy logic
      const matchedMenu = activeMenus.find((m: any) => {
        const mCode = (m.code || '').toUpperCase().trim();
        const mName = (m.name || '').toLowerCase().trim();

        if (targetCode && mCode === targetCode) return true;
        if (targetName && mName === targetName) return true;
        if (targetName && (mName.includes(targetName) || targetName.includes(mName))) return true;

        // Word token overlap matching (e.g. "ayam bakar" matches "Ayam Bakar Madu")
        const targetWords = targetName.split(/\s+/).filter((w) => w.length > 2);
        const menuWords = mName.split(/\s+/);
        if (
          targetWords.length > 0 &&
          targetWords.every((tw) => menuWords.some((mw: string) => mw.includes(tw) || tw.includes(mw)))
        ) {
          return true;
        }

        return false;
      });

      if (matchedMenu) {
        const qty = Math.max(1, parseInt(rawItem.quantity, 10) || 1);
        const price = Number(matchedMenu.price) || 0;
        validItems.push({
          menuId: matchedMenu._id ? matchedMenu._id.toString() : undefined,
          menuCode: matchedMenu.code,
          menuName: matchedMenu.name,
          price: price,
          quantity: qty,
          subtotal: price * qty,
          notes: rawItem.notes ? String(rawItem.notes).trim() : '',
        });
      }
    }

    return {
      isOrderIntent: validItems.length > 0 ? true : isOrderIntent,
      items: validItems,
      orderType: parsed.orderType || null,
      tableNumber: parsed.tableNumber || null,
      deliveryAddress: parsed.deliveryAddress || null,
      notes: parsed.notes || null,
      aiFriendlySummary: parsed.aiFriendlySummary || '',
      rawJson: parsed,
    };
  } catch (err: any) {
    console.error('[Groq] parseOrderWithGroq exception:', err.message || err);
    return null;
  }
}

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number; // -1.0 (very negative) to 1.0 (very positive)
  reason: string;
  isUrgentComplaint: boolean;
}

/**
 * Fast Indonesian Sentiment Rule-based Heuristic
 */
export function analyzeSentimentFast(text: string): SentimentResult {
  const lower = text.toLowerCase().trim();

  // Urgent triggers
  const urgentTriggers = [
    'basi', 'tumpah', 'salah kirim', 'belum datang', 'belum nyampe', 'lama banget',
    'parah', 'kecewa berat', 'tanggung jawab', 'refund', 'uang kembali', 'ganti rugi',
    'kotor', 'bau', 'batalin aja', 'penipu', 'ga profesional', 'tidak profesional'
  ];

  const negativeWords = [
    'kecewa', 'lama', 'basi', 'dingin', 'asin', 'pahit', 'salah', 'kurang', 'tumpah',
    'batal', 'parah', 'jelek', 'rusak', 'rugi', 'komplain', 'marah', 'lambat', 'bau',
    'kotor', 'bohong', 'ga enak', 'gak enak', 'nggak enak', 'tidak enak', 'aneh rasanya',
    'kecewa', 'kemahalan', 'mahal banget', 'buruk', 'kapok'
  ];

  const positiveWords = [
    'enak', 'mantap', 'mantul', 'lezat', 'makasih', 'terima kasih', 'makaci', 'juara',
    'puas', 'top', 'suka', 'bagus', 'cepat', 'ramah', 'rekomend', 'recomended', 'salam',
    'alhamdulillah', 'jos', 'best', 'nagih', 'segar', 'wangi', 'bersih', 'suka banget',
    'langganan', 'terbaik', 'keren'
  ];

  const hasUrgent = urgentTriggers.some(w => lower.includes(w));
  const negMatches = negativeWords.filter(w => lower.includes(w));
  const posMatches = positiveWords.filter(w => lower.includes(w));

  if (hasUrgent || negMatches.length > posMatches.length) {
    const score = Math.max(-1.0, -0.4 - (negMatches.length * 0.2));
    return {
      sentiment: 'negative',
      score,
      reason: hasUrgent
        ? `Terdeteksi indikasi komplain mendesak: "${negMatches.join(', ') || 'komplain'}"`
        : `Kalimat bernada kecewa/negatif (${negMatches.join(', ')})`,
      isUrgentComplaint: hasUrgent || negMatches.length >= 2,
    };
  }

  if (posMatches.length > 0 && posMatches.length >= negMatches.length) {
    const score = Math.min(1.0, 0.4 + (posMatches.length * 0.2));
    return {
      sentiment: 'positive',
      score,
      reason: `Pelanggan merasa puas/senang (${posMatches.join(', ')})`,
      isUrgentComplaint: false,
    };
  }

  return {
    sentiment: 'neutral',
    score: 0.0,
    reason: 'Pesan bernada netral/informasi standar pesanan',
    isUrgentComplaint: false,
  };
}

/**
 * Intelligent Sentiment Analysis powered by Groq LLM with heuristic fallback
 */
export async function analyzeSentiment(
  text: string,
  configs?: BotConfigMap
): Promise<SentimentResult> {
  const clean = (text || '').trim();
  if (!clean || clean.length < 2) {
    return { sentiment: 'neutral', score: 0, reason: 'Pesan singkat/simbol', isUrgentComplaint: false };
  }

  // Check fast heuristic first
  const fastResult = analyzeSentimentFast(clean);

  // If text is purely a basic command or number, fast heuristic is sufficient
  if (/^(\d+|\/start|\/menu|\/order|\/batal|\/status|\/info|\/admin|ya|tidak|oke|ok)$/i.test(clean)) {
    return fastResult;
  }

  const cfg = configs || (await getBotConfigs());
  if (!isGroqEnabled(cfg)) {
    return fastResult;
  }

  const apiKey = getGroqApiKey(cfg);
  if (!apiKey) {
    return fastResult;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds max

    const prompt = `Analisis sentimen pesan pelanggan restoran berikut:
"${clean}"

Berikan jawaban HANYA berupa JSON valid tanpa teks lain:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": number (-1.0 sampai 1.0),
  "reason": "alasan singkat dalam bahasa Indonesia maksimal 1 kalimat",
  "isUrgentComplaint": boolean (true jika ada komplain makanan rusak/basi/salah/belum sampai/minta ganti rugi)
}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getGroqModel(cfg),
        messages: [
          { role: 'system', content: 'Kamu adalah AI analisis sentimen customer service restoran. Output HANYA JSON murni.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment)
          ? parsed.sentiment
          : fastResult.sentiment;
        return {
          sentiment,
          score: typeof parsed.score === 'number' ? parsed.score : fastResult.score,
          reason: parsed.reason || fastResult.reason,
          isUrgentComplaint: Boolean(parsed.isUrgentComplaint || fastResult.isUrgentComplaint),
        };
      }
    }
  } catch {
    // If Groq fails or timeouts, fallback gracefully to fast heuristic
  }

  return fastResult;
}
