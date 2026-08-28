import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Menu from '@/models/Menu';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const { categoryId, code, name, description, price, imageUrl, isAvailable } = await request.json();
    await connectDB();

    const menu = await Menu.findById(id);
    if (!menu) {
      return NextResponse.json({ status: false, message: 'Menu tidak ditemukan' }, { status: 404 });
    }

    if (code && code.toUpperCase().trim() !== menu.code) {
      const existing = await Menu.findOne({
        code: code.toUpperCase().trim(),
        _id: { $ne: id },
      });
      if (existing) {
        return NextResponse.json({ status: false, message: `Kode menu '${code}' sudah digunakan.` }, { status: 400 });
      }
      menu.code = code.toUpperCase().trim();
    }

    if (categoryId) menu.categoryId = categoryId;
    if (name) menu.name = name.trim();
    if (description !== undefined) menu.description = description.trim();
    if (price !== undefined) menu.price = Number(price);
    if (imageUrl !== undefined) menu.imageUrl = imageUrl.trim();
    if (typeof isAvailable === 'boolean') menu.isAvailable = isAvailable;

    await menu.save();
    const updated = await Menu.findById(menu._id).populate('categoryId');
    return NextResponse.json({ status: true, message: 'Menu berhasil diperbarui', data: updated });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    const { isAvailable } = await request.json();
    await connectDB();

    const menu = await Menu.findById(id);
    if (!menu) {
      return NextResponse.json({ status: false, message: 'Menu tidak ditemukan' }, { status: 404 });
    }

    menu.isAvailable = typeof isAvailable === 'boolean' ? isAvailable : !menu.isAvailable;
    await menu.save();

    return NextResponse.json({
      status: true,
      message: `Status menu berhasil diubah menjadi ${menu.isAvailable ? 'Tersedia' : 'Habis'}`,
      data: menu,
    });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;
    await connectDB();
    await Menu.findByIdAndDelete(id);
    return NextResponse.json({ status: true, message: 'Menu berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
