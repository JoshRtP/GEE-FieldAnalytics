import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/Header';
import { TabNav } from '@/components/layout/TabNav';
import { ClientProviders } from '@/components/layout/ClientProviders';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FieldAnalytics Enterprise | TerraNexus',
  description: 'EMEA Field Analytics Platform — cover crop and tillage proxy classification',
  icons: { icon: '/star_favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientProviders>
          <div className="flex h-screen flex-col overflow-hidden bg-background">
            <Header />
            <TabNav />
            <main className="flex flex-1 flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </ClientProviders>
        <Toaster />
      </body>
    </html>
  );
}
