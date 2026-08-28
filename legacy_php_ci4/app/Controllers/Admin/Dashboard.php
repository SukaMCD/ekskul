<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\MenuModel;
use App\Models\OrderModel;
use App\Models\BotConfigModel;
use App\Models\BotLogModel;

class Dashboard extends BaseController
{
    protected $orderModel;
    protected $menuModel;
    protected $configModel;
    protected $logModel;

    public function __construct()
    {
        $this->orderModel  = new OrderModel();
        $this->menuModel   = new MenuModel();
        $this->configModel = new BotConfigModel();
        $this->logModel    = new BotLogModel();
    }

    public function index()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $today = date('Y-m-d');

        // Stats
        $todayOrdersCount = $this->orderModel->where('DATE(created_at)', $today)->countAllResults();
        $todayRevenue = $this->orderModel->selectSum('grand_total')
                                         ->where('DATE(created_at)', $today)
                                         ->whereIn('payment_status', ['paid', 'verified'])
                                         ->first()['grand_total'] ?? 0;

        $pendingOrdersCount = $this->orderModel->where('order_status', 'pending')->countAllResults();
        $totalMenusCount    = $this->menuModel->countAllResults();

        // Recent Orders
        $recentOrders = $this->orderModel->orderBy('id', 'DESC')->findAll(8);

        // Bot configs
        $configs = $this->configModel->getAllKeyValues();

        $data = [
            'title'               => 'Dashboard UMKM & Bot WhatsApp',
            'todayOrdersCount'    => $todayOrdersCount,
            'todayRevenue'        => $todayRevenue,
            'pendingOrdersCount'  => $pendingOrdersCount,
            'totalMenusCount'     => $totalMenusCount,
            'recentOrders'        => $recentOrders,
            'configs'             => $configs,
        ];

        return view('admin/dashboard/index', $data);
    }
}
