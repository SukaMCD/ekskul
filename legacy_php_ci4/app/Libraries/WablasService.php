<?php

namespace App\Libraries;

use App\Models\BotConfigModel;
use App\Models\BotLogModel;

class WablasService
{
    protected $configModel;
    protected $logModel;
    protected $token;
    protected $baseUrl;
    protected $botActive;
    protected $adminPhone;
    protected $secretKey;

    public function __construct()
    {
        $this->configModel = new BotConfigModel();
        $this->logModel    = new BotLogModel();
        $this->reloadConfig();
    }

    /**
     * Reload configurations from database
     */
    public function reloadConfig()
    {
        $configs = $this->configModel->getAllKeyValues();
        $this->token      = $configs['wablas_token'] ?? '';
        $this->secretKey  = $configs['wablas_secret'] ?? '';
        $this->baseUrl    = rtrim($configs['wablas_url'] ?? 'https://sby.wablas.com', '/');
        $this->botActive  = ($configs['bot_active'] ?? '1') === '1';
        $this->adminPhone = $this->normalizePhone($configs['admin_phone'] ?? '');
    }

    public function isBotActive(): bool
    {
        return $this->botActive;
    }

    public function getAdminPhone(): string
    {
        return $this->adminPhone;
    }

    public function getToken(): string
    {
        return $this->token;
    }

    protected $whitelistMode = false;
    protected $whitelistNumbers = [];

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function isWhitelistMode(): bool
    {
        $val = $this->configModel->getValue('whitelist_mode', '0');
        return ($val === '1');
    }

    public function getWhitelistNumbers(): array
    {
        $raw = $this->configModel->getValue('whitelist_numbers', '');
        if (empty($raw)) {
            return [];
        }
        $parts = preg_split('/[,;\n]+/', $raw);
        $res = [];
        foreach ($parts as $p) {
            $n = self::normalizePhone($p);
            if (!empty($n)) {
                $res[] = $n;
            }
        }
        return array_values(array_unique($res));
    }

    public function isPhoneWhitelisted(string $phone): bool
    {
        if (!$this->isWhitelistMode()) {
            return true;
        }
        $normalized = self::normalizePhone($phone);
        if ($normalized === $this->adminPhone) {
            return true;
        }
        $allowed = $this->getWhitelistNumbers();
        return in_array($normalized, $allowed);
    }

    public function addWhitelistNumber(string $phone): bool
    {
        $clean = self::normalizePhone($phone);
        if (empty($clean)) return false;
        $current = $this->getWhitelistNumbers();
        if (!in_array($clean, $current)) {
            $current[] = $clean;
            return $this->configModel->setValue('whitelist_numbers', implode(', ', $current));
        }
        return true;
    }

    public function removeWhitelistNumber(string $phone): bool
    {
        $clean = self::normalizePhone($phone);
        $current = $this->getWhitelistNumbers();
        $filtered = array_filter($current, fn($p) => $p !== $clean);
        return $this->configModel->setValue('whitelist_numbers', implode(', ', array_values($filtered)));
    }

    /**
     * Normalize Indonesian phone number to international format (628xxx)
     */
    public static function normalizePhone(string $phone): string
    {
        $clean = preg_replace('/[^\d]/', '', $phone);
        if (empty($clean)) {
            return '';
        }

        if (str_starts_with($clean, '0')) {
            $clean = '62' . substr($clean, 1);
        } elseif (str_starts_with($clean, '8')) {
            $clean = '62' . $clean;
        }

        return $clean;
    }

    /**
     * Format phone for user-friendly display (e.g. 0812-3456-7890)
     */
    public static function displayPhone(string $phone): string
    {
        $clean = self::normalizePhone($phone);
        if (str_starts_with($clean, '62')) {
            $clean = '0' . substr($clean, 2);
        }
        return $clean;
    }

    /**
     * Send plain text WhatsApp message via Wablas API
     */
    public function sendMessage(string $phone, string $message): array
    {
        $phone = self::normalizePhone($phone);
        if (empty($phone) || empty($message)) {
            return ['status' => false, 'message' => 'Phone or message empty'];
        }

        $endpoint = '/api/send-message';
        $payload  = http_build_query([
            'phone'   => $phone,
            'message' => $message
        ]);

        return $this->executeCurl($endpoint, $payload, 'POST', 'application/x-www-form-urlencoded', $phone, $message, 'text');
    }

    /**
     * Send Image / Media WhatsApp message via Wablas API
     */
    public function sendImage(string $phone, string $imageUrl, string $caption = ''): array
    {
        $phone = self::normalizePhone($phone);
        if (empty($phone) || empty($imageUrl)) {
            return ['status' => false, 'message' => 'Phone or image URL empty'];
        }

        $endpoint = '/api/send-image';
        $payload  = http_build_query([
            'phone'   => $phone,
            'image'   => $imageUrl,
            'caption' => $caption
        ]);

        return $this->executeCurl($endpoint, $payload, 'POST', 'application/x-www-form-urlencoded', $phone, "Image: {$imageUrl} | Caption: {$caption}", 'image');
    }

    /**
     * Send Interactive Button WhatsApp message via Wablas API (v2)
     */
    public function sendButton(string $phone, string $message, array $buttons, string $footer = ''): array
    {
        $phone = self::normalizePhone($phone);
        if (empty($phone) || empty($message)) {
            return ['status' => false, 'message' => 'Phone or message empty'];
        }

        $endpoint = '/api/v2/send-button';
        $payloadArr = [
            'phone'   => $phone,
            'message' => $message,
            'buttons' => $buttons
        ];
        if (!empty($footer)) {
            $payloadArr['footer'] = $footer;
        }

        $payload = json_encode($payloadArr, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return $this->executeCurl($endpoint, $payload, 'POST', 'application/json', $phone, $message, 'button');
    }

    /**
     * Execute cURL request to Wablas Gateway with retry mechanism
     */
    protected function executeCurl(
        string $endpoint,
        string $payload,
        string $method = 'POST',
        string $contentType = 'application/x-www-form-urlencoded',
        string $recipientPhone = '',
        string $messageSummary = '',
        string $messageType = 'text'
    ): array {
        if (empty($this->token)) {
            // Log local simulation if token is not yet configured
            $this->logMessage($recipientPhone, 'outbound', $messageType, $messageSummary, $payload, 'skipped_no_token');
            return [
                'status'  => false,
                'message' => 'Wablas token is not configured yet in settings. Message simulated locally.',
                'simulated' => true
            ];
        }

        $url = $this->baseUrl . $endpoint;
        $maxRetries = 2;
        $attempt = 0;
        $httpCode = 0;
        $rawResponse = '';
        $errorMsg = '';

        while ($attempt < $maxRetries) {
            $attempt++;
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST  => $method,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_CONNECTTIMEOUT => 7,
                CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: ' . (!empty($this->secretKey) && !str_contains($this->token, '.') ? "{$this->token}.{$this->secretKey}" : $this->token),
                    'Content-Type: ' . $contentType
                ]
            ]);

            $rawResponse = curl_exec($ch);
            $httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $errorMsg    = curl_error($ch);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                break;
            }
            usleep(300000); // 300ms backoff
        }

        $decoded = json_decode($rawResponse, true);
        $statusStr = ($httpCode >= 200 && $httpCode < 300) ? 'success' : 'failed';

        // Log outgoing message
        $this->logMessage($recipientPhone, 'outbound', $messageType, $messageSummary, $rawResponse ?: $errorMsg, $statusStr);

        return [
            'status'     => ($statusStr === 'success'),
            'http_code'  => $httpCode,
            'response'   => $decoded ?? $rawResponse,
            'error'      => $errorMsg
        ];
    }

    /**
     * Save log message to bot_logs table
     */
    public function logMessage(
        ?string $phone,
        string $direction,
        string $messageType,
        ?string $messageBody,
        ?string $rawPayload,
        string $status = 'success'
    ) {
        try {
            $this->logModel->insert([
                'phone'        => $phone,
                'direction'    => $direction,
                'message_type' => $messageType,
                'message_body' => $messageBody,
                'raw_payload'  => $rawPayload,
                'status'       => $status,
                'created_at'   => date('Y-m-d H:i:s')
            ]);
        } catch (\Throwable $e) {
            // Silently ignore logging errors
        }
    }
}
