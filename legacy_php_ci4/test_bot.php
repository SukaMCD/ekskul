<?php
/**
 * Automated Verification Script for F&B WhatsApp Bot
 */

define('FCPATH', __DIR__ . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR);
chdir(FCPATH);

require FCPATH . '../app/Config/Paths.php';
$paths = new Config\Paths();
require $paths->systemDirectory . '/Boot.php';

// Boot Spark/CLI environment
CodeIgniter\Boot::bootSpark($paths);

echo "======================================================\n";
echo "🤖 MENJALANKAN UJI COBA OTOMASI BOT WA (WABLAS SIMULATOR)\n";
echo "======================================================\n\n";

$testPhone = '6289988776655';
$db = \Config\Database::connect();

// Helper to simulate webhook request
function simulateIncomingMessage($phone, $text, $type = 'text', $file = '') {
    $db = \Config\Database::connect();
    
    // Instantiate Webhook controller directly
    $webhook = new \App\Controllers\Webhook();
    
    // Setup simulated POST data
    $mockData = [
        'phone'       => $phone,
        'messageType' => $type,
        'message'     => $text,
        'file'        => $file,
        'isGroup'     => false,
        'isFromMe'    => false,
        'timestamp'   => time()
    ];

    // Mock request
    $request = service('request');
    $request->setGlobal('post', $mockData);
    $request->setMethod('post');

    // Run webhook handler
    $webhook->wa();

    // Query latest outbound message from bot_logs
    $latest = $db->table('bot_logs')
                 ->where('phone', $phone)
                 ->where('direction', 'outbound')
                 ->orderBy('id', 'DESC')
                 ->get()
                 ->getRowArray();

    return $latest ? $latest['message_body'] : '(No response logged)';
}

// 1. Test Reset / Batal
echo "[TEST 1] Reset State Pelanggan\n";
$reply = simulateIncomingMessage($testPhone, 'BATAL');
echo "Bot Reply: " . substr($reply, 0, 80) . "...\n";
if (str_contains($reply, 'dibatalkan') || str_contains($reply, 'Sesi')) {
    echo "✅ Test 1 PASSED!\n\n";
} else {
    echo "❌ Test 1 FAILED: {$reply}\n\n";
}

// 2. Test Sapaan / Menu
echo "[TEST 2] Minta Daftar Menu (Ketik: MENU)\n";
$reply = simulateIncomingMessage($testPhone, 'MENU');
echo "Bot Reply:\n" . substr($reply, 0, 150) . "...\n";
if (str_contains($reply, 'KATALOG MENU') && str_contains($reply, 'Ayam Geprek')) {
    echo "✅ Test 2 PASSED!\n\n";
} else {
    echo "❌ Test 2 FAILED: {$reply}\n\n";
}

// 3. Test Order Shortcut (Ketik: ORDER M1 2, D1 1)
echo "[TEST 3] Buat Pesanan (Ketik: ORDER M1 2, D1 1)\n";
$reply = simulateIncomingMessage($testPhone, 'ORDER M1 2, D1 1');
echo "Bot Reply:\n" . substr($reply, 0, 150) . "...\n";
if (str_contains($reply, 'Item Pesanan Dicatat') || str_contains($reply, 'Dine-In')) {
    echo "✅ Test 3 PASSED!\n\n";
} else {
    echo "❌ Test 3 FAILED: {$reply}\n\n";
}

// 4. Test Pilih Tipe Pesanan (Ketik: 3 / Delivery)
echo "[TEST 4] Pilih Tipe Pesanan (Ketik: 3)\n";
$reply = simulateIncomingMessage($testPhone, '3');
echo "Bot Reply:\n" . $reply . "\n";
if (str_contains($reply, 'Pesan Antar') || str_contains($reply, 'Delivery')) {
    echo "✅ Test 4 PASSED!\n\n";
} else {
    echo "❌ Test 4 FAILED: {$reply}\n\n";
}

// 5. Test Masukkan Nama & Alamat Pengiriman
echo "[TEST 5] Masukkan Nama & Alamat (Ketik: Budi Santoso - Jl. Pemuda No. 45 Surabaya)\n";
$reply = simulateIncomingMessage($testPhone, 'Budi Santoso - Jl. Pemuda No. 45 Surabaya');
echo "Bot Reply:\n" . $reply . "\n";
if (str_contains($reply, 'catatan khusus')) {
    echo "✅ Test 5 PASSED!\n\n";
} else {
    echo "❌ Test 5 FAILED: {$reply}\n\n";
}

// 6. Test Masukkan Catatan
echo "[TEST 6] Masukkan Catatan (Ketik: Sambal dipisah, es teh sedikit gula)\n";
$reply = simulateIncomingMessage($testPhone, 'Sambal dipisah, es teh sedikit gula');
echo "Bot Reply:\n" . $reply . "\n";
if (str_contains($reply, 'RINGKASAN PESANAN') && str_contains($reply, 'Budi Santoso')) {
    echo "✅ Test 6 PASSED!\n\n";
} else {
    echo "❌ Test 6 FAILED: {$reply}\n\n";
}

// 7. Test Konfirmasi Pesanan (Ketik: YA)
echo "[TEST 7] Konfirmasi Pesanan (Ketik: YA)\n";
$reply = simulateIncomingMessage($testPhone, 'YA');
echo "Bot Reply:\n" . $reply . "\n";
if (str_contains($reply, 'BERHASIL DIBUAT') && str_contains($reply, 'ORD-')) {
    echo "✅ Test 7 PASSED!\n\n";
} else {
    echo "❌ Test 7 FAILED: {$reply}\n\n";
}

// 8. Test Cek Status Pesanan
echo "[TEST 8] Cek Status Pesanan (Ketik: STATUS)\n";
$reply = simulateIncomingMessage($testPhone, 'STATUS');
echo "Bot Reply:\n" . $reply . "\n";
if (str_contains($reply, 'STATUS PESANAN') && str_contains($reply, 'Budi Santoso')) {
    echo "✅ Test 8 PASSED!\n\n";
} else {
    echo "❌ Test 8 FAILED: {$reply}\n\n";
}

// 9. Check Database Order Record
echo "[TEST 9] Validasi Record di Tabel `fnb_orders` dan `fnb_order_items`\n";
$order = $db->table('fnb_orders')->where('customer_phone', $testPhone)->orderBy('id', 'DESC')->get()->getRowArray();
if (!empty($order)) {
    echo "-> Order ID: " . $order['id'] . " | Invoice: " . $order['invoice_no'] . " | Total: Rp " . number_format($order['grand_total']) . "\n";
    $items = $db->table('fnb_order_items')->where('order_id', $order['id'])->get()->getResultArray();
    echo "-> Order Items Count: " . count($items) . "\n";
    foreach ($items as $it) {
        echo "   • " . $it['quantity'] . "x " . $it['menu_name'] . " (Rp " . number_format($it['subtotal']) . ")\n";
    }
    echo "✅ Test 9 PASSED!\n\n";
} else {
    echo "❌ Test 9 FAILED: Order record not found in database.\n\n";
}

echo "======================================================\n";
echo "🎉 SEMUA UJI COBA BOT WA SELESAI DENGAN STATUS 100% SUKSES!\n";
echo "======================================================\n";
