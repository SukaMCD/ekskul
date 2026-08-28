import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: true,
    user: session,
  });
}
