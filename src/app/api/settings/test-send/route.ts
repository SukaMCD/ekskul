import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, getBotConfigs } from '@/lib/wablas';
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

    // Load configs to check which provider is active
    const configs = await getBotConfigs();
    const provider = (configs.gateway_provider || 'wablas').toLowerCase();

    const result = await sendWhatsAppMessage(phone, message, configs);
    return NextResponse.json({
      ...result,
      _debug: {
        provider,
        wablas_url: configs.wablas_url,
        has_token: Boolean(configs.wablas_token || process.env.WABLAS_TOKEN),
      },
    });
  } catch (error: any) {
    // Return 200 so frontend can display the error message (not a generic red error)
    return NextResponse.json({
      status: false,
      message: `Error: ${error.message}`,
      _debug: { stack: error.stack?.slice(0, 300) },
    });
  }
}
