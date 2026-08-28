import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/wablas';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { phone, message } = await request.json();
    if (!phone || !message) {
      return NextResponse.json(
        { status: false, message: 'Nomor HP dan Pesan wajib diisi' },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppMessage(phone, message);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
