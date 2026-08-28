<?= $this->extend('admin/layout/main') ?>

<?= $this->section('content') ?>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
        <h5 class="fw-bold mb-1">Daftar Semua Pesanan F&B</h5>
        <p class="text-muted small mb-0">Kelola status pesanan dan kirim notifikasi WhatsApp otomatis ke pembeli dalam 1 klik.</p>
    </div>

    <!-- Filter Buttons -->
    <div class="d-flex flex-wrap gap-2">
        <a href="<?= site_url('admin/orders?status=all') ?>" class="btn btn-sm rounded-pill <?= ($statusFilter === 'all') ? 'btn-success' : 'btn-light border' ?>">Semua</a>
        <a href="<?= site_url('admin/orders?status=pending') ?>" class="btn btn-sm rounded-pill <?= ($statusFilter === 'pending') ? 'btn-warning text-dark fw-bold' : 'btn-light border' ?>">Pending (Menunggu)</a>
        <a href="<?= site_url('admin/orders?status=cooking') ?>" class="btn btn-sm rounded-pill <?= ($statusFilter === 'cooking') ? 'btn-primary' : 'btn-light border' ?>">Sedang Dimasak</a>
        <a href="<?= site_url('admin/orders?status=ready') ?>" class="btn btn-sm rounded-pill <?= ($statusFilter === 'ready') ? 'btn-info' : 'btn-light border' ?>">Siap</a>
        <a href="<?= site_url('admin/orders?status=delivered') ?>" class="btn btn-sm rounded-pill <?= ($statusFilter === 'delivered') ? 'btn-success' : 'btn-light border' ?>">Selesai</a>
    </div>
</div>

<!-- Orders Table -->
<div class="card card-custom border-0 mb-4">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="ps-4">No. Invoice & Waktu</th>
                        <th>Pelanggan</th>
                        <th>Tipe Order</th>
                        <th>Total Tagihan</th>
                        <th>Status Bayar</th>
                        <th>Status Pesanan</th>
                        <th class="text-end pe-4">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($orders)): ?>
                        <tr>
                            <td colspan="7" class="text-center py-5 text-muted">
                                <i class="fa-solid fa-clipboard-list fa-3x mb-3 text-secondary opacity-50 d-block"></i>
                                Tidak ada pesanan dengan filter ini.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($orders as $ord): ?>
                            <tr>
                                <td class="ps-4">
                                    <span class="fw-bold text-dark">#<?= esc($ord['invoice_no']) ?></span><br>
                                    <small class="text-muted"><?= date('d/m/Y H:i', strtotime($ord['created_at'])) ?> WIB</small>
                                </td>
                                <td>
                                    <div class="fw-semibold"><?= esc($ord['customer_name']) ?></div>
                                    <small class="text-muted"><i class="fa-brands fa-whatsapp text-success me-1"></i> <?= esc($ord['customer_phone']) ?></small>
                                    <br><small class="text-secondary">📍 <?= esc(!empty($ord['delivery_address']) ? mb_strimwidth($ord['delivery_address'], 0, 35, '...') : '-') ?></small>
                                </td>
                                <td>
                                    <?php 
                                        $typeBadge = [
                                            'dine_in'  => '<span class="badge bg-primary bg-opacity-10 text-primary">Dine-In</span>',
                                            'takeaway' => '<span class="badge bg-info bg-opacity-10 text-info">Takeaway</span>',
                                            'delivery' => '<span class="badge bg-warning bg-opacity-10 text-dark">Delivery</span>',
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
                                        <span class="badge bg-success bg-opacity-10 text-success"><i class="fa-solid fa-check-double me-1"></i> Terverifikasi</span>
                                    <?php elseif ($ord['payment_status'] === 'paid'): ?>
                                        <span class="badge bg-info bg-opacity-10 text-info"><i class="fa-solid fa-image me-1"></i> Bukti Terkirim</span>
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
                                            'ready'     => '<span class="badge bg-info text-dark">Siap ✨</span>',
                                            'delivered' => '<span class="badge bg-success">Selesai 🎉</span>',
                                            'cancelled' => '<span class="badge bg-danger">Batal ❌</span>',
                                        ];
                                        echo $statusMap[$ord['order_status']] ?? esc($ord['order_status']);
                                    ?>
                                </td>
                                <td class="text-end pe-4">
                                    <button class="btn btn-sm btn-outline-success rounded-pill px-3 me-1" onclick="openDetailModal(<?= $ord['id'] ?>)">
                                        <i class="fa-solid fa-eye me-1"></i> Detail
                                    </button>
                                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="openUpdateModal(<?= $ord['id'] ?>, '<?= $ord['invoice_no'] ?>', '<?= $ord['order_status'] ?>', '<?= $ord['payment_status'] ?>')">
                                        <i class="fa-solid fa-pen-to-square me-1"></i> Update
                                    </button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Modal Detail Order -->
<div class="modal fade" id="orderDetailModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-bottom px-4 py-3">
                <h5 class="modal-title fw-bold" id="detailModalTitle">Detail Pesanan</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body px-4 py-3" id="detailModalBody">
                <div class="text-center py-4">
                    <div class="spinner-border text-success" role="status"></div>
                </div>
            </div>
            <div class="modal-footer border-top px-4 py-3">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Tutup</button>
            </div>
        </div>
    </div>
</div>

<!-- Modal Update Status -->
<div class="modal fade" id="updateStatusModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-bottom px-4 py-3">
                <h5 class="modal-title fw-bold">Update Status Pesanan</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form action="<?= site_url('admin/orders/update-status') ?>" method="POST">
                <?= csrf_field() ?>
                <input type="hidden" name="order_id" id="updateOrderId">
                <div class="modal-body px-4 py-3">
                    <div class="mb-3">
                        <label class="form-label small fw-bold">No. Invoice</label>
                        <input type="text" id="updateInvoiceDisplay" class="form-control bg-light" readonly>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-bold">Status Pesanan</label>
                        <select name="order_status" id="updateOrderStatus" class="form-select">
                            <option value="pending">Menunggu Konfirmasi (Pending)</option>
                            <option value="confirmed">Pesanan Dikonfirmasi</option>
                            <option value="cooking">Sedang Dimasak di Dapur 🍳</option>
                            <option value="ready">Siap Diambil / Diantar ✨</option>
                            <option value="delivered">Selesai / Sudah Diterima 🎉</option>
                            <option value="cancelled">Dibatalkan ❌</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small fw-bold">Status Pembayaran</label>
                        <select name="payment_status" id="updatePaymentStatus" class="form-select">
                            <option value="unpaid">Belum Bayar (Unpaid)</option>
                            <option value="paid">Bukti Transfer Diterima (Menunggu Verifikasi)</option>
                            <option value="verified">Lunas / Terverifikasi (Verified)</option>
                        </select>
                    </div>

                    <div class="form-check form-switch p-3 bg-light rounded-3 mt-3">
                        <input class="form-check-input" type="checkbox" name="send_wa_notif" id="sendWaNotif" value="1" checked>
                        <label class="form-check-label small fw-bold ms-2" for="sendWaNotif">
                            <i class="fa-brands fa-whatsapp text-success me-1"></i> Kirim Notifikasi WhatsApp Otomatis ke Pembeli
                        </label>
                        <div class="form-text small text-muted">Bot akan langsung mengirimkan status terbaru ke nomor WA pembeli.</div>
                    </div>
                </div>
                <div class="modal-footer border-top px-4 py-3">
                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Batal</button>
                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-semibold">
                        <i class="fa-solid fa-floppy-disk me-1"></i> Simpan Perubahan
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script>
    function openDetailModal(id) {
        const modal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
        document.getElementById('detailModalBody').innerHTML = '<div class="text-center py-4"><div class="spinner-border text-success" role="status"></div></div>';
        modal.show();

        fetch(`<?= site_url('admin/orders/detail/') ?>${id}`)
            .then(res => res.json())
            .then(res => {
                if (res.status && res.data) {
                    const d = res.data;
                    document.getElementById('detailModalTitle').innerText = `Detail Pesanan #${d.invoice_no}`;
                    
                    let itemsHtml = '';
                    if (d.items && d.items.length > 0) {
                        d.items.forEach(it => {
                            itemsHtml += `
                                <tr>
                                    <td><strong>[${it.menu_code}]</strong> ${it.menu_name}</td>
                                    <td>Rp ${Number(it.price).toLocaleString('id-ID')}</td>
                                    <td>${it.quantity}</td>
                                    <td class="text-end fw-bold">Rp ${Number(it.subtotal).toLocaleString('id-ID')}</td>
                                </tr>
                            `;
                        });
                    }

                    document.getElementById('detailModalBody').innerHTML = `
                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <div class="p-3 bg-light rounded-3">
                                    <small class="text-muted d-block mb-1">Informasi Pemesan</small>
                                    <h6 class="fw-bold mb-1">${d.customer_name}</h6>
                                    <p class="mb-1 small"><i class="fa-brands fa-whatsapp text-success me-1"></i> ${d.customer_phone}</p>
                                    <p class="mb-0 small text-muted">Tipe: <strong>${d.order_type.toUpperCase()}</strong></p>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="p-3 bg-light rounded-3">
                                    <small class="text-muted d-block mb-1">Tujuan / Alamat Pengiriman</small>
                                    <p class="mb-1 fw-semibold small">${d.delivery_address || '-'}</p>
                                    <small class="text-muted d-block">Catatan: <em>${d.notes || '-'}</em></small>
                                </div>
                            </div>
                        </div>

                        <div class="table-responsive mb-3">
                            <table class="table table-bordered align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>Menu</th>
                                        <th>Harga</th>
                                        <th>Jumlah</th>
                                        <th class="text-end">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <th colspan="3" class="text-end">Subtotal</th>
                                        <th class="text-end">Rp ${Number(d.subtotal).toLocaleString('id-ID')}</th>
                                    </tr>
                                    <tr>
                                        <th colspan="3" class="text-end">Ongkos Kirim</th>
                                        <th class="text-end">Rp ${Number(d.delivery_fee).toLocaleString('id-ID')}</th>
                                    </tr>
                                    <tr class="table-success">
                                        <th colspan="3" class="text-end">TOTAL TAGIHAN</th>
                                        <th class="text-end fs-6">Rp ${Number(d.grand_total).toLocaleString('id-ID')}</th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div class="p-3 bg-light rounded-3 d-flex align-items-center justify-content-between">
                            <div>
                                <small class="text-muted d-block">Status Pembayaran</small>
                                <span class="badge ${d.payment_status === 'verified' ? 'bg-success' : (d.payment_status === 'paid' ? 'bg-info' : 'bg-danger')}">
                                    ${d.payment_status.toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <small class="text-muted d-block">Status Pesanan</small>
                                <span class="badge bg-dark">${d.order_status.toUpperCase()}</span>
                            </div>
                        </div>
                    `;
                }
            })
            .catch(err => {
                document.getElementById('detailModalBody').innerHTML = '<div class="alert alert-danger">Gagal memuat data pesanan.</div>';
            });
    }

    function openUpdateModal(id, invoice, orderStatus, paymentStatus) {
        document.getElementById('updateOrderId').value = id;
        document.getElementById('updateInvoiceDisplay').value = '#' + invoice;
        document.getElementById('updateOrderStatus').value = orderStatus;
        document.getElementById('updatePaymentStatus').value = paymentStatus;
        new bootstrap.Modal(document.getElementById('updateStatusModal')).show();
    }
</script>
<?= $this->endSection() ?>
