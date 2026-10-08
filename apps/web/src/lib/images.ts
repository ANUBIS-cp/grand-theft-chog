/** Chog images are pre-sized on the server (WebP) and keyed by token ID. */
export type ImageSize = 96 | 256 | 640;

export function chogImage(id: number, size: ImageSize): string {
  return `/img/${size}/${id}.webp`;
}
