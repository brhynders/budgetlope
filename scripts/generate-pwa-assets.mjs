// Generates iOS PWA assets from public/icon.svg:
//   public/apple-touch-icon.png        — 180x180 home-screen icon (full-bleed;
//                                        iOS applies its own corner mask)
//   public/splash/*.png                — apple-touch-startup-image launch
//                                        screens, portrait, per device size
//
// Run: npm run assets   (re-run whenever icon.svg changes)

import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const iconSvg = await readFile(`${root}public/icon.svg`, 'utf8')

// iOS masks its own rounded corners onto apple-touch-icon; keep ours square
// so the mask doesn't reveal transparent corners.
const squareIcon = iconSvg.replace('rx="96"', 'rx="0"')
await sharp(Buffer.from(squareIcon), { density: 300 })
  .resize(180, 180)
  .png()
  .toFile(`${root}public/apple-touch-icon.png`)
console.log('apple-touch-icon.png')

// Logical CSS size + device pixel ratio, portrait. Keep in sync with the
// apple-touch-startup-image tags in index.html.
const devices = [
  // iPhones
  { w: 375, h: 667, dpr: 2 }, // SE 2/3
  { w: 414, h: 736, dpr: 3 }, // 8 Plus
  { w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro/12-13 mini
  { w: 414, h: 896, dpr: 2 }, // XR/11
  { w: 414, h: 896, dpr: 3 }, // XS Max/11 Pro Max
  { w: 390, h: 844, dpr: 3 }, // 12/13/14
  { w: 428, h: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 393, h: 852, dpr: 3 }, // 14 Pro, 15, 16
  { w: 430, h: 932, dpr: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 402, h: 874, dpr: 3 }, // 16 Pro, 17
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max, 17 Pro Max
  // iPads
  { w: 768, h: 1024, dpr: 2 },
  { w: 810, h: 1080, dpr: 2 },
  { w: 820, h: 1180, dpr: 2 },
  { w: 834, h: 1194, dpr: 2 },
  { w: 1024, h: 1366, dpr: 2 },
]

await mkdir(`${root}public/splash`, { recursive: true })

for (const d of devices) {
  const w = d.w * d.dpr
  const h = d.h * d.dpr
  // 112pt icon, dead-center — matches the #splash overlay in index.html so
  // the handoff from launch image to page is seamless
  const iconPx = 112 * d.dpr
  const icon = await sharp(Buffer.from(iconSvg), { density: 300 })
    .resize(iconPx, iconPx)
    .png()
    .toBuffer()
  await sharp({ create: { width: w, height: h, channels: 3, background: '#0c110f' } })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(`${root}public/splash/apple-splash-${w}x${h}.png`)
  console.log(`splash/apple-splash-${w}x${h}.png`)
}
