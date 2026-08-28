<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\CategoryModel;
use App\Models\MenuModel;

class Menu extends BaseController
{
    protected $menuModel;
    protected $categoryModel;

    public function __construct()
    {
        $this->menuModel     = new MenuModel();
        $this->categoryModel = new CategoryModel();
    }

    public function index()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $menus      = $this->menuModel->getMenusWithCategory();
        $categories = $this->categoryModel->orderBy('display_order', 'ASC')->findAll();

        $data = [
            'title'      => 'Katalog & Manajemen Menu F&B',
            'menus'      => $menus,
            'categories' => $categories
        ];

        return view('admin/menu/index', $data);
    }

    public function save()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $id          = $this->request->getPost('id');
        $categoryId  = intval($this->request->getPost('category_id'));
        $code        = strtoupper(trim($this->request->getPost('code') ?? ''));
        $name        = trim($this->request->getPost('name') ?? '');
        $description = trim($this->request->getPost('description') ?? '');
        $price       = floatval($this->request->getPost('price') ?? 0);
        $isAvailable = $this->request->getPost('is_available') ? 1 : 0;

        if (empty($code) || empty($name) || $price <= 0) {
            session()->setFlashdata('error', 'Kode menu, nama menu, dan harga wajib diisi dengan benar.');
            return redirect()->back()->withInput();
        }

        // Check code uniqueness
        $existing = $this->menuModel->findByCode($code);
        if ($existing && (!empty($id) ? $existing['id'] != $id : true)) {
            session()->setFlashdata('error', "Kode menu '{$code}' sudah digunakan oleh menu lain. Gunakan kode lain (misal M5, D5, P3).");
            return redirect()->back()->withInput();
        }

        $saveData = [
            'category_id'  => $categoryId,
            'code'         => $code,
            'name'         => $name,
            'description'  => $description,
            'price'        => $price,
            'is_available' => $isAvailable,
        ];

        if (!empty($id)) {
            $this->menuModel->update($id, $saveData);
            session()->setFlashdata('success', "Menu '{$name}' berhasil diperbarui!");
        } else {
            $this->menuModel->insert($saveData);
            session()->setFlashdata('success', "Menu baru '{$name}' [{$code}] berhasil ditambahkan!");
        }

        return redirect()->to(site_url('admin/menu'));
    }

    public function toggleAvailability(int $id)
    {
        if (!session()->get('is_logged_in')) {
            return $this->response->setJSON(['status' => false, 'message' => 'Unauthorized']);
        }

        $menu = $this->menuModel->find($id);
        if (!$menu) {
            return $this->response->setJSON(['status' => false, 'message' => 'Menu not found']);
        }

        $newStatus = empty($menu['is_available']) ? 1 : 0;
        $this->menuModel->update($id, ['is_available' => $newStatus]);

        return $this->response->setJSON([
            'status'       => true,
            'is_available' => $newStatus,
            'message'      => $newStatus ? 'Menu sekarang Tersedia ✅' : 'Menu ditandai Habis ❌'
        ]);
    }

    public function delete(int $id)
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $menu = $this->menuModel->find($id);
        if ($menu) {
            $this->menuModel->delete($id);
            session()->setFlashdata('success', "Menu '{$menu['name']}' berhasil dihapus.");
        }

        return redirect()->to(site_url('admin/menu'));
    }
}
