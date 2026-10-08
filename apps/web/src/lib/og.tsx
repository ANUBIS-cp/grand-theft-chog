import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Shared parts of the 1200x630 share images.

export async function chogPng(id: number): Promise<string> {
  const dir = process.env.IMAGES_DIR;
  const webp = dir
    ? await readFile(`${dir}/640/${id}.webp`)
    : Buffer.from(
        await (await fetch(`https://chogcity.35-212-31-75.sslip.io/img/640/${id}.webp`)).arrayBuffer(),
      );
  const png = await sharp(webp).resize(470, 470).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Koulen's "1" looks like "I", so digits are drawn in Anton and everything else in Koulen. */
export function T({ text, style }: { text: string; style: React.CSSProperties }) {
  const runs = text.match(/\d+|\D+/g) ?? [];
  return (
    <div style={{ display: 'flex', alignItems: 'center', ...style }}>
      {runs.map((r, i) => (
        <span
          key={i}
          style={
            /\d/.test(r)
              ? { fontFamily: 'Anton', fontSize: '0.88em', whiteSpace: 'pre' }
              : { fontFamily: 'Koulen', whiteSpace: 'pre' }
          }
        >
          {r}
        </span>
      ))}
    </div>
  );
}

/** Koulen and Anton (SIL Open Font License). public/ sits next to the server in dev and in the standalone build. */
export async function ogFonts() {
  const [koulen, anton] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/koulen.woff')),
    readFile(join(process.cwd(), 'public/fonts/anton.woff')),
  ]);
  return [
    { name: 'Koulen', data: koulen, weight: 400 as const, style: 'normal' as const },
    { name: 'Anton', data: anton, weight: 400 as const, style: 'normal' as const },
  ];
}
