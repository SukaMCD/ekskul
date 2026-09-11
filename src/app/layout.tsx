import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leafly Resto - AI Automation & Commerce Admin Portal',
  description: 'Leafly Resto - Automated Ordering Bot & F&B Management System',
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
