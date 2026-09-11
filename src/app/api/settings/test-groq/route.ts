import { NextRequest, NextResponse } from 'next/server';
import { getBotConfigs } from '@/lib/wablas';
import { askGroqChatbot, getGroqApiKey, getGroqModel } from '@/lib/groq';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = body.message || 'Halo min! Menu best seller di sini apa saja ya?';

    const configs = await getBotConfigs();
    const apiKey = getGroqApiKey(configs);
    const model = getGroqModel(configs);

    if (!apiKey) {
      return NextResponse.json({
        status: false,
        error: 'API Key Groq belum diisi.',
      }, { status: 400 });
    }

    const reply = await askGroqChatbot({
      userMessage: message,
      customerName: 'Admin Tester',
      configs,
    });

    if (!reply) {
      return NextResponse.json({
        status: false,
        error: 'Groq tidak memberikan respon atau API Key tidak valid.',
      }, { status: 500 });
    }

    return NextResponse.json({
      status: true,
      model,
      query: message,
      reply,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: false,
      error: err.message || 'Internal error calling Groq test',
    }, { status: 500 });
  }
}
