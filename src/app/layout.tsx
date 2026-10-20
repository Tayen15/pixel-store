import type { Metadata } from 'next';
import '@/styles/global.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'https://pixelstore.id'),
  title: {
    default: 'Pixel Store — Toko Layanan Akun Digital & Langganan Premium',
    template: '%s | Pixel Store',
  },
  description:
    'Pixel Store adalah toko digital penyedia berbagai layanan akun premium, tools produktivitas, dan kebutuhan software digital terpercaya dengan transaksi cepat serta aktivasi instan otomatis.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Pixel Store — Toko Layanan Akun Digital & Langganan Premium',
    description:
      'Toko digital penyedia berbagai kebutuhan akun langganan premium, tools, dan software terpercaya dengan proses pemesanan mudah serta aktivasi langsung instan.',
    siteName: 'Pixel Store',
    locale: 'id_ID',
    type: 'website',
    images: [
      {
        url: '/logo-app.png',
        width: 512,
        height: 512,
        alt: 'Pixel Store Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Pixel Store — Toko Layanan Akun Digital & Langganan Premium',
    description:
      'Toko digital penyedia berbagai kebutuhan akun langganan premium, tools, dan software terpercaya dengan transaksi cepat serta aktivasi instan.',
    images: ['/logo-app.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const stored = localStorage.getItem('pixel_theme');
                  if (stored === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else if (stored === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 min-h-screen antialiased selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
        {children}
      </body>
    </html>
  );
}
