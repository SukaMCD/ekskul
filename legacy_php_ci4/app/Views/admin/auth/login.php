<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Admin | Bot WhatsApp UMKM</title>
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- Bootstrap 5 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: linear-gradient(135deg, #075E54 0%, #128C7E 50%, #25D366 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .login-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            max-width: 440px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .logo-box {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #25D366, #128C7E);
            border-radius: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            color: white;
            margin: 0 auto 20px;
            box-shadow: 0 8px 20px rgba(37, 211, 102, 0.4);
        }

        .form-control {
            border-radius: 12px;
            padding: 12px 16px;
            border: 1.5px solid #e2e8f0;
            font-size: 14px;
            transition: all 0.2s;
        }

        .form-control:focus {
            border-color: #128C7E;
            box-shadow: 0 0 0 4px rgba(18, 140, 126, 0.15);
        }

        .btn-login {
            background: linear-gradient(135deg, #075E54, #128C7E);
            color: white;
            font-weight: 600;
            padding: 12px;
            border-radius: 12px;
            border: none;
            width: 100%;
            font-size: 15px;
            box-shadow: 0 4px 15px rgba(18, 140, 126, 0.35);
            transition: all 0.2s;
        }

        .btn-login:hover {
            background: linear-gradient(135deg, #128C7E, #25D366);
            transform: translateY(-1px);
            color: white;
        }
    </style>
</head>
<body>

    <div class="login-card">
        <div class="text-center">
            <div class="logo-box">
                <i class="fa-brands fa-whatsapp"></i>
            </div>
            <h4 class="fw-bold mb-1">Admin Resto UMKM</h4>
            <p class="text-muted small mb-4">Sistem Otomasi WhatsApp Bot Wablas</p>
        </div>

        <?php if (session()->getFlashdata('error')): ?>
            <div class="alert alert-danger border-0 rounded-3 py-2 px-3 small mb-3">
                <i class="fa-solid fa-circle-exclamation me-1"></i> <?= session()->getFlashdata('error') ?>
            </div>
        <?php endif; ?>

        <form action="<?= site_url('admin/do-login') ?>" method="POST">
            <?= csrf_field() ?>
            <div class="mb-3">
                <label class="form-label small fw-semibold text-muted">Username</label>
                <div class="input-group">
                    <input type="text" name="username" class="form-control" placeholder="Masukkan username" required autofocus value="admin">
                </div>
            </div>

            <div class="mb-4">
                <label class="form-label small fw-semibold text-muted">Password</label>
                <div class="input-group">
                    <input type="password" name="password" class="form-control" placeholder="Masukkan password" required value="admin123">
                </div>
                <div class="form-text small mt-1">Default credential: <code>admin</code> / <code>admin123</code></div>
            </div>

            <button type="submit" class="btn btn-login">
                <i class="fa-solid fa-right-to-bracket me-2"></i> Masuk Dashboard
            </button>
        </form>

        <div class="text-center mt-4">
            <small class="text-muted">Proyek Otomasi UMKM F&B &copy; <?= date('Y') ?></small>
        </div>
    </div>

</body>
</html>
