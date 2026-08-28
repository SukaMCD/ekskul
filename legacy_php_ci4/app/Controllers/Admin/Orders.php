<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\WablasService;
use App\Models\BotConfigModel;
use App\Models\OrderItemModel;
use App\Models\OrderModel;

class Orders extends BaseController
{
    protected $orderModel;
    protected $orderItemModel;
    protected $configModel;
    protected $wablas;

    public function __construct()
    {
        $this->orderModel     = new OrderModel();
        $this->orderItemModel = new OrderItemModel();
        $this->configModel    = new BotConfigModel();
        $this->wablas         = new WablasService();
    }

    public function index()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $statusFilter = $this->request->getGet('status');
        $search = $this->request->getGet('q');

        $builder = $this->orderModel->orderBy('id', 'DESC');

        if (!empty($statusFilter) && $statusFilter !== 'all') {
            $builder->where('order_status', $statusFilter);
        }

        if (!empty($search)) {
            $builder->groupStart()
                    ->like('invoice_no', $search)
                    ->orLike('customer_name', $search)
                    ->orLike('customer_phone', $search)
                    ->groupEnd();
        }

        $orders = $builder->findAll();

        $data = [
            'title'        => 'Manajemen Pesanan F&B',
            'orders'       => $orders,
            'statusFilter' => $statusFilter ?? 'all',
            'search'       => $search ?? ''
        ];

        return view('admin/orders/index', $data);
    }

    public function detail(int $id)
    {
        if (!session()->get('is_logged_in')) {
            return $this->response->setJSON(['status' => false, 'message' => 'Unauthorized']);
        }

        $order = $this->orderModel->getOrderWithItems($id);
        if (!$order) {
            return $this->response->setJSON(['status' => false, 'message' => 'Pesanan tidak ditemukan']);
        }

        return $this->response->setJSON([
            'status' => true,
            'data'   => $order
        ]);
    }

    public function updateStatus()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $orderId       = intval($this->request->getPost('order_id'));
        $orderStatus   = $this->request->getPost('order_status');
        $paymentStatus = $this->request->getPost('payment_status');
        $sendWaNotif   = $this->request->getPost('send_wa_notif') === '1';

        $order = $this->orderModel->getOrderWithItems($orderId);
        if (!$order) {
            session()->setFlashdata('error', 'Pesanan tidak ditemukan.');
            return redirect()->back();
        }

        $updateData = [];
        if (!empty($orderStatus))   $updateData['order_status']   = $orderStatus;
        if (!empty($paymentStatus)) $updateData['payment_status'] = $paymentStatus;

        $this->orderModel->update($orderId, $updateData);

        // Send WhatsApp update notification to customer if checked
        if ($sendWaNotif && !empty($order['customer_phone'])) {
            $configs   = $this->configModel->getAllKeyValues();
            $storeName = $configs['store_name'] ?? 'Resto Kami';

            $statusText = '';
            switch ($orderStatus) {
                case 'confirmed':
                    $statusText = "✅ *Pesanan Dikonfirmasi!*\nPesanan kakak *#{$order['invoice_no']}* sudah kami terima dan segera masuk antrean dapur ya!";
                    break;
                case 'cooking':
                    $statusText = "🍳 *Sedang Dimasak!*\nPesanan *#{$order['invoice_no']}* saat ini sedang disiapkan oleh tim dapur *{$storeName}*. Harap ditunggu ya kak!";
                    break;
                case 'ready':
                    if ($order['order_type'] === 'dine_in') {
                        $statusText = "🍽️ *Makanan Siap Disajikan!*\nPesanan *#{$order['invoice_no']}* sudah siap dan akan diantar ke meja kakak. Selamat menikmati!";
                    } elseif ($order['order_type'] === 'takeaway') {
                        $statusText = "🛍️ *Pesanan Siap Diambil!*\nPesanan *#{$order['invoice_no']}* sudah selesai dikemas dan siap diambil di counter/kasir. Terima kasih!";
                    } else {
                        $statusText = "🛵 *Sedang Diantar Kurir!*\nPesanan *#{$order['invoice_no']}* sedang dalam perjalanan ke alamat kakak:\n📍 _{$order['delivery_address']}_\n\nMohon pastikan nomor telepon tetap aktif.";
                    }
                    break;
                case 'delivered':
                    $statusText = "🎉 *Pesanan Selesai!*\nTerima kasih banyak sudah memesan di *{$storeName}* kak! Semoga makanannya enak dan cocok di lidah 😊🙏\n\nKetik *MENU* kapan saja jika ingin memesan lagi.";
                    break;
                case 'cancelled':
                    $statusText = "❌ *Pesanan Dibatalkan*\nMohon maaf, pesanan *#{$order['invoice_no']}* telah dibatalkan oleh admin/restoran. Silakan hubungi kami jika ada kendala.";
                    break;
            }

            if (!empty($statusText)) {
                $this->wablas->sendMessage($order['customer_phone'], $statusText);
            }
        }

        session()->setFlashdata('success', "Status pesanan #{$order['invoice_no']} berhasil diperbarui!");
        return redirect()->back();
    }
}
