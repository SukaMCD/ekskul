import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Menu from '@/models/Menu';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const availableOnly = searchParams.get('availableOnly') === 'true';

    const filter: any = {};
    if (categoryId) filter.categoryId = categoryId;
    if (availableOnly) filter.isAvailable = true;

    const menus = await Menu.find(filter)
      .populate('categoryId')
      .sort({ code: 1, createdAt: 1 });

    return NextResponse.json({ status: true, data: menus });
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
    const { categoryId, code, name, description, price, imageUrl, isAvailable } = await request.json();

    if (!categoryId || !code || !name || price === undefined) {
      return NextResponse.json(
        { status: false, message: 'Kategori, Kode, Nama, dan Harga wajib diisi' },
        { status: 400 }
      );
    }

    await connectDB();
    const existing = await Menu.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return NextResponse.json(
        { status: false, message: `Kode menu '${code}' sudah digunakan.` },
        { status: 400 }
      );
    }

    const menu = await Menu.create({
      categoryId,
      code: code.toUpperCase().trim(),
      name: name.trim(),
      description: (description || '').trim(),
      price: Number(price),
      imageUrl: (imageUrl || '').trim(),
      isAvailable: isAvailable !== false,
    });

    const populated = await Menu.findById(menu._id).populate('categoryId');
    return NextResponse.json({ status: true, message: 'Menu berhasil ditambahkan', data: populated });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
