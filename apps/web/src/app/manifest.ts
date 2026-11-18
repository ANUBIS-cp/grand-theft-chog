import type { MetadataRoute } from 'next';

// The site as an app on your phone's home screen: needed for raid alerts on iPhone (iOS only lets an installed
// app send notifications) and opens straight into the city.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Grand Theft Chog',
    short_name: 'Grand Theft Chog',
    description: 'Rob rival gangs, run it home, and get a ping when someone robs yours.',
    start_url: '/play',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b0918',
    theme_color: '#0b0918',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
