<?php

namespace App\Models;

use CodeIgniter\Model;

class OrderModel extends Model
{
    protected $table            = 'fnb_orders';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'invoice_no', 'customer_phone', 'customer_name', 'order_type',
        'delivery_address', 'notes', 'total_items', 'subtotal',
        'delivery_fee', 'discount', 'grand_total', 'payment_method',
        'payment_status', 'order_status', 'proof_image'
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function generateInvoiceNo(): string
    {
        $date = date('Ymd');
        $prefix = "ORD-{$date}-";
        $lastOrder = $this->like('invoice_no', $prefix, 'after')
                          ->orderBy('id', 'DESC')
                          ->first();

        $num = 1;
        if ($lastOrder && !empty($lastOrder['invoice_no'])) {
            $parts = explode('-', $lastOrder['invoice_no']);
            if (isset($parts[2])) {
                $num = intval($parts[2]) + 1;
            }
        }

        return $prefix . str_pad((string)$num, 3, '0', STR_PAD_LEFT);
    }

    public function getOrderWithItems(int $orderId)
    {
        $order = $this->find($orderId);
        if (!$order) {
            return null;
        }

        $itemModel = new OrderItemModel();
        $order['items'] = $itemModel->where('order_id', $orderId)->findAll();
        return $order;
    }

    public function getLatestOrderByPhone(string $phone)
    {
        return $this->where('customer_phone', $phone)
                    ->orderBy('id', 'DESC')
                    ->first();
    }
}
