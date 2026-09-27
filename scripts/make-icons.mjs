// Lager PNG-ikonene fra public/logo.svg.
//
//   npx --yes sharp-cli@5 --help   # nei - sharp brukes som bibliotek:
//   npm i --no-save sharp && node scripts/make-icons.mjs
//
// sharp står ikke i package.json med vilje: ikonene endres sjelden, og en
// binær avhengighet på 30 MB hører ikke hjemme i hver eneste Netlify-bygging.
//
// Maskable-varianten har luft rundt: Android kan klippe ikonet til en sirkel,
// og da må alt viktig ligge innenfor de midterste 80 prosentene.

import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/logo.svg')

// Luft rundt merket, uten å miste bakgrunnsfargen: merket skaleres ned inne i
// sin egen ramme i stedet for å legges på en gjennomsiktig kant.
function medLuft(andel) {
  const s = readFileSync('public/logo.svg', 'utf8')
  const kropp = s.slice(s.indexOf('<rect width="512"'), s.lastIndexOf('</svg>'))
  const bak = kropp.slice(0, kropp.indexOf('/>') + 2)
  const resten = kropp.slice(kropp.indexOf('/>') + 2)
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
       ${s.slice(s.indexOf('<defs>'), s.indexOf('</defs>') + 7)}
       ${bak.replace('rx="112"', 'rx="0"')}
       <g transform="translate(256 256) scale(${1 - andel}) translate(-256 -256)">${resten}</g>
     </svg>`)
}

const jobber = [
  ['public/icon-192.png', svg, 192],
  ['public/icon-512.png', svg, 512],
  ['public/apple-touch-icon.png', svg, 180],
  ['public/icon-maskable-512.png', medLuft(0.2), 512],
  ['public/google-logo-120.png', svg, 120]
]
for (const [fil, kilde, str] of jobber) {
  await sharp(kilde, { density: 600 }).resize(str, str).png({ compressionLevel: 9 }).toFile(fil)
  console.log(`${fil} (${str}px)`)
}
