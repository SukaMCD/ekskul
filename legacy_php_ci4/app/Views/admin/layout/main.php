<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= esc($title ?? 'Admin Dashboard') ?> | Bot WA UMKM</title>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome 6 -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
    <!-- Custom Modern Styling -->
    <style>
        :root {
            --primary: #25D366;
            --primary-dark: #128C7E;
            --primary-navy: #075E54;
            --dark-surface: #0f172a;
            --sidebar-bg: #1e293b;
            --sidebar-hover: #334155;
            --bg-body: #f8fafc;
            --card-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            --border-color: #e2e8f0;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg-body);
            color: #334155;
            min-height: 100vh;
        }

        /* Sidebar Styling */
        .sidebar {
            width: 260px;
            background: var(--sidebar-bg);
            min-height: 100vh;
            position: fixed;
            top: 0;
            left: 0;
            z-index: 1000;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-right: 1px solid rgba(255,255,255,0.08);
        }

        .sidebar-brand {
            padding: 24px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            color: white;
            text-decoration: none;
        }

        .brand-icon {
            width: 42px;
            height: 42px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            color: white;
            box-shadow: 0 4px 12px rgba(37, 211, 102, 0.35);
        }

        .sidebar-menu {
            padding: 20px 12px;
            list-style: none;
            margin: 0;
        }

        .sidebar-item {
            margin-bottom: 6px;
        }

        .sidebar-link {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            color: #94a3b8;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 500;
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .sidebar-link i {
            font-size: 18px;
            width: 24px;
            text-align: center;
            transition: transform 0.2s;
        }

        .sidebar-link:hover {
            color: #ffffff;
            background: var(--sidebar-hover);
        }

        .sidebar-link:hover i {
            transform: scale(1.15);
        }

        .sidebar-link.active {
            color: #ffffff;
            background: linear-gradient(135deg, var(--primary-navy), var(--primary-dark));
            box-shadow: 0 4px 15px rgba(18, 140, 126, 0.3);
            font-weight: 600;
        }

        .sidebar-link.active i {
            color: var(--primary);
        }

        /* Main Content */
        .main-wrapper {
            margin-left: 260px;
            padding: 28px 32px;
            min-height: 100vh;
        }

        /* Topbar */
        .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 28px;
            background: #ffffff;
            padding: 16px 24px;
            border-radius: 16px;
            box-shadow: var(--card-shadow);
            border: 1px solid var(--border-color);
        }

        /* Cards */
        .card-custom {
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid var(--border-color);
            box-shadow: var(--card-shadow);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .stat-card {
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .stat-icon-wrapper {
            width: 56px;
            height: 56px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }

        .badge-status {
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        /* WA Pill */
        .pill-whatsapp {
            background: rgba(37, 211, 102, 0.12);
            color: #075E54;
            border: 1px solid rgba(37, 211, 102, 0.3);
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Responsive */
        @media (max-width: 992px) {
            .sidebar {
                left: -260px;
            }
            .sidebar.show {
                left: 0;
            }
            .main-wrapper {
                margin-left: 0;
                padding: 16px;
            }
        }
    </style>
</head>
<body>

    <!-- Sidebar -->
    <aside class="sidebar">
        <a href="<?= site_url('admin/dashboard') ?>" class="sidebar-brand">
            <div class="brand-icon">
                <i class="fa-brands fa-whatsapp"></i>
            </div>
            <div>
                <h6 class="mb-0 fw-bold text-white">UMKM Bot WA</h6>
                <small class="text-secondary" style="font-size: 11px;">Resto & FnB Automation</small>
            </div>
        </a>

        <ul class="sidebar-menu">
            <li class="sidebar-item">
                <a href="<?= site_url('admin/dashboard') ?>" class="sidebar-link <?= (current_url() == site_url('admin/dashboard')) ? 'active' : '' ?>">
                    <i class="fa-solid fa-chart-pie"></i>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="sidebar-item">
                <a href="<?= site_url('admin/orders') ?>" class="sidebar-link <?= (str_contains(current_url(), 'admin/orders')) ? 'active' : '' ?>">
                    <i class="fa-solid fa-receipt"></i>
                    <span>Pesanan Masuk</span>
                </a>
            </li>
            <li class="sidebar-item">
                <a href="<?= site_url('admin/menu') ?>" class="sidebar-link <?= (str_contains(current_url(), 'admin/menu')) ? 'active' : '' ?>">
                    <i class="fa-solid fa-utensils"></i>
                    <span>Katalog Menu</span>
                </a>
            </li>
            <li class="sidebar-item">
                <a href="<?= site_url('admin/settings') ?>" class="sidebar-link <?= (str_contains(current_url(), 'admin/settings')) ? 'active' : '' ?>">
                    <i class="fa-solid fa-sliders"></i>
                    <span>Pengaturan Wablas</span>
                </a>
            </li>

            <li class="sidebar-item mt-4 pt-3 border-top border-secondary border-opacity-25">
                <a href="<?= site_url('admin/logout') ?>" class="sidebar-link text-danger">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i>
                    <span>Keluar (Logout)</span>
                </a>
            </li>
        </ul>
    </aside>

    <!-- Main Wrapper -->
    <main class="main-wrapper">
        <!-- Topbar -->
        <header class="topbar">
            <div class="d-flex align-items-center gap-3">
                <button class="btn btn-light d-lg-none" id="sidebarToggle">
                    <i class="fa-solid fa-bars"></i>
                </button>
                <div>
                    <h5 class="mb-0 fw-bold"><?= esc($title ?? 'Dashboard') ?></h5>
                    <small class="text-muted">Sistem Otomasi WhatsApp Bot Wablas UMKM</small>
                </div>
            </div>

            <div class="d-flex align-items-center gap-3">
                <span class="pill-whatsapp">
                    <i class="fa-solid fa-circle text-success" style="font-size: 8px;"></i>
                    Gateway Wablas Siap
                </span>
                <div class="dropdown">
                    <button class="btn btn-outline-secondary btn-sm rounded-pill px-3 dropdown-toggle" data-bs-toggle="dropdown">
                        <i class="fa-solid fa-user-circle me-1"></i> <?= esc(session()->get('user_name') ?? 'Admin') ?>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        <li><a class="dropdown-item text-danger" href="<?= site_url('admin/logout') ?>"><i class="fa-solid fa-sign-out-alt me-2"></i> Logout</a></li>
                    </ul>
                </div>
            </div>
        </header>

        <!-- Flash Messages -->
        <?php if (session()->getFlashdata('success')): ?>
            <div class="alert alert-success alert-dismissible fade show border-0 shadow-sm rounded-4 mb-4" role="alert">
                <i class="fa-solid fa-circle-check me-2"></i> <?= session()->getFlashdata('success') ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        <?php endif; ?>

        <?php if (session()->getFlashdata('error')): ?>
            <div class="alert alert-danger alert-dismissible fade show border-0 shadow-sm rounded-4 mb-4" role="alert">
                <i class="fa-solid fa-triangle-exclamation me-2"></i> <?= session()->getFlashdata('error') ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        <?php endif; ?>

        <!-- Page Content -->
        <?= $this->renderSection('content') ?>
    </main>

    <!-- Bootstrap 5 JS Bundle -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        document.getElementById('sidebarToggle')?.addEventListener('click', function() {
            document.querySelector('.sidebar').classList.toggle('show');
        });
    </script>
    <?= $this->renderSection('scripts') ?>
</body>
</html>
