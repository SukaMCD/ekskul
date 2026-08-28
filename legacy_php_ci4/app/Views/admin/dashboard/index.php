<?= $this->extend('admin/layout/main') ?>

<?= $this->section('content') ?>

<!-- Bot Status Banner -->
<div class="card card-custom border-0 mb-4 text-white position-relative overflow-hidden" style="background: linear-gradient(135deg, #075E54 0%, #128C7E 100%);">
    <div class="card-body p-4">
        <div class="row align-items-center">
            <div class="col-lg-8">
                <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                    <span class="badge bg-white text-success px-3 py-2 rounded-pill fw-bold">
                        <i class="fa-solid fa-circle text-success me-1"></i> Bot WhatsApp: <?= (($configs['bot_active'] ?? '1') === '1') ? 'AKTIF (Online)' : 'NONAKTIF' ?>
                    </span>
                    <?php if (($configs['whitelist_mode'] ?? '0') === '1'): ?>
                        <span class="badge bg-warning text-dark px-3 py-2 rounded-pill fw-bold">
                            <i class="fa-solid fa-shield-halved me-1"></i> Mode Whitelist Aktif
                        </span>
                    <?php endif; ?>
                    <span class="text-white-50 small ms-2">Toko: <strong><?= esc($configs['store_name'] ?? 'Resto UMKM') ?></strong></span>
                </div>
                <h4 class="fw-bold mb-2">Otomasi Pemesanan & Customer Service Siap Melayani 🚀</h4>
                <p class="text-white-50 mb-0 small">Pelanggan dapat melihat katalog menu, membuat pesanan dengan hitung total otomatis, cek status order, dan kirim bukti bayar langsung via WhatsApp Wablas.</p>
            </div>
            <div class="col-lg-4 text-lg-end mt-3 mt-lg-0">
                <a href="<?= site_url('admin/settings') ?>" class="btn btn-light rounded-pill px-4 fw-semibold text-success shadow-sm">
                    <i class="fa-solid fa-gear me-1"></i> Konfigurasi Bot
                </a>
            </div>
        </div>
    </div>
</div>

<!-- Key Metrics Row -->
<div class="row g-4 mb-4">
    <div class="col-12 col-sm-6 col-xl-3">
        <div class="card-custom stat-card">
            <div>
                <small class="text-muted fw-semibold">Pesanan Hari Ini</small>
                <h3 class="fw-bold mb-0 mt-1"><?= number_format($todayOrdersCount) ?></h3>
                <small class="text-success"><i class="fa-solid fa-arrow-trend-up me-1"></i> Real-time hari ini</small>
            </div>
            <div class="stat-icon-wrapper bg-primary bg-opacity-10 text-primary">
                <i class="fa-solid fa-receipt"></i>
            </div>
        </div>
    </div>

    <div class="col-12 col-sm-6 col-xl-3">
        <div class="card-custom stat-card">
            <div>
                <small class="text-muted fw-semibold">Omset Terbayar Hari Ini</small>
                <h3 class="fw-bold mb-0 mt-1">Rp <?= number_format($todayRevenue, 0, ',', '.') ?></h3>
                <small class="text-muted">Status: Lunas / Terverifikasi</small>
            </div>
            <div class="stat-icon-wrapper bg-success bg-opacity-10 text-success">
                <i class="fa-solid fa-money-bill-wave"></i>
            </div>
        </div>
    </div>

    <div class="col-12 col-sm-6 col-xl-3">
        <div class="card-custom stat-card">
            <div>
                <small class="text-muted fw-semibold">Perlu Diproses (Pending)</small>
                <h3 class="fw-bold mb-0 mt-1 text-warning"><?= number_format($pendingOrdersCount) ?></h3>
                <small class="text-muted">Pesanan menunggu respon dapur</small>
            </div>
            <div class="stat-icon-wrapper bg-warning bg-opacity-10 text-warning">
                <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
        </div>
    </div>

    <div class="col-12 col-sm-6 col-xl-3">
        <div class="card-custom stat-card">
            <div>
                <small class="text-muted fw-semibold">Total Menu Aktif</small>
                <h3 class="fw-bold mb-0 mt-1"><?= number_format($totalMenusCount) ?></h3>
                <small class="text-muted">Makanan, Camilan & Minuman</small>
            </div>
            <div class="stat-icon-wrapper bg-info bg-opacity-10 text-info">
                <i class="fa-solid fa-utensils"></i>
            </div>
        </div>
    </div>
</div>

<!-- Recent Orders Table -->
<div class="card card-custom border-0 mb-4">
    <div class="card-header bg-white py-3 px-4 border-bottom d-flex align-items-center justify-content-between">
        <div>
            <h6 class="fw-bold mb-0">Pesanan Masuk Terbaru</h6>
            <small class="text-muted">Daftar pesanan yang dibuat oleh pelanggan melalui WhatsApp</small>
        </div>
        <a href="<?= site_url('admin/orders') ?>" class="btn btn-outline-success btn-sm rounded-pill px-3">
            Lihat Semua Pesanan <i class="fa-solid fa-arrow-right ms-1"></i>
        </a>
    </div>
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="ps-4">No. Invoice</th>
                        <th>Pelanggan</th>
                        <th>Tipe Order</th>
                        <th>Total Bayar</th>
                        <th>Status Bayar</th>
                        <th>Status Pesanan</th>
                        <th class="text-end pe-4">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($recentOrders)): ?>
                        <tr>
                            <td colspan="7" class="text-center py-5 text-muted">
                                <i class="fa-solid fa-inbox fa-3x mb-3 text-secondary opacity-50 d-block"></i>
                                Belum ada pesanan masuk. Coba lakukan simulasi pesanan via Webhook Simulator di menu Pengaturan!
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($recentOrders as $ord): ?>
                            <tr>
                                <td class="ps-4">
                                    <span class="fw-bold text-dark">#<?= esc($ord['invoice_no']) ?></span><br>
                                    <small class="text-muted"><?= date('d/m/Y H:i', strtotime($ord['created_at'])) ?></small>
                                </td>
                                <td>
                                    <div class="fw-semibold"><?= esc($ord['customer_name']) ?></div>
                                    <small class="text-muted"><i class="fa-brands fa-whatsapp text-success me-1"></i> <?= esc($ord['customer_phone']) ?></small>
                                </td>
                                <td>
                                    <?php 
                                        $typeBadge = [
                                            'dine_in'  => '<span class="badge bg-primary bg-opacity-10 text-primary">Dine-In (Meja)</span>',
                                            'takeaway' => '<span class="badge bg-info bg-opacity-10 text-info">Takeaway (Bungkus)</span>',
                                            'delivery' => '<span class="badge bg-warning bg-opacity-10 text-dark">Delivery (Antar)</span>',
                                        ];
                                        echo $typeBadge[$ord['order_type']] ?? esc($ord['order_type']);
                                    ?>
                                </td>
                                <td>
                                    <span class="fw-bold text-dark">Rp <?= number_format($ord['grand_total'], 0, ',', '.') ?></span><br>
                                    <small class="text-muted"><?= $ord['total_items'] ?> item</small>
                                </td>
                                <td>
                                    <?php if ($ord['payment_status'] === 'verified'): ?>
                                        <span class="badge bg-success bg-opacity-10 text-success"><i class="fa-solid fa-check-double me-1"></i> Lunas</span>
                                    <?php elseif ($ord['payment_status'] === 'paid'): ?>
                                        <span class="badge bg-info bg-opacity-10 text-info"><i class="fa-solid fa-image me-1"></i> Bukti Masuk</span>
                                    <?php else: ?>
                                        <span class="badge bg-danger bg-opacity-10 text-danger"><i class="fa-solid fa-clock me-1"></i> Belum Bayar</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php
                                        $statusMap = [
                                            'pending'   => '<span class="badge bg-secondary">Menunggu</span>',
                                            'confirmed' => '<span class="badge bg-primary">Dikonfirmasi</span>',
                                            'cooking'   => '<span class="badge bg-warning text-dark">Dimasak 🍳</span>',
                                            'ready'     => '<span class="badge bg-info text-dark">Siap Diambil ✨</span>',
                                            'delivered' => '<span class="badge bg-success">Selesai 🎉</span>',
                                            'cancelled' => '<span class="badge bg-danger">Batal</span>',
                                        ];
                                        echo $statusMap[$ord['order_status']] ?? esc($ord['order_status']);
                                    ?>
                                </td>
                                <td class="text-end pe-4">
                                    <a href="<?= site_url('admin/orders') ?>" class="btn btn-sm btn-light border rounded-pill px-3">
                                        Detail
                                    </a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?= $this->endSection() ?>
