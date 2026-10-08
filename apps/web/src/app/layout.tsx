import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono, Koulen } from 'next/font/google';
import './globals.css';

const koulen = Koulen({ weight: '400', subsets: ['latin'], variable: '--font-koulen', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Chog City',
  description: 'Every gang has a vault full of cash. Sneak your Chog into a rival’s vault, grab what you can, get out.',
};

export const viewport: Viewport = { themeColor: '#0b0918', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${koulen.variable} ${archivo.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
