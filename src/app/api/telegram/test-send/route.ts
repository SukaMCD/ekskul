import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { getBotConfigs } from '@/lib/wablas';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { chatId, message, token } = body;

    if (!chatId || !message) {
      return NextResponse.json(
        { status: false, message: 'Chat ID dan pesan wajib diisi!' },
        { status: 400 }
      );
    }

    const configs = await getBotConfigs();
    if (token) {
      configs.telegram_bot_token = token;
    }

    const result = await sendTelegramMessage(chatId, message, configs);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { status: false, message: error.message || 'Gagal mengirim pesan uji coba' },
      { status: 500 }
    );
  }
}
