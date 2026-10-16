import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Koulen } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const koulen = Koulen({ weight: '400', subsets: ['latin'], variable: '--font-koulen', display: 'swap' });
// On Apple devices the interface uses San Francisco (system font); Inter and Nunito stand in elsewhere.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Nunito (SIL Open Font License), kept in the repo: Google's copy broke the server's build on 16 Oct.
const nunito = localFont({
  src: './fonts/nunito-latin.woff2',
  weight: '700 900',
  variable: '--font-nunito',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Chog World',
  description:
    'Every gang has a vault full of cash. Sneak your Chog into a rival’s vault, grab what you can, get out.',
};

export const viewport: Viewport = {
  themeColor: '#0b0918',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${koulen.variable} ${inter.variable} ${nunito.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
