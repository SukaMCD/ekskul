<?php

namespace App\Controllers;

use App\Libraries\WablasService;
use App\Models\BotConfigModel;
use App\Models\BotLogModel;
use App\Models\BotSessionModel;
use App\Models\CategoryModel;
use App\Models\MenuModel;
use App\Models\OrderItemModel;
use App\Models\OrderModel;

class Webhook extends BaseController
{
    protected $wablas;
    protected $configModel;
    protected $sessionModel;
    protected $menuModel;
    protected $categoryModel;
    protected $orderModel;
    protected $orderItemModel;
    protected $logModel;

    public function __construct()
    {
        $this->request        = service('request');
        $this->response       = service('response');
        $this->wablas         = new WablasService();
        $this->configModel    = new BotConfigModel();
        $this->sessionModel   = new BotSessionModel();
        $this->menuModel      = new MenuModel();
        $this->categoryModel  = new CategoryModel();
        $this->orderModel     = new OrderModel();
        $this->orderItemModel = new OrderItemModel();
        $this->logModel       = new BotLogModel();
    }

    /**
     * Entrypoint for Wablas Webhook (GET / POST)
     */
    public function index()
    {
        return $this->wa();
    }

    public function wa(?array $injectedData = null)
    {
        $request = service('request');
        if ($injectedData !== null && !empty($injectedData)) {
            $data = $injectedData;
            $raw  = json_encode($injectedData);
        } else {
            $raw = file_get_contents('php://input');

            // Allow GET query for checking webhook health & config
            if (strtolower($request->getMethod()) === 'get') {
                return service('response')->setJSON([
                    'status'     => true,
                    'app'        => 'F&B UMKM WhatsApp Bot (Wablas Gateway)',
                    'bot_active' => $this->wablas->isBotActive(),
                    'server_time'=> date('Y-m-d H:i:s')
                ]);
            }

            $data = json_decode($raw, true);
            if (!$data || !is_array($data)) {
                // Check form post fallback
                $data = $request->getPost();
            }
        }

        if (empty($data)) {
            return service('response')->setStatusCode(200)->setBody('OK (Empty Payload)');
        }

        // 1. Extract payload fields
        $rawPhone = $data['phone'] ?? $data['from'] ?? $data['sender'] ?? '';
        $phone    = WablasService::normalizePhone($rawPhone);
        $type     = strtolower($data['messageType'] ?? $data['type'] ?? 'text');
        $isGroup  = !empty($data['isGroup']) || (!empty($data['groupId']) && $data['groupId'] !== '0');
        $isFromMe = !empty($data['isFromMe']) || (!empty($data['fromMe']));

        // Ambil text dari berbagai kemungkinan key JSON Wablas
        $text = '';
        if (isset($data['message']) && is_string($data['message'])) {
            $text = $data['message'];
        } elseif (isset($data['caption']) && is_string($data['caption'])) {
            $text = $data['caption'];
        } elseif (isset($data['text']) && is_string($data['text'])) {
            $text = $data['text'];
        } elseif (isset($data['interactive']['button_reply']['title'])) {
            $text = $data['interactive']['button_reply']['title'];
        } elseif (isset($data['interactive']['list_reply']['title'])) {
            $text = $data['interactive']['list_reply']['title'];
        }

        $text = trim($text);

        // Deteksi jika gambar dikirim
        $hasFile = !empty($data['file']) || !empty($data['url']) || !empty($data['image']);
        $imageUrl = $data['file'] ?? $data['url'] ?? $data['image'] ?? '';
        if ($hasFile && ($type === 'text' || empty($type))) {
            $type = 'image';
        }

        // Abaikan jika pesan grup atau nomor kosong
        if ($isGroup || empty($phone)) {
            return $this->response->setStatusCode(200)->setBody('OK (Ignored Group/Empty)');
        }

        // Log inbound message
        $this->wablas->logMessage($phone, 'inbound', $type, $text ?: ($type === 'image' ? '[GAMBAR]' : ''), $raw, 'received');

        // Ambil Configs
        $configs     = $this->configModel->getAllKeyValues();
        $adminPhone  = WablasService::normalizePhone($configs['admin_phone'] ?? '');
        $botActive   = ($configs['bot_active'] ?? '1') === '1';
        $storeName   = $configs['store_name'] ?? 'Resto UMKM';
        $storeAddr   = $configs['store_address'] ?? 'Alamat Toko';
        $storeGmaps  = $configs['store_gmaps'] ?? '';
        $storeHours  = $configs['store_hours'] ?? '10.00 - 22.00 WIB';
        $bankInfo    = $configs['bank_info'] ?? 'Pembayaran BCA / QRIS';

        // 2. Handle ADMIN COMMANDS
        $isAdmin = ($phone === $adminPhone && !empty($adminPhone));
        $cmdLower = strtolower($text);

        if ($isAdmin) {
            if ($cmdLower === 'pause bot') {
                $this->configModel->setValue('bot_active', '0');
                $this->wablas->reloadConfig();
                $this->wablas->sendMessage($phone, "⏸️ *Bot Telah di-PAUSE secara Global.*\nBot tidak akan membalas chat pelanggan sampai kamu kirim *play bot*.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === 'play bot') {
                $this->configModel->setValue('bot_active', '1');
                $this->wablas->reloadConfig();
                $this->wablas->sendMessage($phone, "▶️ *Bot Telah di-AKTIFKAN kembali.*\nBot sekarang membalas chat pelanggan secara otomatis.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === 'status bot') {
                $statusStr = $this->wablas->isBotActive() ? '✅ AKTIF' : '⏸️ PAUSED';
                $todayOrders = $this->orderModel->where('DATE(created_at)', date('Y-m-d'))->countAllResults();
                $pendingOrders = $this->orderModel->where('order_status', 'pending')->countAllResults();
                $msg = "ℹ️ *STATUS BOT RESTO*\n═════════════════\n• Status Bot: *{$statusStr}*\n• Pesanan Hari Ini: *{$todayOrders}*\n• Pesanan Pending: *{$pendingOrders}*\n• Jam Server: *" . date('H:i:s d/m/Y') . "*";
                $this->wablas->sendMessage($phone, $msg);
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === 'whitelist on' || $cmdLower === 'whitelist 1') {
                $this->configModel->setValue('whitelist_mode', '1');
                $this->wablas->reloadConfig();
                $count = count($this->wablas->getWhitelistNumbers());
                $this->wablas->sendMessage($phone, "🛡️ *Mode Whitelist DI-AKTIFKAN!*\nBot saat ini hanya akan membalas {$count} nomor terdaftar dalam whitelist.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === 'whitelist off' || $cmdLower === 'whitelist 0') {
                $this->configModel->setValue('whitelist_mode', '0');
                $this->wablas->reloadConfig();
                $this->wablas->sendMessage($phone, "🌐 *Mode Whitelist DI-NONAKTIFKAN!*\nBot sekarang membalas semua pesan publik dari siapapun.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if (preg_match('/^whitelist\s+add\s+(\+?62\d+|08\d+|\d+)/i', $text, $m)) {
                $target = WablasService::normalizePhone($m[1]);
                $this->wablas->addWhitelistNumber($target);
                $this->wablas->sendMessage($phone, "✅ Nomor *{$target}* berhasil ditambahkan ke whitelist!");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if (preg_match('/^whitelist\s+(del|remove|hapus)\s+(\+?62\d+|08\d+|\d+)/i', $text, $m)) {
                $target = WablasService::normalizePhone($m[2]);
                $this->wablas->removeWhitelistNumber($target);
                $this->wablas->sendMessage($phone, "🗑️ Nomor *{$target}* telah dihapus dari whitelist.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === 'whitelist list' || $cmdLower === 'whitelist info') {
                $isMode = $this->wablas->isWhitelistMode() ? '✅ AKTIF' : '❌ NONAKTIF';
                $nums   = $this->wablas->getWhitelistNumbers();
                $listStr = empty($nums) ? '_(Belum ada nomor)_' : implode("\n• ", $nums);
                $msg = "🛡️ *PENGATURAN WHITELIST BOT*\n═════════════════\n• Status Mode: *{$isMode}*\n• Total Nomor: *" . count($nums) . "*\n\n*Daftar Nomor:*\n• {$listStr}";
                $this->wablas->sendMessage($phone, $msg);
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            // Perintah: play 628xxx atau pause 628xxx
            if (preg_match('/^play\s+(\+?62\d+|08\d+|\d+)/i', $text, $m)) {
                $target = WablasService::normalizePhone($m[1]);
                $this->sessionModel->setPaused($target, false);
                $this->sessionModel->clearState($target);
                $this->wablas->sendMessage($phone, "▶️ Bot diaktifkan kembali untuk nomor *{$target}*.");
                $this->wablas->sendMessage($target, "Halo kak! Admin kami sudah selesai membantu ya. Bot kami aktif kembali untuk membantu kebutuhan pesanan kakak 😊\nKetik *MENU* untuk melihat katalog.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if (preg_match('/^pause\s+(\+?62\d+|08\d+|\d+)/i', $text, $m)) {
                $target = WablasService::normalizePhone($m[1]);
                $this->sessionModel->setPaused($target, true);
                $this->wablas->sendMessage($phone, "⏸️ Bot di-pause untuk nomor *{$target}*.");
                return $this->response->setStatusCode(200)->setBody('OK');
            }
        }

        // 3. Handle IS FROM ME (Admin balas manual lewat WA Web/Device)
        if ($isFromMe) {
            // Jika admin balas langsung ke chat customer, auto-pause bot untuk nomor tsb
            $this->sessionModel->setPaused($phone, true);
            return $this->response->setStatusCode(200)->setBody('OK');
        }

        // 4. Cek Global Bot Status
        if (!$botActive && !$isAdmin) {
            return $this->response->setStatusCode(200)->setBody('OK (Bot Global Inactive)');
        }

        // 5. Cek Mode Whitelist (Jika aktif, hanya respon nomor terdaftar)
        if ($this->wablas->isWhitelistMode() && !$isAdmin) {
            if (!$this->wablas->isPhoneWhitelisted($phone)) {
                $this->wablas->logMessage($phone, 'inbound', $type, $text, $raw, 'ignored_not_whitelisted');
                return $this->response->setStatusCode(200)->setBody('OK (Not Whitelisted)');
            }
        }

        // 5. Ambil Session User
        $session = $this->sessionModel->getSession($phone);
        $tempData = json_decode($session['temp_data'] ?? '[]', true) ?: [];

        // Cek apakah nomor sedang di-pause
        if (!empty($session['is_paused'])) {
            $pausedAt = strtotime($session['paused_at'] ?? 'now');
            $diffMins = (time() - $pausedAt) / 60;
            if ($diffMins < 60) {
                // Masih dalam masa pause, bot tidak menginterupsi chat admin
                return $this->response->setStatusCode(200)->setBody('OK (User Paused)');
            } else {
                // Lewat 60 menit, auto-unpause
                $this->sessionModel->setPaused($phone, false);
            }
        }

        // 6. DETEKSI BUKTI TRANSFER (IMAGE)
        if ($type === 'image' || ($type === 'text' && empty($text) && $hasFile)) {
            $latestUnpaid = $this->orderModel->where('customer_phone', $phone)
                                             ->whereIn('payment_status', ['unpaid', 'paid'])
                                             ->orderBy('id', 'DESC')
                                             ->first();

            if ($latestUnpaid) {
                $this->orderModel->update($latestUnpaid['id'], [
                    'payment_status' => 'paid',
                    'proof_image'    => $imageUrl ?: 'Uploaded via WA'
                ]);

                $reply = "📸 *Bukti Pembayaran Diterima!*\n\nTerima kasih kak! Bukti transfer untuk pesanan *#{$latestUnpaid['invoice_no']}* sudah kami terima dan sedang diverifikasi oleh admin/dapur kami.\n\nPesanan akan segera disiapkan! 🍳\nKetik *STATUS* untuk cek status pesanan kapan saja.";
                $this->wablas->sendMessage($phone, $reply);

                // Notifikasi ke Admin
                if (!empty($adminPhone)) {
                    $adminNotif = "🔔 *BUKTI TRANSFER MASUK!*\n═════════════════════\n• No. Order: *#{$latestUnpaid['invoice_no']}*\n• Pembeli: *{$latestUnpaid['customer_name']}* ({$phone})\n• Total: *Rp " . number_format($latestUnpaid['grand_total'], 0, ',', '.') . "*\n• Status: *Menunggu Verifikasi*\n\nSilakan cek di Admin Dashboard atau aplikasi mutasi bank.";
                    $this->wablas->sendMessage($adminPhone, $adminNotif);
                }

                $this->sessionModel->clearState($phone);
                return $this->response->setStatusCode(200)->setBody('OK');
            } else {
                $reply = "Terima kasih atas kiriman gambarnya kak! 😊\nJika kakak ingin memesan makanan/minuman, silakan ketik *MENU* atau *ORDER*.";
                $this->wablas->sendMessage($phone, $reply);
                return $this->response->setStatusCode(200)->setBody('OK');
            }
        }

        // 7. STATE INITIALIZATION & GLOBAL ESCAPE KEYWORDS
        $currentState = $session['state'] ?? 'IDLE';

        if ($cmdLower === 'batal' || $cmdLower === 'cancel' || $cmdLower === 'reset') {
            $this->sessionModel->clearState($phone);
            $this->wablas->sendMessage($phone, "❌ Sesi pesanan sebelumnya telah dibatalkan.\n\nAda yang bisa kami bantu lagi? Ketik *MENU* untuk melihat katalog.");
            return $this->response->setStatusCode(200)->setBody('OK');
        }

        if ($cmdLower === 'admin' || $cmdLower === 'cs' || $cmdLower === 'owner' || $cmdLower === 'bantuan' || $cmdLower === 'staf' || ($currentState === 'IDLE' && $cmdLower === '5')) {
            $this->sessionModel->setPaused($phone, true);
            $this->wablas->sendMessage($phone, "👨‍💼 *Menghubungkan ke Admin / Staf*\n\nPesan kakak sudah kami teruskan ke admin kami. Staf kami akan segera membalas chat kakak secara manual.\n\n_Bot dijeda sementara waktu untuk nomor ini._");

            if (!empty($adminPhone)) {
                $dispPhone = WablasService::displayPhone($phone);
                $this->wablas->sendMessage($adminPhone, "🔔 *PELANGGAN BUTUH BANTUAN ADMIN!*\nNomor: *{$dispPhone}* ({$phone})\nPesan terakhir: \"{$text}\"\n\n_Bot otomatis di-pause untuk nomor ini agar admin bisa chat langsung._");
            }
            return $this->response->setStatusCode(200)->setBody('OK');
        }

        // 8. STATE MACHINE & FLOW ORDERING

        // Jika dalam keadaan IDLE, proses menu utama, info, status, atau shortcut order
        if ($currentState === 'IDLE') {
            if ($cmdLower === '1' || $cmdLower === 'menu' || $cmdLower === 'katalog' || $cmdLower === 'daftar menu' || $cmdLower === 'pricelist') {
                $this->sessionModel->clearState($phone);
                $menuCatalog = $this->menuModel->getFormattedMenuForBot();
                $this->wablas->sendMessage($phone, $menuCatalog);
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === '4' || $cmdLower === 'info' || $cmdLower === 'lokasi' || $cmdLower === 'alamat' || $cmdLower === 'jam' || $cmdLower === 'rekening' || $cmdLower === 'qris') {
                $infoMsg = "ℹ️ *INFORMASI {$storeName}*\n";
                $infoMsg .= "═══════════════════════\n";
                $infoMsg .= "📍 *Alamat:* {$storeAddr}\n";
                if (!empty($storeGmaps)) {
                    $infoMsg .= "🗺️ *Google Maps:* {$storeGmaps}\n";
                }
                $infoMsg .= "⏰ *Jam Operasional:* {$storeHours}\n\n";
                $infoMsg .= "{$bankInfo}\n";
                $infoMsg .= "═══════════════════════\n";
                $infoMsg .= "Ketik *MENU* untuk melihat menu, atau *ORDER* untuk pesan sekarang!";
                $this->wablas->sendMessage($phone, $infoMsg);
                return $this->response->setStatusCode(200)->setBody('OK');
            }

            if ($cmdLower === '3' || $cmdLower === 'status' || str_starts_with($cmdLower, 'status') || str_starts_with($cmdLower, 'cek')) {
                $this->handleCheckStatus($phone, $text);
                return $this->response->setStatusCode(200)->setBody('OK');
            }
        }

        // Shortcut: Pelanggan langsung ketik "ORDER M1 2, D1 1" atau "PESAN M1 2, D1 1"
        if (preg_match('/^(order|pesan)\s+(.+)$/i', $text, $matches)) {
            $itemsText = trim($matches[2]);
            return $this->processOrderItemsInput($phone, $itemsText, $tempData);
        }

        switch ($currentState) {
            case 'IDLE':
                if ($cmdLower === '2' || $cmdLower === 'order' || $cmdLower === 'pesan' || $cmdLower === 'beli') {
                    $this->sessionModel->updateState($phone, 'ORDERING_ITEMS', []);
                    $guide = "📝 *FORMAT PEMESANAN MAKANAN/MINUMAN*\n";
                    $guide .= "═════════════════════════\n";
                    $guide .= "Silakan ketik kode menu dan jumlah pesanan kakak.\n\n";
                    $guide .= "💡 *Contoh penulisan:*\n";
                    $guide .= "• *M1 2, D1 1* (2 Ayam Geprek + 1 Kopi Aren)\n";
                    $guide .= "• *P1 1, S1 1, D2 2*\n\n";
                    $guide .= "_Belum hafal kodenya? Ketik *MENU* untuk lihat daftar menu._\n";
                    $guide .= "_Ketik *BATAL* kapan saja jika ingin membatalkan._";
                    $this->wablas->sendMessage($phone, $guide);
                    return $this->response->setStatusCode(200)->setBody('OK');
                }

                // Default Fallback: Sambutan & Menu Utama
                $welcomeTpl = $configs['welcome_message'] ?? "Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf";
                $welcomeMsg = str_replace('{store_name}', $storeName, $welcomeTpl);
                $this->wablas->sendMessage($phone, $welcomeMsg);
                return $this->response->setStatusCode(200)->setBody('OK');

            case 'ORDERING_ITEMS':
                return $this->processOrderItemsInput($phone, $text, $tempData);

            case 'ORDERING_TYPE':
                $ans = trim($text);
                $typeMap = [
                    '1' => 'dine_in',
                    'dine in' => 'dine_in',
                    'dine-in' => 'dine_in',
                    'makan di tempat' => 'dine_in',
                    '2' => 'takeaway',
                    'take away' => 'takeaway',
                    'takeaway' => 'takeaway',
                    'bungkus' => 'takeaway',
                    '3' => 'delivery',
                    'delivery' => 'delivery',
                    'antar' => 'delivery',
                    'kirim' => 'delivery',
                ];

                $chosenType = $typeMap[strtolower($ans)] ?? null;
                if (!$chosenType) {
                    $this->wablas->sendMessage($phone, "⚠️ Pilihan tidak valid. Silakan balas dengan angka:\n*1* untuk Makan di Tempat (Dine-In)\n*2* untuk Bungkus (Takeaway)\n*3* untuk Pesan Antar (Delivery)\n\n_(Atau ketik *BATAL* untuk membatalkan)_");
                    return $this->response->setStatusCode(200)->setBody('OK');
                }

                $tempData['order_type'] = $chosenType;
                $tempData['delivery_fee'] = ($chosenType === 'delivery') ? 10000.00 : 0.00;

                $this->sessionModel->updateState($phone, 'ORDERING_NAME_ADDRESS', $tempData);

                if ($chosenType === 'dine_in') {
                    $this->wablas->sendMessage($phone, "🍽️ *Makan di Tempat (Dine-In)*\n\nBoleh minta *Nama Pemesan & Nomor Meja* kakak?\nContoh: *Budi Santoso - Meja 05*");
                } elseif ($chosenType === 'takeaway') {
                    $this->wablas->sendMessage($phone, "🛍️ *Bungkus Bawa Pulang (Takeaway)*\n\nBoleh minta *Nama Lengkap Pemesan* kakak?\nContoh: *Rina Rahayu*");
                } else {
                    $this->wablas->sendMessage($phone, "🛵 *Pesan Antar (Delivery)*\n\nBoleh minta *Nama & Alamat Lengkap Pengiriman* kakak beserta patokannya?\nContoh: *Andi - Jl. Mawar No. 12, RT 02/03 (Pagar Hitam), Surabaya*");
                }
                return $this->response->setStatusCode(200)->setBody('OK');

            case 'ORDERING_NAME_ADDRESS':
                $input = trim($text);
                if (strlen($input) < 2) {
                    $this->wablas->sendMessage($phone, "⚠️ Mohon masukkan nama / alamat yang jelas ya kak.");
                    return $this->response->setStatusCode(200)->setBody('OK');
                }

                $orderType = $tempData['order_type'] ?? 'delivery';
                if ($orderType === 'dine_in') {
                    $parts = explode('-', $input, 2);
                    $tempData['customer_name']    = trim($parts[0]);
                    $tempData['delivery_address'] = isset($parts[1]) ? trim($parts[1]) : 'Meja Belum Ditentukan';
                } elseif ($orderType === 'takeaway') {
                    $tempData['customer_name']    = $input;
                    $tempData['delivery_address'] = 'Takeaway / Ambil di Toko';
                } else {
                    $parts = explode('-', $input, 2);
                    if (count($parts) >= 2) {
                        $tempData['customer_name']    = trim($parts[0]);
                        $tempData['delivery_address'] = trim($parts[1]);
                    } else {
                        $tempData['customer_name']    = 'Kakak ' . substr($phone, -4);
                        $tempData['delivery_address'] = $input;
                    }
                }

                $this->sessionModel->updateState($phone, 'ORDERING_NOTES', $tempData);
                $this->wablas->sendMessage($phone, "📝 Ada *catatan khusus* untuk pesanan ini?\n(Contoh: *Sambal dipisah, es sedikit, jangan pakai daun bawang*).\n\nKetik catatanmu, atau balas *-* (tanda strip) jika tidak ada.");
                return $this->response->setStatusCode(200)->setBody('OK');

            case 'ORDERING_NOTES':
                $notes = trim($text);
                if ($notes === '-' || strtolower($notes) === 'tidak ada' || strtolower($notes) === 'gada' || strtolower($notes) === 'ga ada') {
                    $notes = '-';
                }
                $tempData['notes'] = $notes;

                // Hitung Total
                $items       = $tempData['items'] ?? [];
                $subtotal    = floatval($tempData['subtotal'] ?? 0);
                $deliveryFee = floatval($tempData['delivery_fee'] ?? 0);
                $grandTotal  = $subtotal + $deliveryFee;

                $tempData['grand_total'] = $grandTotal;

                $this->sessionModel->updateState($phone, 'ORDERING_CONFIRM', $tempData);

                // Build Summary Card
                $typeLabel = ($tempData['order_type'] === 'dine_in') ? 'Dine-In (Makan di Tempat)' : (($tempData['order_type'] === 'takeaway') ? 'Takeaway (Bungkus)' : 'Delivery (Pesan Antar)');

                $summary = "🧾 *RINGKASAN PESANAN KAKAK*\n";
                $summary .= "═════════════════════════\n";
                $summary .= "👤 *Pemesan:* {$tempData['customer_name']}\n";
                $summary .= "📌 *Tipe:* {$typeLabel}\n";
                $summary .= "📍 *Tujuan/Meja:* {$tempData['delivery_address']}\n";
                $summary .= "📝 *Catatan:* {$tempData['notes']}\n";
                $summary .= "─────────────────────────\n";
                $summary .= "*DAFTAR ITEM:*\n";
                foreach ($items as $it) {
                    $itemPrice = 'Rp ' . number_format($it['price'], 0, ',', '.');
                    $itemSub   = 'Rp ' . number_format($it['subtotal'], 0, ',', '.');
                    $summary .= "• {$it['menu_name']} ({$it['quantity']}x @ {$itemPrice}) = *{$itemSub}*\n";
                }
                $summary .= "─────────────────────────\n";
                $summary .= "Subtotal: *Rp " . number_format($subtotal, 0, ',', '.') . "*\n";
                if ($deliveryFee > 0) {
                    $summary .= "Ongkir: *Rp " . number_format($deliveryFee, 0, ',', '.') . "*\n";
                }
                $summary .= "💰 *TOTAL BAYAR: Rp " . number_format($grandTotal, 0, ',', '.') . "*\n";
                $summary .= "═════════════════════════\n\n";
                $summary .= "Apakah data pesanan di atas sudah benar?\n";
                $summary .= "Ketik *YA* untuk memproses pesanan.\n";
                $summary .= "Ketik *BATAL* untuk membatalkan.";

                $this->wablas->sendMessage($phone, $summary);
                return $this->response->setStatusCode(200)->setBody('OK');

            case 'ORDERING_CONFIRM':
                if ($cmdLower === 'ya' || $cmdLower === 'oke' || $cmdLower === 'ok' || $cmdLower === 'benar' || $cmdLower === '1' || $cmdLower === 'siap' || $cmdLower === 'y') {
                    // Simpan pesanan ke Database
                    return $this->finalizeOrder($phone, $tempData, $configs);
                } elseif ($cmdLower === 'batal' || $cmdLower === 'tidak' || $cmdLower === 'gak' || $cmdLower === 'ga' || $cmdLower === '2') {
                    $this->sessionModel->clearState($phone);
                    $this->wablas->sendMessage($phone, "❌ Pesanan berhasil dibatalkan. Terima kasih!\n\nKetik *MENU* jika ingin melihat daftar menu kami kembali.");
                    return $this->response->setStatusCode(200)->setBody('OK');
                } else {
                    $this->wablas->sendMessage($phone, "⚠️ Mohon balas *YA* jika pesanan sudah benar, atau *BATAL* untuk membatalkan.");
                    return $this->response->setStatusCode(200)->setBody('OK');
                }

            default:
                $this->sessionModel->clearState($phone);
                $this->wablas->sendMessage($phone, "Halo kak! Ketik *MENU* untuk melihat katalog menu makanan & minuman kami 😊");
                return $this->response->setStatusCode(200)->setBody('OK');
        }
    }

    /**
     * Process & Parse Order Items Input
     */
    protected function processOrderItemsInput(string $phone, string $text, array $tempData)
    {
        // Parse codes like "M1 2, D1 1, S2 3" or "M1:2, D1:1" or "M1 x 2"
        $entries = preg_split('/[,;\n]+/', $text);
        $parsedItems = [];
        $unrecognized = [];
        $totalItems = 0;
        $subtotal = 0.00;

        foreach ($entries as $entry) {
            $entry = trim($entry);
            if (empty($entry)) continue;

            // Regex matches: "M1 2" or "M1: 2" or "M1 x2" or "M1 2x" or "M1"
            if (preg_match('/^([A-Za-z0-9]+)\s*[:xX]?\s*(\d+)?\s*[xX]?$/i', $entry, $matches)) {
                $code = strtoupper(trim($matches[1]));
                $qty  = isset($matches[2]) && intval($matches[2]) > 0 ? intval($matches[2]) : 1;

                $menu = $this->menuModel->findByCode($code);
                if ($menu && !empty($menu['is_available'])) {
                    $itemSub = floatval($menu['price']) * $qty;
                    $parsedItems[] = [
                        'menu_id'   => $menu['id'],
                        'menu_code' => $menu['code'],
                        'menu_name' => $menu['name'],
                        'price'     => floatval($menu['price']),
                        'quantity'  => $qty,
                        'subtotal'  => $itemSub,
                        'notes'     => ''
                    ];
                    $totalItems += $qty;
                    $subtotal   += $itemSub;
                } else {
                    $unrecognized[] = $code;
                }
            } else {
                $unrecognized[] = $entry;
            }
        }

        if (empty($parsedItems)) {
            $msg = "⚠️ Maaf kak, kami belum bisa mengenali format pesanan tersebut.\n\n";
            $msg .= "💡 *Contoh format yang benar:*\n";
            $msg .= "• *M1 2, D1 1* (2 Ayam Geprek, 1 Kopi Aren)\n";
            $msg .= "• *P1 1, S1 2*\n\n";
            $msg .= "Ketik *MENU* untuk melihat daftar kode menu, atau ketik *BATAL* untuk keluar.";
            $this->wablas->sendMessage($phone, $msg);
            return $this->response->setStatusCode(200)->setBody('OK');
        }

        // Simpan parsed items ke session
        $tempData['items']       = $parsedItems;
        $tempData['total_items'] = $totalItems;
        $tempData['subtotal']    = $subtotal;

        $this->sessionModel->updateState($phone, 'ORDERING_TYPE', $tempData);

        // Build Confirmation of items
        $reply = "✅ *Item Pesanan Dicatat:*\n";
        foreach ($parsedItems as $it) {
            $p = 'Rp ' . number_format($it['price'], 0, ',', '.');
            $s = 'Rp ' . number_format($it['subtotal'], 0, ',', '.');
            $reply .= "• {$it['menu_name']} ({$it['quantity']}x @ {$p}) = *{$s}*\n";
        }
        $reply .= "Subtotal: *Rp " . number_format($subtotal, 0, ',', '.') . "*\n";

        if (!empty($unrecognized)) {
            $reply .= "\n_(Catatan: Kode [" . implode(', ', $unrecognized) . "] tidak ditemukan dan dilewati)_\n";
        }

        $reply .= "\n═══════════════════════\n";
        $reply .= "Selanjutnya, pesanan ini untuk:\n";
        $reply .= "1️⃣ *Makan di Tempat (Dine-In)*\n";
        $reply .= "2️⃣ *Bungkus (Takeaway)*\n";
        $reply .= "3️⃣ *Pesan Antar (Delivery)*\n\n";
        $reply .= "Balas dengan angka *1*, *2*, atau *3* ya kak.";

        $this->wablas->sendMessage($phone, $reply);
        return $this->response->setStatusCode(200)->setBody('OK');
    }

    /**
     * Finalize Order & Save to Database
     */
    protected function finalizeOrder(string $phone, array $tempData, array $configs)
    {
        $invoiceNo   = $this->orderModel->generateInvoiceNo();
        $adminPhone  = WablasService::normalizePhone($configs['admin_phone'] ?? '');
        $bankInfo    = $configs['bank_info'] ?? 'Pembayaran BCA / QRIS';
        $storeName   = $configs['store_name'] ?? 'Resto UMKM';

        $orderData = [
            'invoice_no'       => $invoiceNo,
            'customer_phone'   => $phone,
            'customer_name'    => $tempData['customer_name'] ?? 'Pelanggan',
            'order_type'       => $tempData['order_type'] ?? 'delivery',
            'delivery_address' => $tempData['delivery_address'] ?? '-',
            'notes'            => $tempData['notes'] ?? '-',
            'total_items'      => intval($tempData['total_items'] ?? 0),
            'subtotal'         => floatval($tempData['subtotal'] ?? 0),
            'delivery_fee'     => floatval($tempData['delivery_fee'] ?? 0),
            'discount'         => 0.00,
            'grand_total'      => floatval($tempData['grand_total'] ?? 0),
            'payment_method'   => 'Transfer Bank / QRIS',
            'payment_status'   => 'unpaid',
            'order_status'     => 'pending',
            'created_at'       => date('Y-m-d H:i:s')
        ];

        $orderId = $this->orderModel->insert($orderData);

        // Insert Items
        if (!empty($tempData['items'])) {
            foreach ($tempData['items'] as $item) {
                $this->orderItemModel->insert([
                    'order_id'   => $orderId,
                    'menu_id'    => $item['menu_id'] ?? null,
                    'menu_code'  => $item['menu_code'] ?? '',
                    'menu_name'  => $item['menu_name'] ?? '',
                    'price'      => $item['price'] ?? 0,
                    'quantity'   => $item['quantity'] ?? 1,
                    'subtotal'   => $item['subtotal'] ?? 0,
                    'notes'      => $item['notes'] ?? ''
                ]);
            }
        }

        // Clear State
        $this->sessionModel->clearState($phone);

        // Kirim Invoice ke Pelanggan
        $invoiceMsg = "🎉 *PESANAN BERHASIL DIBUAT!*\n";
        $invoiceMsg .= "═════════════════════════\n";
        $invoiceMsg .= "No. Invoice: *#{$invoiceNo}*\n";
        $invoiceMsg .= "Nama: *{$orderData['customer_name']}*\n";
        $invoiceMsg .= "Status: *Menunggu Pembayaran ⏳*\n";
        $invoiceMsg .= "Total Tagihan: *Rp " . number_format($orderData['grand_total'], 0, ',', '.') . "*\n";
        $invoiceMsg .= "═════════════════════════\n\n";
        $invoiceMsg .= "💳 *CARA PEMBAYARAN:*\n";
        $invoiceMsg .= "{$bankInfo}\n\n";
        $invoiceMsg .= "📸 *PENTING:* Setelah transfer, silakan *kirim foto bukti transfer* langsung ke chat WhatsApp ini ya kak agar pesanan langsung kami masak!\n\n";
        $invoiceMsg .= "Ketik *STATUS* kapan saja untuk memantau status pesanan kakak. Terima kasih! 🙏😊";

        $this->wablas->sendMessage($phone, $invoiceMsg);

        // Kirim Notifikasi Pesanan Masuk ke Admin/Dapur
        if (!empty($adminPhone)) {
            $typeLabel = ($orderData['order_type'] === 'dine_in') ? 'DINE-IN' : (($orderData['order_type'] === 'takeaway') ? 'TAKEAWAY' : 'DELIVERY');
            $adminAlert = "🔥 *PESANAN BARU MASUK!* 🔥\n";
            $adminAlert .= "═════════════════════════\n";
            $adminAlert .= "No. Order: *#{$invoiceNo}*\n";
            $adminAlert .= "Tipe: *{$typeLabel}*\n";
            $adminAlert .= "Pelanggan: *{$orderData['customer_name']}* (" . WablasService::displayPhone($phone) . ")\n";
            $adminAlert .= "Tujuan/Meja: *{$orderData['delivery_address']}*\n";
            $adminAlert .= "Catatan: *{$orderData['notes']}*\n";
            $adminAlert .= "─────────────────────────\n";
            $adminAlert .= "*Daftar Menu:*\n";
            foreach ($tempData['items'] as $it) {
                $adminAlert .= "• {$it['quantity']}x {$it['menu_name']}\n";
            }
            $adminAlert .= "─────────────────────────\n";
            $adminAlert .= "💰 *Total: Rp " . number_format($orderData['grand_total'], 0, ',', '.') . "*\n";
            $adminAlert .= "Status: *Belum Bayar*\n\n";
            $adminAlert .= "_Buka Admin Dashboard untuk update status atau kirim notifikasi siap._";

            $this->wablas->sendMessage($adminPhone, $adminAlert);
        }

        return $this->response->setStatusCode(200)->setBody('OK');
    }

    /**
     * Handle Cek Status Pesanan
     */
    protected function handleCheckStatus(string $phone, string $text)
    {
        $order = null;

        // Cek jika ada invoice number di pesan (e.g. STATUS ORD-20260821-001)
        if (preg_match('/(ORD-[\d-]+)/i', $text, $m)) {
            $inv = strtoupper($m[1]);
            $order = $this->orderModel->where('invoice_no', $inv)->first();
        }

        // Fallback: Ambil order terakhir nomor ini
        if (!$order) {
            $order = $this->orderModel->getLatestOrderByPhone($phone);
        }

        if (!$order) {
            $this->wablas->sendMessage($phone, "ℹ️ Belum ada riwayat pesanan yang tercatat untuk nomor ini kak.\n\nKetik *MENU* untuk melihat katalog dan mulai memesan! 🍽️");
            return;
        }

        $orderWithItems = $this->orderModel->getOrderWithItems($order['id']);
        $statusLabels = [
            'pending'   => 'Menunggu Konfirmasi / Pembayaran ⏳',
            'confirmed' => 'Pesanan Dikonfirmasi ✅',
            'cooking'   => 'Sedang Dimasak / Disiapkan di Dapur 🍳🔥',
            'ready'     => 'Siap Diambil / Siap Antar 📦✨',
            'delivered' => 'Selesai / Sudah Diterima 🎉',
            'cancelled' => 'Dibatalkan ❌',
        ];

        $paymentLabels = [
            'unpaid'   => 'Belum Bayar ❌',
            'paid'     => 'Menunggu Verifikasi Bukti ⏳',
            'verified' => 'Lunas / Terverifikasi ✅',
        ];

        $statusStr  = $statusLabels[$order['order_status']] ?? $order['order_status'];
        $paymentStr = $paymentLabels[$order['payment_status']] ?? $order['payment_status'];

        $msg = "📋 *STATUS PESANAN KAKAK*\n";
        $msg .= "═════════════════════════\n";
        $msg .= "No. Invoice: *#{$order['invoice_no']}*\n";
        $msg .= "Nama: *{$order['customer_name']}*\n";
        $msg .= "Waktu Pesan: *" . date('d/m/Y H:i', strtotime($order['created_at'])) . " WIB*\n";
        $msg .= "Status Pesanan: *{$statusStr}*\n";
        $msg .= "Status Bayar: *{$paymentStr}*\n";
        $msg .= "─────────────────────────\n";
        $msg .= "*Rincian Item:*\n";
        if (!empty($orderWithItems['items'])) {
            foreach ($orderWithItems['items'] as $it) {
                $msg .= "• {$it['quantity']}x {$it['menu_name']}\n";
            }
        }
        $msg .= "Total: *Rp " . number_format($order['grand_total'], 0, ',', '.') . "*\n";
        $msg .= "═════════════════════════\n";

        if ($order['payment_status'] === 'unpaid') {
            $msg .= "\n💡 *Pengingat:* Mohon selesaikan pembayaran dan kirim foto bukti transfer ke chat ini ya kak.";
        }

        $this->wablas->sendMessage($phone, $msg);
    }
}
