<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\UserModel;

class Auth extends BaseController
{
    protected $userModel;

    public function __construct()
    {
        $this->userModel = new UserModel();
    }

    public function login()
    {
        if (session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/dashboard'));
        }

        return view('admin/auth/login');
    }

    public function doLogin()
    {
        $username = trim($this->request->getPost('username') ?? '');
        $password = trim($this->request->getPost('password') ?? '');

        if (empty($username) || empty($password)) {
            session()->setFlashdata('error', 'Username dan password wajib diisi.');
            return redirect()->back()->withInput();
        }

        $user = $this->userModel->verifyLogin($username, $password);
        if (!$user) {
            session()->setFlashdata('error', 'Username atau password salah.');
            return redirect()->back()->withInput();
        }

        session()->set([
            'user_id'      => $user['id'],
            'username'     => $user['username'],
            'user_name'    => $user['name'],
            'user_role'    => $user['role'],
            'is_logged_in' => true,
        ]);

        return redirect()->to(site_url('admin/dashboard'));
    }

    public function logout()
    {
        session()->destroy();
        return redirect()->to(site_url('admin/login'));
    }
}
