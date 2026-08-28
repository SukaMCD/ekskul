import * as dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  // ignore
}

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User';
import Category from '../src/models/Category';
import Menu from '../src/models/Menu';
import BotConfig from '../src/models/BotConfig';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ekskul_fnb_bot';

async function seed() {
  console.log('Connecting to MongoDB Atlas at:', MONGODB_URI.replace(/:([^@]+)@/, ':****@'));
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB successfully!');

  // 1. Seed Admin User
  const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await User.findOne({ username: adminUsername });

  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(adminPassword, salt);
    await User.create({
      username: adminUsername,
      password: passwordHash,
      name: 'Administrator UMKM',
      email: 'admin@resto.local',
      role: 'admin',
    });
    console.log(`Default admin user created -> Username: ${adminUsername}, Password: ${adminPassword}`);
  } else {
    console.log('Admin user already exists.');
  }

  // 2. Seed Categories
  const categoryCount = await Category.countDocuments({});
  if (categoryCount === 0) {
    const catData = [
      { name: 'Makanan Utama', code: 'MAKANAN', displayOrder: 1, isActive: true },
      { name: 'Camilan & Snack', code: 'SNACK', displayOrder: 2, isActive: true },
      { name: 'Minuman Segar & Kopi', code: 'MINUMAN', displayOrder: 3, isActive: true },
      { name: 'Paket Hemat Kenyang', code: 'PAKET', displayOrder: 4, isActive: true },
    ];

    const createdCats = await Category.insertMany(catData);
    console.log(`Created ${createdCats.length} default categories.`);

    const catMap: Record<string, mongoose.Types.ObjectId> = {};
    createdCats.forEach((c) => {
      catMap[c.code] = c._id as mongoose.Types.ObjectId;
    });

    // 3. Seed Menus
    const menuData = [
      // Makanan Utama
      {
        categoryId: catMap['MAKANAN'],
        code: 'M1',
        name: 'Ayam Geprek Sambal Bawang + Nasi',
        description: 'Ayam krispi gurih dengan sambal bawang pedas nampol + nasi hangat & lalapan',
        price: 20000,
        imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MAKANAN'],
        code: 'M2',
        name: 'Nasi Goreng Spesial UMKM',
        description: 'Nasi goreng racikan khas dengan suwiran ayam, telur mata sapi, sosis, dan kerupuk',
        price: 22000,
        imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MAKANAN'],
        code: 'M3',
        name: 'Mie Goreng / Rebus Nyemek',
        description: 'Mie dimasak dengan bumbu rempah spesial, sayuran segar, telur, dan bakso',
        price: 18000,
        imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MAKANAN'],
        code: 'M4',
        name: 'Rice Bowl Beef Teriyaki',
        description: 'Irisan daging sapi empuk dengan saus teriyaki manis gurih di atas nasi hangat',
        price: 28000,
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },

      // Snacks
      {
        categoryId: catMap['SNACK'],
        code: 'S1',
        name: 'Kentang Goreng Keju (French Fries)',
        description: 'Kentang renyah ditaburi bumbu keju gurih spesial',
        price: 12000,
        imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['SNACK'],
        code: 'S2',
        name: 'Cireng Krispi Bumbu Rujak',
        description: 'Cireng renyah di luar kenyal di dalam dengan cocolan sambal rujak pedas manis',
        price: 14000,
        imageUrl: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['SNACK'],
        code: 'S3',
        name: 'Pisang Goreng Keju Cokelat',
        description: 'Pisang manis legit dibalut tepung krispi dengan topping keju parut dan susu cokelat',
        price: 15000,
        imageUrl: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },

      // Minuman
      {
        categoryId: catMap['MINUMAN'],
        code: 'D1',
        name: 'Es Kopi Susu Gula Aren',
        description: 'Espresso robusta x arabica dengan susu segar dan sirup gula aren murni',
        price: 16000,
        imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MINUMAN'],
        code: 'D2',
        name: 'Es Teh Manis Jumbo',
        description: 'Teh racikan wangi melati segar dingin ukuran jumbo',
        price: 6000,
        imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MINUMAN'],
        code: 'D3',
        name: 'Es Matcha Latte Creamy',
        description: 'Green tea matcha jepang pilihan dipadu susu creamy segar',
        price: 18000,
        imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['MINUMAN'],
        code: 'D4',
        name: 'Es Lemon Tea Segar',
        description: 'Teh perasan lemon asli segar melegakan dahaga',
        price: 10000,
        imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },

      // Paket
      {
        categoryId: catMap['PAKET'],
        code: 'P1',
        name: 'Paket Kenyang 1 (Ayam Geprek + Es Teh Jumbo)',
        description: 'Hemat & puas: Nasi Ayam Geprek Sambal Bawang + Es Teh Manis Jumbo',
        price: 23000,
        imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
      {
        categoryId: catMap['PAKET'],
        code: 'P2',
        name: 'Paket Nongkrong (Kentang Keju + Kopi Gula Aren)',
        description: 'Camilan pas: Kentang Goreng Keju + Es Kopi Susu Gula Aren',
        price: 25000,
        imageUrl: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
      },
    ];

    const createdMenus = await Menu.insertMany(menuData);
    console.log(`Created ${createdMenus.length} default menu items.`);
  } else {
    console.log('Categories and Menus already exist.');
  }

  // 4. Seed Bot Configs
  const defaultConfigs: Record<string, string> = {
    bot_active: '1',
    bot_name: 'Resto Sedap Rasa Bot',
    store_name: 'Resto Sedap Rasa (UMKM Kuliner)',
    store_address: 'Jl. Boulevard Raya No. 88, Surabaya',
    store_gmaps: 'https://maps.google.com/?q=-7.2575,112.7521',
    store_hours: 'Senin - Minggu: 10.00 - 22.00 WIB',
    admin_phone: '6281234567890',
    wablas_url: 'https://sby.wablas.com',
    wablas_token: '',
    wablas_secret: 'fnb_secret_key_123',
    bank_info: `💳 *PEMBAYARAN TRANSFER / QRIS*\n• Bank BCA: *1234567890* a/n Resto Sedap Rasa\n• Bank BRI: *0987654321* a/n Resto Sedap Rasa\n• QRIS: (Ketik 'QRIS' untuk minta QR code)`,
    welcome_message: `Halo kak! Selamat datang di *{store_name}* 🍽️\nAda yang bisa kami bantu hari ini?\n\nSilakan ketik nomor pilihan berikut:\n1️⃣ *MENU* - Lihat Katalog Menu & Harga\n2️⃣ *ORDER* - Buat Pesanan Baru\n3️⃣ *STATUS* - Cek Status Pesanan\n4️⃣ *INFO* - Lokasi, Jam Buka & Rekening\n5️⃣ *ADMIN* - Bicara dengan Admin / Staf`,
    whitelist_mode: '0',
    whitelist_numbers: '',
  };

  for (const [key, value] of Object.entries(defaultConfigs)) {
    await BotConfig.findOneAndUpdate(
      { configKey: key },
      { configKey: key, configValue: value },
      { upsert: true, new: true }
    );
  }
  console.log('Bot Configs seeded successfully.');

  console.log('\n🎉 ALL DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeder failed with error:', err);
  process.exit(1);
});
