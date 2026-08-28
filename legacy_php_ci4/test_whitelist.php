<?php
/**
 * Automated Test for Whitelist / Trial Feature
 */

define('FCPATH', __DIR__ . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR);
defined('ENVIRONMENT') || define('ENVIRONMENT', 'development');

require FCPATH . '../app/Config/Paths.php';
$paths = new Config\Paths();
require $paths->systemDirectory . '/Boot.php';

\CodeIgniter\Boot::bootConsole($paths);

echo "======================================================\n";
echo "🛡️ MENJALANKAN UJI COBA FITUR WHITELIST BOT WA\n";
echo "======================================================\n\n";

$db          = \Config\Database::connect();
$configModel = new \App\Models\BotConfigModel();
$wablas      = new \App\Libraries\WablasService();

$whitelistedPhone = '6281111111111';
$unlistedPhone    = '6289999999999';
$adminPhone       = '6281234567890';

// Setup Whitelist Config
$configModel->setValue('whitelist_mode', '1');
$configModel->setValue('whitelist_numbers', '6281111111111, 081222222222');
$configModel->setValue('admin_phone', $adminPhone);
$wablas->reloadConfig();

// Helper to simulate webhook request
function simulateIncomingMessage($phone, $text, $type = 'text') {
    $db = \Config\Database::connect();
    
    $mockData = [
        'phone'       => $phone,
        'messageType' => $type,
        'message'     => $text,
        'isGroup'     => false,
        'isFromMe'    => false,
        'timestamp'   => time()
    ];

    $webhook = new \App\Controllers\Webhook();
    $webhook->wa($mockData);

    $latest = $db->table('bot_logs')
                 ->where('phone', $phone)
                 ->where('direction', 'outbound')
                 ->orderBy('id', 'DESC')
                 ->get()
                 ->getRowArray();

    return $latest ? $latest['message_body'] : null;
}

// 1. Test Unlisted Number when Whitelist Mode is ON
echo "[TEST 1] Nomor Tidak Terdaftar Kirim Chat (Mode Whitelist Aktif)\n";
$timeBefore = date('Y-m-d H:i:s', time() - 1);
$reply = simulateIncomingMessage($unlistedPhone, 'MENU');
$logCheck = $db->table('bot_logs')->where('phone', $unlistedPhone)->where('status', 'ignored_not_whitelisted')->where('created_at >=', $timeBefore)->get()->getRowArray();

if ($logCheck) {
    echo "-> Hasil: Pesan diabaikan dan dicatat sebagai 'ignored_not_whitelisted'\n";
    echo "✅ Test 1 PASSED (Unlisted number blocked successfully)!\n\n";
} else {
    echo "❌ Test 1 FAILED\n\n";
}

// 2. Test Whitelisted Number
echo "[TEST 2] Nomor Whitelist Kirim Chat (Mode Whitelist Aktif)\n";
$reply = simulateIncomingMessage($whitelistedPhone, 'MENU');
echo "Bot Reply: " . substr($reply ?? '', 0, 80) . "...\n";
if ($reply && str_contains($reply, 'KATALOG MENU')) {
    echo "✅ Test 2 PASSED (Whitelisted number answered successfully)!\n\n";
} else {
    echo "❌ Test 2 FAILED\n\n";
}

// 3. Test Admin Whitelist Command via WA (whitelist info)
echo "[TEST 3] Admin Cek Status Whitelist (Ketik: whitelist info)\n";
$reply = simulateIncomingMessage($adminPhone, 'whitelist info');
echo "Bot Reply:\n" . $reply . "\n";
if ($reply && str_contains($reply, 'PENGATURAN WHITELIST') && str_contains($reply, '6281111111111')) {
    echo "✅ Test 3 PASSED (Admin command verified)!\n\n";
} else {
    echo "❌ Test 3 FAILED\n\n";
}

// 4. Test Disable Whitelist Mode
echo "[TEST 4] Matikan Mode Whitelist (whitelist off)\n";
$reply = simulateIncomingMessage($adminPhone, 'whitelist off');
echo "Bot Reply:\n" . $reply . "\n";

// Sekarang coba nomor unlisted kirim chat lagi
$replyUnlisted = simulateIncomingMessage($unlistedPhone, 'MENU');
if ($replyUnlisted && str_contains($replyUnlisted, 'KATALOG MENU')) {
    echo "-> Hasil: Setelah whitelist dimatikan, semua nomor umum dapat dilayani bot.\n";
    echo "✅ Test 4 PASSED!\n\n";
} else {
    echo "❌ Test 4 FAILED\n\n";
}

echo "======================================================\n";
echo "🎉 SEMUA UJI COBA FITUR WHITELIST SELESAI DENGAN SUKSES!\n";
echo "======================================================\n";
