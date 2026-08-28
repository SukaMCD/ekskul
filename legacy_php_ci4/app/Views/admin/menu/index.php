<?= $this->extend('admin/layout/main') ?>

<?= $this->section('content') ?>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
    <div>
        <h5 class="fw-bold mb-1">Katalog Menu Makanan & Minuman</h5>
        <p class="text-muted small mb-0">Kelola harga, kode menu (untuk pemesanan bot WA), dan ketersediaan stok.</p>
    </div>

    <button class="btn btn-success rounded-pill px-4" onclick="openAddMenuModal()">
        <i class="fa-solid fa-plus me-1"></i> Tambah Menu Baru
    </button>
</div>

<!-- Menu List Table -->
<div class="card card-custom border-0 mb-4">
    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="ps-4">Kode Bot</th>
                        <th>Nama Menu & Deskripsi</th>
                        <th>Kategori</th>
                        <th>Harga</th>
                        <th>Status Stok</th>
                        <th class="text-end pe-4">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($menus)): ?>
                        <tr>
                            <td colspan="6" class="text-center py-5 text-muted">
                                Belum ada data menu. Silakan klik tombol <strong>Tambah Menu Baru</strong>.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($menus as $m): ?>
                            <tr>
                                <td class="ps-4">
                                    <span class="badge bg-dark px-3 py-2 fs-6 fw-bold"><?= esc($m['code']) ?></span>
                                </td>
                                <td>
                                    <div class="fw-bold text-dark"><?= esc($m['name']) ?></div>
                                    <small class="text-muted"><?= esc($m['description'] ?: 'Tidak ada deskripsi') ?></small>
                                </td>
                                <td>
                                    <span class="badge bg-secondary bg-opacity-10 text-secondary border">
                                        <?= esc($m['category_name'] ?? 'Umum') ?>
                                    </span>
                                </td>
                                <td>
                                    <span class="fw-bold text-success fs-6">Rp <?= number_format($m['price'], 0, ',', '.') ?></span>
                                </td>
                                <td>
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" role="switch" id="switch_<?= $m['id'] ?>" <?= (!empty($m['is_available'])) ? 'checked' : '' ?> onchange="toggleMenuAvailability(<?= $m['id'] ?>, this)">
                                        <label class="form-check-label small fw-semibold" for="switch_<?= $m['id'] ?>" id="label_<?= $m['id'] ?>">
                                            <?= (!empty($m['is_available'])) ? 'Tersedia' : 'Habis' ?>
                                        </label>
                                    </div>
                                </td>
                                <td class="text-end pe-4">
                                    <button class="btn btn-sm btn-light border rounded-pill px-3 me-1" onclick='openEditMenuModal(<?= json_encode($m) ?>)'>
                                        <i class="fa-solid fa-pen me-1"></i> Edit
                                    </button>
                                    <a href="<?= site_url('admin/menu/delete/' . $m['id']) ?>" class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="return confirm('Apakah Anda yakin ingin menghapus menu ini?')">
                                        <i class="fa-solid fa-trash"></i>
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

<!-- Modal Add / Edit Menu -->
<div class="modal fade" id="menuModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-bottom px-4 py-3">
                <h5 class="modal-title fw-bold" id="menuModalTitle">Tambah Menu Baru</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form action="<?= site_url('admin/menu/save') ?>" method="POST">
                <?= csrf_field() ?>
                <input type="hidden" name="id" id="menuId">
                <div class="modal-body px-4 py-3">
                    <div class="row g-3">
                        <div class="col-md-5">
                            <label class="form-label small fw-bold">Kode Menu (Untuk Bot WA) <span class="text-danger">*</span></label>
                            <input type="text" name="code" id="menuCode" class="form-control text-uppercase" placeholder="Misal: M5, D3" required>
                            <div class="form-text small">Kode singkat agar pembeli mudah mengetik di WA.</div>
                        </div>
                        <div class="col-md-7">
                            <label class="form-label small fw-bold">Kategori Menu <span class="text-danger">*</span></label>
                            <select name="category_id" id="menuCategoryId" class="form-select" required>
                                <?php foreach ($categories as $cat): ?>
                                    <option value="<?= $cat['id'] ?>"><?= esc($cat['name']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <div class="col-12">
                            <label class="form-label small fw-bold">Nama Menu <span class="text-danger">*</span></label>
                            <input type="text" name="name" id="menuName" class="form-control" placeholder="Contoh: Ayam Bakar Madu" required>
                        </div>

                        <div class="col-12">
                            <label class="form-label small fw-bold">Harga (Rp) <span class="text-danger">*</span></label>
                            <input type="number" name="price" id="menuPrice" class="form-control" placeholder="25000" min="0" step="500" required>
                        </div>

                        <div class="col-12">
                            <label class="form-label small fw-bold">Deskripsi Singkat</label>
                            <textarea name="description" id="menuDescription" class="form-control" rows="2" placeholder="Komposisi atau catatan menu"></textarea>
                        </div>

                        <div class="col-12">
                            <div class="form-check form-switch p-2 bg-light rounded-3">
                                <input class="form-check-input" type="checkbox" name="is_available" id="menuAvailable" value="1" checked>
                                <label class="form-check-label small fw-bold ms-2" for="menuAvailable">Status Menu Tersedia</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer border-top px-4 py-3">
                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Batal</button>
                    <button type="submit" class="btn btn-success rounded-pill px-4 fw-semibold">
                        <i class="fa-solid fa-floppy-disk me-1"></i> Simpan Menu
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script>
    const menuModal = new bootstrap.Modal(document.getElementById('menuModal'));

    function openAddMenuModal() {
        document.getElementById('menuModalTitle').innerText = 'Tambah Menu Baru';
        document.getElementById('menuId').value = '';
        document.getElementById('menuCode').value = '';
        document.getElementById('menuName').value = '';
        document.getElementById('menuPrice').value = '';
        document.getElementById('menuDescription').value = '';
        document.getElementById('menuAvailable').checked = true;
        menuModal.show();
    }

    function openEditMenuModal(data) {
        document.getElementById('menuModalTitle').innerText = 'Edit Menu ' + data.name;
        document.getElementById('menuId').value = data.id;
        document.getElementById('menuCode').value = data.code;
        document.getElementById('menuCategoryId').value = data.category_id;
        document.getElementById('menuName').value = data.name;
        document.getElementById('menuPrice').value = data.price;
        document.getElementById('menuDescription').value = data.description || '';
        document.getElementById('menuAvailable').checked = (data.is_available == 1);
        menuModal.show();
    }

    function toggleMenuAvailability(id, el) {
        const label = document.getElementById('label_' + id);
        fetch(`<?= site_url('admin/menu/toggle/') ?>${id}`, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.status) {
                label.innerText = data.is_available ? 'Tersedia' : 'Habis';
            }
        })
        .catch(err => {
            el.checked = !el.checked;
            alert('Gagal memperbarui status');
        });
    }
</script>
<?= $this->endSection() ?>
