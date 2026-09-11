import { NextRequest, NextResponse } from 'next/server';
import { POST as handleTelegramPost, GET as handleTelegramGet } from './telegram/route';
import { POST as handleWaPost, GET as handleWaGet } from './wa/route';

export async function GET(request: NextRequest) {
  return handleTelegramGet(request);
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const cloned = request.clone();
      const body = await cloned.json().catch(() => null);

      // Telegram update payload selalu memiliki update_id
      if (body && (typeof body.update_id !== 'undefined' || body.message?.chat)) {
        return handleTelegramPost(request);
      }
    }

    // Default fallback to WA handler (Fonnte / Wablas)
    return handleWaPost(request);
  } catch {
    return handleTelegramPost(request);
  }
}
