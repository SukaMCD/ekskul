import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Category from '@/models/Category';
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
    const { name, code, displayOrder, isActive } = await request.json();
    await connectDB();

    const category = await Category.findById(id);
    if (!category) {
      return NextResponse.json({ status: false, message: 'Kategori tidak ditemukan' }, { status: 404 });
    }

    if (code && code.toUpperCase().trim() !== category.code) {
      const existing = await Category.findOne({
        code: code.toUpperCase().trim(),
        _id: { $ne: id },
      });
      if (existing) {
        return NextResponse.json({ status: false, message: 'Kode kategori sudah digunakan' }, { status: 400 });
      }
      category.code = code.toUpperCase().trim();
    }

    if (name) category.name = name.trim();
    if (typeof displayOrder === 'number') category.displayOrder = displayOrder;
    if (typeof isActive === 'boolean') category.isActive = isActive;

    await category.save();
    return NextResponse.json({ status: true, message: 'Kategori berhasil diperbarui', data: category });
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
    const menuCount = await Menu.countDocuments({ categoryId: id });
    if (menuCount > 0) {
      return NextResponse.json(
        { status: false, message: `Kategori tidak dapat dihapus karena masih memiliki ${menuCount} menu.` },
        { status: 400 }
      );
    }

    await Category.findByIdAndDelete(id);
    return NextResponse.json({ status: true, message: 'Kategori berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ status: false, message: error.message }, { status: 500 });
  }
}
