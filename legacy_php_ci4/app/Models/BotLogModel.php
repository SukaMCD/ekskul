<?php

namespace App\Models;

use CodeIgniter\Model;

class BotLogModel extends Model
{
    protected $table            = 'bot_logs';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $allowedFields    = ['phone', 'direction', 'message_type', 'message_body', 'raw_payload', 'status', 'created_at'];
    protected $useTimestamps    = false;

    public function getRecentLogs(int $limit = 50)
    {
        return $this->orderBy('id', 'DESC')->findAll($limit);
    }
}
