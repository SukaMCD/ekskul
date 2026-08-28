import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { status: false, message: 'Username dan password wajib diisi' },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ username: username.trim() });

    if (!user) {
      return NextResponse.json(
        { status: false, message: 'Username atau password salah' },
        { status: 401 }
      );
    }

    const isMatch = comparePassword(password, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { status: false, message: 'Username atau password salah' },
        { status: 401 }
      );
    }

    const token = signToken({
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json({
      status: true,
      message: 'Login berhasil',
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
