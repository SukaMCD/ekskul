<?php
/**
 * Database Setup & Seeder for F&B WhatsApp Bot
 */

$host = '127.0.0.1';
$user = 'root';
$pass = '';
$dbname = 'db_ekskul_fnb_bot';

try {
    // 1. Connect without db to create db if not exists
    $pdo = new PDO("mysql:host={$host};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbname}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Database `{$dbname}` checked/created successfully.\n";

    // 2. Connect to the specific db
    $pdo = new PDO("mysql:host={$host};dbname={$dbname};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // 3. Create Tables
    $queries = [
        "CREATE TABLE IF NOT EXISTS `fnb_categories` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `code` VARCHAR(20) NOT NULL UNIQUE,
            `display_order` INT DEFAULT 0,
            `is_active` TINYINT(1) DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `fnb_menus` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `category_id` INT NOT NULL,
            `code` VARCHAR(20) NOT NULL UNIQUE,
            `name` VARCHAR(150) NOT NULL,
            `description` TEXT NULL,
            `price` DECIMAL(12,2) NOT NULL,
            `image_url` VARCHAR(255) NULL,
            `is_available` TINYINT(1) DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (`category_id`),
            INDEX (`code`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `fnb_orders` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `invoice_no` VARCHAR(50) NOT NULL UNIQUE,
            `customer_phone` VARCHAR(30) NOT NULL,
            `customer_name` VARCHAR(100) NOT NULL,
            `order_type` ENUM('dine_in', 'takeaway', 'delivery') DEFAULT 'delivery',
            `delivery_address` TEXT NULL,
            `notes` TEXT NULL,
            `total_items` INT DEFAULT 0,
            `subtotal` DECIMAL(12,2) DEFAULT 0.00,
            `delivery_fee` DECIMAL(12,2) DEFAULT 0.00,
            `discount` DECIMAL(12,2) DEFAULT 0.00,
            `grand_total` DECIMAL(12,2) DEFAULT 0.00,
            `payment_method` VARCHAR(50) DEFAULT 'Transfer Bank / QRIS',
            `payment_status` ENUM('unpaid', 'paid', 'verified') DEFAULT 'unpaid',
            `order_status` ENUM('pending', 'confirmed', 'cooking', 'ready', 'delivered', 'cancelled') DEFAULT 'pending',
            `proof_image` VARCHAR(255) NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (`customer_phone`),
            INDEX (`invoice_no`),
            INDEX (`order_status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `fnb_order_items` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `order_id` INT NOT NULL,
            `menu_id` INT NULL,
            `menu_code` VARCHAR(20) NOT NULL,
            `menu_name` VARCHAR(150) NOT NULL,
            `price` DECIMAL(12,2) NOT NULL,
            `quantity` INT NOT NULL,
            `subtotal` DECIMAL(12,2) NOT NULL,
            `notes` VARCHAR(255) NULL,
            INDEX (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `bot_configs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `config_key` VARCHAR(100) NOT NULL UNIQUE,
            `config_value` LONGTEXT NULL,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `bot_sessions` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `phone` VARCHAR(30) NOT NULL UNIQUE,
            `state` VARCHAR(50) DEFAULT 'IDLE',
            `temp_data` LONGTEXT NULL,
            `is_paused` TINYINT(1) DEFAULT 0,
            `paused_at` DATETIME DEFAULT NULL,
            `last_interaction` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`phone`),
            INDEX (`is_paused`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `bot_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `phone` VARCHAR(30) NULL,
            `direction` ENUM('inbound', 'outbound') NOT NULL,
            `message_type` VARCHAR(50) DEFAULT 'text',
            `message_body` LONGTEXT NULL,
            `raw_payload` LONGTEXT NULL,
            `status` VARCHAR(50) DEFAULT 'success',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`phone`),
            INDEX (`direction`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

        "CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) NOT NULL,
            `name` VARCHAR(100) NOT NULL,
            `email` VARCHAR(100) NULL,
            `role` VARCHAR(20) DEFAULT 'admin',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ];

    foreach ($queries as $sql) {
        $pdo->exec($sql);
    }
    echo "All tables created successfully.\n";

    // 4. Seed Categories & Menus if empty
    $countCat = $pdo->query("SELECT COUNT(*) FROM `fnb_categories`")->fetchColumn();
    if ($countCat == 0) {
        $cats = [
            ['Makanan Utama', 'MAKANAN', 1],
            ['Camilan & Snack', 'SNACK', 2],
            ['Minuman Segar & Kopi', 'MINUMAN', 3],
            ['Paket Hemat Kenyang', 'PAKET', 4],
        ];
        $stmtCat = $pdo->prepare("INSERT INTO `fnb_categories` (`name`, `code`, `display_order`) VALUES (?, ?, ?)");
        foreach ($cats as $c) {
            $stmtCat->execute($c);
        }

        $menus = [
            // Makanan Utama (Category 1)
            [1, 'M1', 'Ayam Geprek Sambal Bawang + Nasi', 'Ayam krispi gurih dengan sambal bawang pedas nampol + nasi hangat & lalapan', 20000.00, ''],
            [1, 'M2', 'Nasi Goreng Spesial UMKM', 'Nasi goreng racikan khas dengan suwiran ayam, telur mata sapi, sosis, dan kerupuk', 22000.00, ''],
            [1, 'M3', 'Mie Goreng / Rebus Nyemek', 'Mie dimasak dengan bumbu rempah spesial, sayuran segar, telur, dan bakso', 18000.00, ''],
            [1, 'M4', 'Rice Bowl Beef Teriyaki', 'Irisan daging sapi empuk dengan saus teriyaki manis gurih di atas nasi hangat', 28000.00, ''],
            
            // Snack (Category 2)
            [2, 'S1', 'Kentang Goreng Keju (French Fries)', 'Kentang renyah ditaburi bumbu keju gurih spesial', 12000.00, ''],
            [2, 'S2', 'Cireng Krispi Bumbu Rujak', 'Cireng renyah di luar kenyal di dalam dengan cocolan sambal rujak pedas manis', 14000.00, ''],
            [2, 'S3', 'Pisang Goreng Keju Cokelat', 'Pisang manis legit dibalut tepung krispi dengan topping keju parut dan susu cokelat', 15000.00, ''],

            // Minuman (Category 3)
            [3, 'D1', 'Es Kopi Susu Gula Aren', 'Espresso robusta x arabica dengan susu segar dan sirup gula aren murni', 16000.00, ''],
            [3, 'D2', 'Es Teh Manis Jumbo', 'Teh racikan wangi melati segar dingin ukuran jumbo', 6000.00, ''],
            [3, 'D3', 'Es Matcha Latte Creamy', 'Green tea matcha jepang pilihan dipadu susu creamy segar', 18000.00, ''],
            [3, 'D4', 'Es Lemon Tea Segar', 'Teh perasan lemon asli segar melegakan dahaga', 10000.00, ''],

            // Paket Hemat (Category 4)
            [4, 'P1', 'Paket Kenyang 1 (Ayam Geprek + Es Teh Jumbo)', 'Hemat & puas: Nasi Ayam Geprek Sambal Bawang + Es Teh Manis Jumbo', 23000.00, ''],
            [4, 'P2', 'Paket Nongkrong (Kentang Keju + Kopi Gula Aren)', 'Camilan pas: Kentang Goreng Keju + Es Kopi Susu Gula Aren', 25000.00, ''],
        ];

        $stmtMenu = $pdo->prepare("INSERT INTO `fnb_menus` (`category_id`, `code`, `name`, `description`, `price`, `image_url`) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($menus as $m) {
            $stmtMenu->execute($m);
        }
        echo "Default F&B Menu categories and items seeded successfully.\n";
    }

    // 5. Seed Bot Configs
    $defaultConfigs = [
        'bot_active' => '1',
        'bot_name' => 'Resto Sedap Rasa Bot',
        'store_name' => 'Resto Sedap Rasa (UMKM Kuliner)',
        'store_address' => 'Jl. Boulevard Raya No. 88, Surabaya',
        'store_gmaps' => 'https://maps.google.com/?q=-7.2575,112.7521',
        'store_hours' => 'Senin - Minggu: 10.00 - 22.00 WIB',
        'admin_phone' => '6281234567890', // Ubah dengan nomor admin Anda
        'wablas_url' => 'https://sby.wablas.com',
        'wablas_token' => '', // Isi token Wablas Anda
        'wablas_secret' => 'fnb_secret_key_123',
        'bank_info' => "💳 *PEMBAYARAN TRANSFER / QRIS*\n• Bank BCA: *1234567890* a/n Resto Sedap Rasa\n• Bank BRI: *0987654321* a/n Resto Sedap Rasa\n• QRIS: (Ketik 'QRIS' untuk minta QR code)",
        'welcome_message' => "Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf",
    ];

    $stmtCfg = $pdo->prepare("INSERT INTO `bot_configs` (`config_key`, `config_value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`)");
    foreach ($defaultConfigs as $key => $val) {
        $stmtCfg->execute([$key, $val]);
    }
    echo "Default Bot Configs seeded successfully.\n";

    // 6. Seed Admin User
    $countUser = $pdo->query("SELECT COUNT(*) FROM `users` WHERE `username` = 'admin'")->fetchColumn();
    if ($countUser == 0) {
        $passwordHash = password_hash('admin123', PASSWORD_DEFAULT);
        $pdo->prepare("INSERT INTO `users` (`username`, `password`, `name`, `email`, `role`) VALUES (?, ?, ?, ?, ?)")
            ->execute(['admin', $passwordHash, 'Administrator UMKM', 'admin@resto.local', 'admin']);
        echo "Default admin user created: username='admin', password='admin123'\n";
    }

    echo "DATABASE SETUP COMPLETED!\n";

} catch (PDOException $e) {
    echo "DATABASE SETUP ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
