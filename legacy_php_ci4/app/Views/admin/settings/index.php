<?= $this->extend('admin/layout/main') ?>

<?= $this->section('content') ?>

<div class="row g-4">
    <!-- Webhook Integration Card -->
    <div class="col-12">
        <div class="card card-custom border-0" style="background: #f0fdf4; border: 1.5px dashed #22c55e !important;">
            <div class="card-body p-4">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
                    <div>
                        <span class="badge bg-success px-3 py-2 rounded-pill fw-bold mb-2">
                            <i class="fa-solid fa-link me-1"></i> Webhook URL Wablas Anda
                        </span>
                        <h6 class="fw-bold mb-1">Pasang URL ini di Pengaturan Webhook Dashboard Wablas:</h6>
                        <code class="fs-6 fw-bold text-success bg-white px-3 py-2 rounded-3 border d-inline-block mt-1">
                            <?= esc($webhookUrl) ?>
                        </code>
                    </div>
                    <div class="text-muted small" style="max-width: 420px;">
                        <i class="fa-solid fa-circle-info text-success me-1"></i>
                        Jika menguji secara lokal di Laragon, jalankan <strong>Ngrok</strong> atau <strong>Cloudflare Tunnel</strong> untuk menghubungkan domain publik ke localhost: <br>
                        <code>ngrok http 80</code> lalu ganti host dengan domain ngrok.
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Config Form -->
    <div class="col-lg-7">
        <div class="card card-custom border-0">
            <div class="card-header bg-white py-3 px-4 border-bottom">
                <h6 class="fw-bold mb-0"><i class="fa-solid fa-sliders text-success me-2"></i> Konfigurasi Bot WhatsApp & Profil UMKM</h6>
            </div>
            <form action="<?= site_url('admin/settings/save') ?>" method="POST">
                <?= csrf_field() ?>
                <div class="card-body p-4">
                    <!-- Bot Status -->
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <div class="form-check form-switch p-3 bg-light rounded-4 h-100">
                                <input class="form-check-input" type="checkbox" name="bot_active" id="botActive" value="1" <?= (($configs['bot_active'] ?? '1') === '1') ? 'checked' : '' ?>>
                                <label class="form-check-label fw-bold ms-2" for="botActive">
                                    Status Bot WhatsApp (Online)
                                </label>
                                <div class="form-text small text-muted">Aktifkan untuk membalas otomatis.</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="form-check form-switch p-3 bg-light rounded-4 h-100">
                                <input class="form-check-input" type="checkbox" name="whitelist_mode" id="whitelistMode" value="1" <?= (($configs['whitelist_mode'] ?? '0') === '1') ? 'checked' : '' ?> onchange="document.getElementById('whitelistBox').style.display = this.checked ? 'block' : 'none'">
                                <label class="form-check-label fw-bold ms-2 text-primary" for="whitelistMode">
                                    <i class="fa-solid fa-shield-halved me-1"></i> Mode Whitelist (Trial)
                                </label>
                                <div class="form-text small text-muted">Hanya membalas nomor terdaftar.</div>
                            </div>
                        </div>
                    </div>

                    <!-- Whitelist Numbers Box -->
                    <div class="p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-4 mb-4" id="whitelistBox" style="display: <?= (($configs['whitelist_mode'] ?? '0') === '1') ? 'block' : 'none' ?>;">
                        <label class="form-label small fw-bold text-primary mb-1"><i class="fa-solid fa-list-check me-1"></i> Daftar Nomor HP Whitelist</label>
                        <textarea name="whitelist_numbers" class="form-control font-monospace small" rows="2" placeholder="Contoh: 081234567890, 08987654321, 628129999888"><?= esc($configs['whitelist_numbers'] ?? '') ?></textarea>
                        <div class="form-text small text-primary opacity-75 mt-1">Pisahkan tiap nomor dengan koma atau baris baru. Admin dapat menambah lewat WA dengan ketik: <code>whitelist add 08xxx</code></div>
                    </div>

                    <h6 class="fw-bold text-success mb-3"><i class="fa-brands fa-whatsapp me-1"></i> Akun Wablas Gateway</h6>
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Domain Server Wablas</label>
                            <input type="text" name="wablas_url" class="form-control" value="<?= esc($configs['wablas_url'] ?? 'https://sby.wablas.com') ?>" placeholder="https://sby.wablas.com" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Nomor WhatsApp Admin / Dapur</label>
                            <input type="text" name="admin_phone" class="form-control" value="<?= esc($configs['admin_phone'] ?? '') ?>" placeholder="Contoh: 081234567890" required>
                            <div class="form-text small">Nomor ini menerima notifikasi pesanan masuk otomatis.</div>
                        </div>
                        <div class="col-md-7">
                            <label class="form-label small fw-bold">Wablas API Token <span class="text-danger">*</span></label>
                            <input type="text" name="wablas_token" class="form-control font-monospace" value="<?= esc($configs['wablas_token'] ?? '') ?>" placeholder="Masukkan token API Wablas device Anda" required>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small fw-bold">Wablas Secret Key <small class="text-muted">(Jika ada)</small></label>
                            <input type="text" name="wablas_secret" class="form-control font-monospace" value="<?= esc($configs['wablas_secret'] ?? '') ?>" placeholder="Secret key dari device Wablas">
                            <div class="form-text small">Diisi jika Wablas meminta Secret Key.</div>
                        </div>
                    </div>

                    <h6 class="fw-bold text-success mb-3"><i class="fa-solid fa-store me-1"></i> Profil Restoran & Rekening</h6>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Nama Toko / Usaha</label>
                            <input type="text" name="store_name" class="form-control" value="<?= esc($configs['store_name'] ?? 'Resto Sedap Rasa') ?>" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-bold">Jam Operasional</label>
                            <input type="text" name="store_hours" class="form-control" value="<?= esc($configs['store_hours'] ?? '10.00 - 22.00 WIB') ?>">
                        </div>
                        <div class="col-12">
                            <label class="form-label small fw-bold">Alamat Lengkap Toko</label>
                            <input type="text" name="store_address" class="form-control" value="<?= esc($configs['store_address'] ?? 'Jl. Boulevard Raya No. 88') ?>">
                        </div>
                        <div class="col-12">
                            <label class="form-label small fw-bold">Link Google Maps</label>
                            <input type="text" name="store_gmaps" class="form-control" value="<?= esc($configs['store_gmaps'] ?? '') ?>" placeholder="https://maps.google.com/...">
                        </div>
                        <div class="col-12">
                            <label class="form-label small fw-bold">Informasi Rekening Pembayaran & QRIS</label>
                            <textarea name="bank_info" class="form-control font-monospace" rows="3"><?= esc($configs['bank_info'] ?? '') ?></textarea>
                            <div class="form-text small">Pesan ini dikirimkan ke pembeli setelah membuat pesanan baru.</div>
                        </div>
                    </div>
                </div>
                <div class="card-footer bg-white px-4 py-3 border-top text-end">
                    <button type="submit" class="btn btn-success rounded-pill px-5 fw-semibold">
                        <i class="fa-solid fa-floppy-disk me-1"></i> Simpan Konfigurasi
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Testing & Webhook Simulator Tools -->
    <div class="col-lg-5">
        <!-- Live Test Send Message -->
        <div class="card card-custom border-0 mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom">
                <h6 class="fw-bold mb-0"><i class="fa-solid fa-paper-plane text-primary me-2"></i> Uji Coba Kirim Pesan WA (Wablas)</h6>
            </div>
            <div class="card-body p-4">
                <div class="mb-3">
                    <label class="form-label small fw-bold">Nomor HP Penerima</label>
                    <input type="text" id="testPhone" class="form-control" placeholder="Contoh: 081234567890">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Isi Pesan Uji Coba</label>
                    <textarea id="testMsg" class="form-control" rows="2" placeholder="Halo! Ini pesan tes otomatis dari Bot Wablas UMKM."></textarea>
                </div>
                <button class="btn btn-primary rounded-pill w-100 fw-semibold" id="btnTestSend" onclick="sendTestMessage()">
                    <i class="fa-solid fa-paper-plane me-1"></i> Kirim Pesan Sekarang
                </button>
                <div id="testSendResult" class="mt-3 small"></div>
            </div>
        </div>

        <!-- Interactive Webhook Chat Simulator -->
        <div class="card card-custom border-0">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex align-items-center justify-content-between">
                <h6 class="fw-bold mb-0"><i class="fa-solid fa-comments text-success me-2"></i> Simulator Webhook Chat</h6>
                <span class="badge bg-light text-muted border">Dev Tool</span>
            </div>
            <div class="card-body p-4">
                <p class="small text-muted mb-3">Simulasikan percakapan pelanggan dengan bot tanpa perlu kirim WA sungguhan!</p>
                
                <div class="mb-3">
                    <label class="form-label small fw-bold">Nomor HP Simulasi</label>
                    <input type="text" id="simPhone" class="form-control" value="081987654321">
                </div>

                <!-- Quick Buttons -->
                <div class="d-flex flex-wrap gap-1 mb-3">
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('MENU')">Ketik MENU</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('ORDER M1 2, D1 1')">Pesan M1 2, D1 1</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('3')">Pilih Delivery (3)</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('Budi Santoso - Jl. Mawar No 10')">Nama & Alamat</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('-')">Catatan (-)</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('YA')">Konfirmasi (YA)</button>
                    <button class="btn btn-sm btn-light border rounded-pill" onclick="quickSim('STATUS')">Cek STATUS</button>
                    <button class="btn btn-sm btn-light border rounded-pill text-danger" onclick="quickSim('BATAL')">Ketik BATAL</button>
                </div>

                <div class="input-group mb-3">
                    <input type="text" id="simText" class="form-control" placeholder="Ketik pesan yang ingin dikirim..." onkeypress="if(event.key==='Enter') executeSim()">
                    <button class="btn btn-success px-4" id="btnSim" onclick="executeSim()">Kirim</button>
                </div>

                <div class="p-3 bg-light rounded-3 border" style="min-height: 140px; max-height: 260px; overflow-y: auto;">
                    <small class="fw-bold text-muted d-block mb-1">Respon Bot WhatsApp:</small>
                    <div id="simReplyDisplay" class="font-monospace small text-dark" style="white-space: pre-wrap;">
                        (Ketik pesan atau klik tombol di atas untuk memulai simulasi)
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Webhook Logs Table -->
    <div class="col-12">
        <div class="card card-custom border-0 mb-4">
            <div class="card-header bg-white py-3 px-4 border-bottom">
                <h6 class="fw-bold mb-0"><i class="fa-solid fa-clock-rotate-left text-secondary me-2"></i> Riwayat Log Webhook & Pesan Masuk/Keluar</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive" style="max-height: 380px;">
                    <table class="table table-hover align-middle mb-0 small">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th class="ps-4">Waktu</th>
                                <th>Arah</th>
                                <th>Nomor HP</th>
                                <th>Tipe</th>
                                <th>Isi Pesan</th>
                                <th class="text-end pe-4">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($logs)): ?>
                                <tr>
                                    <td colspan="6" class="text-center py-4 text-muted">Belum ada catatan log aktivitas.</td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($logs as $lg): ?>
                                    <tr>
                                        <td class="ps-4 text-nowrap"><?= date('d/m/Y H:i:s', strtotime($lg['created_at'])) ?></td>
                                        <td>
                                            <?php if ($lg['direction'] === 'inbound'): ?>
                                                <span class="badge bg-primary bg-opacity-10 text-primary"><i class="fa-solid fa-arrow-down me-1"></i> Masuk</span>
                                            <?php else: ?>
                                                <span class="badge bg-success bg-opacity-10 text-success"><i class="fa-solid fa-arrow-up me-1"></i> Keluar</span>
                                            <?php endif; ?>
                                        </td>
                                        <td class="fw-semibold font-monospace"><?= esc($lg['phone']) ?></td>
                                        <td><span class="badge bg-light text-dark border"><?= esc($lg['message_type']) ?></span></td>
                                        <td><?= esc(!empty($lg['message_body']) ? mb_strimwidth($lg['message_body'], 0, 75, '...') : '-') ?></td>
                                        <td class="text-end pe-4">
                                            <span class="badge <?= ($lg['status'] === 'success' || $lg['status'] === 'received') ? 'bg-success' : 'bg-warning text-dark' ?>">
                                                <?= esc($lg['status']) ?>
                                            </span>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script>
    function sendTestMessage() {
        const phone   = document.getElementById('testPhone').value.trim();
        const msg     = document.getElementById('testMsg').value.trim();
        const wToken  = document.querySelector('input[name="wablas_token"]')?.value.trim() || '';
        const wSecret = document.querySelector('input[name="wablas_secret"]')?.value.trim() || '';
        const wUrl    = document.querySelector('input[name="wablas_url"]')?.value.trim() || '';
        const resEl   = document.getElementById('testSendResult');
        const btn     = document.getElementById('btnTestSend');

        if (!phone || !msg) {
            alert('Mohon isi nomor HP dan pesan uji coba');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Mengirim...';
        resEl.innerHTML = '';

        const formData = new FormData();
        formData.append('phone', phone);
        formData.append('message', msg);
        formData.append('wablas_token', wToken);
        formData.append('wablas_secret', wSecret);
        formData.append('wablas_url', wUrl);

        fetch('<?= site_url('admin/settings/test-send') ?>', {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(async res => {
            const data = await res.json().catch(() => null);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Kirim Pesan Sekarang';
            
            if (data && data.status) {
                resEl.innerHTML = `<div class="alert alert-success py-2 px-3 mb-0">✅ Berhasil! Pesan telah terkirim via Wablas.</div>`;
            } else if (data) {
                resEl.innerHTML = `<div class="alert alert-warning py-2 px-3 mb-0">⚠️ ${data.message || 'Gagal mengirim pesan.'}</div>`;
            } else {
                resEl.innerHTML = `<div class="alert alert-danger py-2 px-3 mb-0">❌ Respon server error (HTTP ${res.status}).</div>`;
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Kirim Pesan Sekarang';
            resEl.innerHTML = `<div class="alert alert-danger py-2 px-3 mb-0">❌ Terjadi kendala: ${err.message || 'Kesalahan jaringan'}</div>`;
        });
    }

    function quickSim(text) {
        document.getElementById('simText').value = text;
        executeSim();
    }

    function executeSim() {
        const phone = document.getElementById('simPhone').value.trim();
        const text  = document.getElementById('simText').value.trim();
        const display = document.getElementById('simReplyDisplay');
        const btn   = document.getElementById('btnSim');

        if (!text) return;

        btn.disabled = true;
        display.innerText = 'Sedang memproses webhook...';

        const formData = new FormData();
        formData.append('phone', phone);
        formData.append('text', text);

        fetch('<?= site_url('admin/settings/simulate') ?>', {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            if (data.status) {
                display.innerText = data.reply || '(Tidak ada balasan balikan)';
            } else {
                display.innerText = 'Error: ' + data.message;
            }
        })
        .catch(err => {
            btn.disabled = false;
            display.innerText = 'Gagal menghubungi controller Webhook.';
        });
    }
</script>
<?= $this->endSection() ?>
