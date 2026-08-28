import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Resto WhatsApp Bot - Corporate Admin Portal',
  description: 'Enterprise WhatsApp Automated Ordering Bot & F&B Store Management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="light">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
