<?php

namespace App\Models;

use CodeIgniter\Model;

class BotSessionModel extends Model
{
    protected $table            = 'bot_sessions';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $allowedFields    = ['phone', 'state', 'temp_data', 'is_paused', 'paused_at', 'last_interaction'];
    protected $useTimestamps    = false;

    public function getSession(string $phone)
    {
        $cleanPhone = preg_replace('/[^\d]/', '', $phone);
        $session = $this->where('phone', $cleanPhone)->first();
        if (!$session) {
            $this->insert([
                'phone'            => $cleanPhone,
                'state'            => 'IDLE',
                'temp_data'        => json_encode([]),
                'is_paused'        => 0,
                'last_interaction' => date('Y-m-d H:i:s'),
                'created_at'       => date('Y-m-d H:i:s')
            ]);
            $session = $this->where('phone', $cleanPhone)->first();
        }
        return $session;
    }

    public function updateState(string $phone, string $state, array $tempData = [])
    {
        $cleanPhone = preg_replace('/[^\d]/', '', $phone);
        $data = [
            'state'            => $state,
            'temp_data'        => json_encode($tempData),
            'last_interaction' => date('Y-m-d H:i:s')
        ];
        return $this->where('phone', $cleanPhone)->set($data)->update();
    }

    public function clearState(string $phone)
    {
        return $this->updateState($phone, 'IDLE', []);
    }

    public function setPaused(string $phone, bool $paused)
    {
        $cleanPhone = preg_replace('/[^\d]/', '', $phone);
        $data = [
            'is_paused'        => $paused ? 1 : 0,
            'paused_at'        => $paused ? date('Y-m-d H:i:s') : null,
            'last_interaction' => date('Y-m-d H:i:s')
        ];
        return $this->where('phone', $cleanPhone)->set($data)->update();
    }
}
