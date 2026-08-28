<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\WablasService;
use App\Models\BotConfigModel;
use App\Models\BotLogModel;

class BotSettings extends BaseController
{
    protected $configModel;
    protected $logModel;
    protected $wablas;

    public function __construct()
    {
        $this->configModel = new BotConfigModel();
        $this->logModel    = new BotLogModel();
        $this->wablas      = new WablasService();
    }

    public function index()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $configs = $this->configModel->getAllKeyValues();
        $logs    = $this->logModel->getRecentLogs(30);

        // Get Webhook URL dynamically
        $baseUrl    = site_url();
        $webhookUrl = site_url('webhook/wa');

        $data = [
            'title'      => 'Pengaturan Bot WhatsApp & Wablas Gateway',
            'configs'    => $configs,
            'logs'       => $logs,
            'webhookUrl' => $webhookUrl
        ];

        return view('admin/settings/index', $data);
    }

    public function save()
    {
        if (!session()->get('is_logged_in')) {
            return redirect()->to(site_url('admin/login'));
        }

        $fields = [
            'bot_active', 'whitelist_mode', 'whitelist_numbers',
            'bot_name', 'store_name', 'store_address',
            'store_gmaps', 'store_hours', 'admin_phone', 'wablas_url',
            'wablas_token', 'wablas_secret', 'bank_info', 'welcome_message'
        ];

        foreach ($fields as $field) {
            $val = $this->request->getPost($field);
            if ($field === 'bot_active' || $field === 'whitelist_mode') {
                $val = ($val === '1' || $val === 'on') ? '1' : '0';
            }
            if ($val !== null) {
                $this->configModel->setValue($field, trim($val));
            }
        }

        $this->wablas->reloadConfig();

        session()->setFlashdata('success', 'Konfigurasi Bot WhatsApp dan Resto berhasil disimpan!');
        return redirect()->to(site_url('admin/settings'));
    }

    public function testSend()
    {
        if (!session()->get('is_logged_in')) {
            return $this->response->setJSON(['status' => false, 'message' => 'Unauthorized']);
        }

        $phone   = trim($this->request->getPost('phone') ?? '');
        $message = trim($this->request->getPost('message') ?? '');
        $wToken  = trim($this->request->getPost('wablas_token') ?? '');
        $wSecret = trim($this->request->getPost('wablas_secret') ?? '');
        $wUrl    = trim($this->request->getPost('wablas_url') ?? '');

        if (!empty($wToken)) {
            $this->configModel->setValue('wablas_token', $wToken);
        }
        if ($wSecret !== null) {
            $this->configModel->setValue('wablas_secret', $wSecret);
        }
        if (!empty($wUrl)) {
            $this->configModel->setValue('wablas_url', $wUrl);
        }
        $this->wablas->reloadConfig();

        if (empty($phone) || empty($message)) {
            return $this->response->setJSON(['status' => false, 'message' => 'Nomor HP dan pesan tidak boleh kosong']);
        }

        $result = $this->wablas->sendMessage($phone, $message);

        // Include readable error details if any
        if (empty($result['status'])) {
            $rawResp = $result['response'] ?? null;
            if (is_array($rawResp) && !empty($rawResp['message'])) {
                $result['message'] = $rawResp['message'];
            } elseif (is_string($rawResp)) {
                $result['message'] = $rawResp;
            }
        }

        return $this->response->setJSON($result);
    }

    public function simulateWebhook()
    {
        if (!session()->get('is_logged_in')) {
            return $this->response->setJSON(['status' => false, 'message' => 'Unauthorized']);
        }

        $phone = trim($this->request->getPost('phone') ?: ($this->request->getVar('phone') ?: '628123456789'));
        $text  = trim($this->request->getPost('text') ?: ($this->request->getVar('text') ?: 'MENU'));

        // Internal call to Webhook controller
        $payload = [
            'phone'       => $phone,
            'messageType' => 'text',
            'message'     => $text,
            'isGroup'     => false,
            'isFromMe'    => false,
            'timestamp'   => time()
        ];

        try {
            // Direct in-memory invocation for instant, network-independent execution
            $webhookController = new \App\Controllers\Webhook();
            $webhookController->wa($payload);

            // Fetch the latest outbound log for this phone using fresh model
            $normPhone = WablasService::normalizePhone($phone);
            $logFresh  = new \App\Models\BotLogModel();
            $latestReply = $logFresh->where('phone', $normPhone)
                                    ->where('direction', 'outbound')
                                    ->orderBy('id', 'DESC')
                                    ->first();

            return $this->response->setJSON([
                'status'    => true,
                'sent_text' => $text,
                'reply'     => $latestReply ? $latestReply['message_body'] : '(Pesan diproses, tidak ada balasan keluar)'
            ]);
        } catch (\Throwable $e) {
            return $this->response->setJSON([
                'status'  => false,
                'message' => 'Simulasi gagal: ' . $e->getMessage()
            ]);
        }
    }
}
