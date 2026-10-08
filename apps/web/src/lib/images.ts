/** Chog images are pre-sized on the server and keyed by token ID. */
export type ImageSize = 96 | 256 | 640;

export function chogImage(id: number, size: ImageSize, format: 'avif' | 'webp' = 'webp'): string {
  return `/img/${size}/${id}.${format}`;
}
