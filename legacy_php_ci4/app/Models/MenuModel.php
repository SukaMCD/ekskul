<?php

namespace App\Models;

use CodeIgniter\Model;

class MenuModel extends Model
{
    protected $table            = 'fnb_menus';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = ['category_id', 'code', 'name', 'description', 'price', 'image_url', 'is_available'];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function getMenusWithCategory($onlyAvailable = false)
    {
        $builder = $this->select('fnb_menus.*, fnb_categories.name as category_name, fnb_categories.code as category_code')
                        ->join('fnb_categories', 'fnb_categories.id = fnb_menus.category_id', 'left')
                        ->orderBy('fnb_categories.display_order', 'ASC')
                        ->orderBy('fnb_menus.code', 'ASC');

        if ($onlyAvailable) {
            $builder->where('fnb_menus.is_available', 1)
                    ->where('fnb_categories.is_active', 1);
        }

        return $builder->findAll();
    }

    public function findByCode(string $code)
    {
        return $this->where('UPPER(code)', strtoupper(trim($code)))->first();
    }

    public function getFormattedMenuForBot(): string
    {
        $menus = $this->getMenusWithCategory(true);
        if (empty($menus)) {
            return "Saat ini belum ada menu yang tersedia.";
        }

        $grouped = [];
        foreach ($menus as $m) {
            $cat = $m['category_name'] ?? 'Lainnya';
            $grouped[$cat][] = $m;
        }

        $output = "📋 *KATALOG MENU & HARGA*\n";
        $output .= "═══════════════════════\n\n";

        foreach ($grouped as $catName => $items) {
            $output .= "🔹 *" . strtoupper($catName) . "*\n";
            foreach ($items as $item) {
                $priceStr = 'Rp ' . number_format($item['price'], 0, ',', '.');
                $output .= "• *[{$item['code']}]* {$item['name']}\n  💵 {$priceStr}\n";
                if (!empty($item['description'])) {
                    $output .= "  _{$item['description']}_\n";
                }
            }
            $output .= "\n";
        }

        $output .= "═══════════════════════\n";
        $output .= "💡 *CARA PESAN CEPAT:*\n";
        $output .= "Ketik *ORDER* untuk dipandu, atau langsung ketik kode & jumlah.\n";
        $output .= "Contoh: *ORDER M1 2, D1 1*\n\n";
        $output .= "Ketik *MENU* untuk kembali ke sini.";

        return $output;
    }
}
