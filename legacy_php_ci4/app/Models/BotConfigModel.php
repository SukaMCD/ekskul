<?php

namespace App\Models;

use CodeIgniter\Model;

class BotConfigModel extends Model
{
    protected $table            = 'bot_configs';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $allowedFields    = ['config_key', 'config_value'];
    protected $useTimestamps    = false;

    public function getAllKeyValues(): array
    {
        $rows = $this->findAll();
        $res  = [];
        foreach ($rows as $r) {
            $res[$r['config_key']] = $r['config_value'];
        }
        return $res;
    }

    public function getValue(string $key, ?string $default = null): ?string
    {
        $row = $this->where('config_key', $key)->first();
        return $row ? $row['config_value'] : $default;
    }

    public function setValue(string $key, ?string $value): bool
    {
        $existing = $this->where('config_key', $key)->first();
        if ($existing) {
            return (bool)$this->update($existing['id'], ['config_value' => $value]);
        }
        return (bool)$this->insert(['config_key' => $key, 'config_value' => $value]);
    }
}
