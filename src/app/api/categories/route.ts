import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Category from '@/models/Category';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    await connectDB();
    const categories = await Category.find({}).sort({ displayOrder: 1, createdAt: 1 });
    return NextResponse.json({ status: true, data: categories });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, code, displayOrder, isActive } = await request.json();

    if (!name || !code) {
      return NextResponse.json(
        { status: false, message: 'Nama dan kode kategori wajib diisi' },
        { status: 400 }
      );
    }

    await connectDB();
    const existing = await Category.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return NextResponse.json(
        { status: false, message: 'Kode kategori sudah digunakan' },
        { status: 400 }
      );
    }

    const category = await Category.create({
      name: name.trim(),
      code: code.toUpperCase().trim(),
      displayOrder: typeof displayOrder === 'number' ? displayOrder : 0,
      isActive: isActive !== false,
    });

    return NextResponse.json({ status: true, message: 'Kategori berhasil ditambahkan', data: category });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
