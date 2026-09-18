import { BotConfigMap, getBotConfigs } from './wablas';
import { connectDB } from './db';
import Menu from '@/models/Menu';

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
}

/**
 * Ask Groq LLM to respond to a customer's question intelligently,
 * injecting live restaurant info and available menu catalog from database.
 */
export async function askGroqChatbot({
  userMessage,
  customerName,
  configs,
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

    const systemPrompt = `Kamu adalah asisten virtual dan customer service cerdas dari "${storeName}".
Tugasmu adalah menjawab pertanyaan pelanggan dengan ramah, ramah tamah, sopan santun khas Indonesia, membantu mereka memilih menu, memberi rekomendasi, dan menjelaskan informasi seputar restoran.

Profil & Informasi Restoran:
- Nama Resto: ${storeName}
- Alamat: ${storeAddress}
${storeGmaps ? `- Google Maps: ${storeGmaps}` : ''}
- Jam Operasional: ${storeHours}
- Metode Pembayaran: Tersedia pembayaran otomatis instan via QRIS, Virtual Account Bank (BCA, BNI, BRI, Mandiri, Permata), dan E-Wallet (OVO, DANA, ShopeePay) yang terintegrasi langsung dengan Xendit, atau Tunai.
- Cara Pesan: Pelanggan bisa langsung klik tombol menu "🛒 Pesan (ORDER)" pada keyboard chat bot untuk memilih porsi dan checkout otomatis.

Daftar Menu & Harga Saat Ini (dari Database):
${menuSummary || '(Semua menu sedang dalam pembaruan sistem)'}

Panduan Gaya Bicara:
1. Panggil pelanggan dengan sopan menggunakan "Kak" atau "Kak ${customerName || ''}".
2. Jawab pertanyaan dengan ramah, jelas, dan ringkas (hindari jawaban yang terlalu panjang atau berbelit-belit).
3. Jika ditanya rekomendasi makanan/minuman, pilih dari menu di atas dan jelaskan singkat mengapa menu itu enak/populer.
4. Jangan merekomendasikan menu yang tidak ada di daftar menu di atas.
5. Jika pelanggan ingin memesan atau menanyakan cara order, ingatkan mereka bahwa mereka cukup mengklik tombol "🛒 Pesan (ORDER)" di menu bawah chat.
6. Format jawaban menggunakan Markdown rapi dengan emoji yang pas (misal 🍽️, 🍗, 🥤, ✨).`;

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
      // Fallback to secondary model if primary model fails
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
 * Extracts order intent, menu items, quantities, custom notes, order type, and table number.
 */
export async function parseOrderWithGroq({
  userMessage,
  customerName,
  configs,
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

    const systemPrompt = `Kamu adalah AI Kasir & Waiter restoran "${storeName}".
Tugasmu adalah menganalisis pesan pelanggan (${customerName ? `bernama Kak ${customerName}` : 'pelanggan'}) dan mengekstrak rincian pesanan ke dalam format JSON.

Daftar Menu Restoran yang Tersedia (Kode, Nama, Harga):
${menuCatalog}

Instruksi Analisis:
1. isOrderIntent: 
   - TRUE jika pelanggan bermaksud memesan/order makanan/minuman (misal: "pesen kopi aren 2", "mau order ayam geprek pedes 1", "es teh 2 di meja 4", "bungkus nasi goreng", "pesan M1 2").
   - FALSE jika pelanggan HANYA menyapa ("halo", "p"), bertanya info resto ("buka jam berapa?", "rekomendasi apa ya?"), komplain, atau minta bantuan admin.

2. items: Ekstrak daftar menu yang dipesan:
   - menuCode: Kode resmi dari daftar menu di atas (misal "M1", "D2"). Wajib cocokkan ke menu paling relevan. Jika nama mirip/sinonim (misal "kopi aren" -> Kopi Susu Aren, "geprek" -> Ayam Geprek), gunakan kode resminya.
   - menuName: Nama resmi menu dari daftar di atas.
   - quantity: Jumlah porsi (integer, minimal 1). Jika disebutkan kata "satu/dua/tiga" ubah ke angka 1, 2, 3.
   - notes: Catatan khusus per menu (misal: "pedes banget", "less sugar", "es sedikit", "sambal dipisah", "panas"). Kosongkan "" jika tidak ada.

3. orderType:
   - "dine_in" jika ada kata meja, "di tempat", "di sini", "dine in", "makan di sini".
   - "takeaway" jika ada kata "bungkus", "takeaway", "bawa pulang".
   - "delivery" jika ada kata "antar", "kirim", "delivery", atau menyebut alamat.
   - null jika belum disebutkan.

4. tableNumber:
   - Jika orderType "dine_in" dan pelanggan menyebut nomor meja (misal "meja 4", "meja 04", "table 2", "di meja 3"), ekstrak nomor mejanya (format standar: "MEJA 04" atau "MEJA 2").
   - null jika belum menyebut nomor meja.

5. deliveryAddress:
   - Alamat tujuan pengiriman jika delivery, atau null jika tidak ada.

6. notes:
   - Catatan umum pesanan jika ada, atau null.

7. aiFriendlySummary:
   - Kalimat konfirmasi ramah ala waiter restoran yang menyapa Kak ${customerName || ''}, merincikan pesanan dan meja/tipe secara hangat dan ringkas dengan emoji ramah.

Format output WAJIB HANYA JSON valid tanpa markdown/backticks/teks lain:
{
  "isOrderIntent": true,
  "items": [
    { "menuCode": "M1", "menuName": "Ayam Geprek", "quantity": 2, "notes": "Pedes" }
  ],
  "orderType": "dine_in",
  "tableNumber": "MEJA 04",
  "deliveryAddress": null,
  "notes": null,
  "aiFriendlySummary": "Siap Kak! Pesanan untuk Meja 04 sudah kami catat..."
}`;

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
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
      // Try to clean potential trailing comma or control chars
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

      // Find matching menu in database
      const matchedMenu = activeMenus.find((m: any) => {
        if (targetCode && m.code.toUpperCase() === targetCode) return true;
        if (targetName && m.name.toLowerCase() === targetName) return true;
        if (targetName && (m.name.toLowerCase().includes(targetName) || targetName.includes(m.name.toLowerCase()))) return true;
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
