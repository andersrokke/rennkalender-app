// Røyktest: åpner appen i en usynlig nettleser som trener og løper, på bred
// og smal skjerm, og feiler hvis en side er tom eller konsollen har feil.
// Kjøres med: npm run test:smoke   (og av git-kroken før push)
//
// Bruker forhåndsvisningen med testdata (scripts/preview), en Vite-server på
// en ledig port, og Chrome i headless-modus. Chrome skriver konsollen til
// stderr med --enable-logging, så vi slipper et eget nettleserbibliotek.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
if (!CHROME) { console.log('Fant ikke Chrome - hopper over røyktesten.'); process.exit(0) }

const port = await new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
execFileSync('npm', ['run', 'test:ui:data'], { stdio: 'ignore' })
const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const rydd = () => { vite.kill(); try { execFileSync('npm', ['run', 'test:ui:clean'], { stdio: 'ignore' }) } catch {} }
process.on('exit', rydd)

// Vent til serveren svarer.
for (let i = 0; i < 40; i++) {
  try { await fetch(`http://localhost:${port}/preview.html`); break } catch { await new Promise(r => setTimeout(r, 250)) }
}

// [navn, adresse, bredde, tekst som må finnes]
const SIDER = [
  ['trener hjem', '?app=oscar', 1440, 'Slik virker det'],
  ['trener løpere', '?app=oscar#athletes', 1440, 'Løpere'],
  ['trener sesongoppsett', '?app=oscar#matrix', 1440, 'Venter på deg'],
  ['trener treningslogg', '?app=oscar#training', 1440, 'Tidtaking'],
  ['løper hjem', '?app=lukas', 1440, 'Neste renn'],
  ['løper min sesong', '?app=lukas#mine', 1440, 'Min sesong'],
  ['løper utvikling', '?app=lukas#dev', 1440, 'Min utvikling'],
  ['løper mobil', '?app=lukas', 390, 'Meny'],
  ['trener mobil', '?app=oscar', 390, 'Meny'],
  ['alle skjermer', '', 1440, 'Alle skjermer']
]

let feil = 0
for (const [navn, adr, bredde, tekst] of SIDER) {
  const url = `http://localhost:${port}/preview.html${adr}`
  let dom = '', logg = ''
  try {
    const r = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0',
      `--window-size=${bredde},1200`, '--virtual-time-budget=8000', '--dump-dom', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 })
    dom = r
  } catch (e) { dom = String(e.stdout || ''); logg = String(e.stderr || '') }
  // Chrome legger konsollen i stderr også når alt går bra; hent den uansett.
  if (!logg) {
    try { logg = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--enable-logging=stderr', '--v=0', `--window-size=${bredde},1200`, '--virtual-time-budget=8000', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 }).toString() } catch (e) { logg = String(e.stderr || '') }
  }
  const konsollFeil = logg.split('\n').filter(l => /CONSOLE/.test(l) && /Uncaught|TypeError|ReferenceError|is not defined|Minified React error|The above error/.test(l))
  const tom = dom.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length < 200
  const mangler = !dom.includes(tekst)
  const ok = !konsollFeil.length && !tom && !mangler
  console.log(`${ok ? 'OK    ' : 'FEIL  '}${navn} (${bredde}px)${tom ? ' - siden er tom' : ''}${mangler ? ` - fant ikke «${tekst}»` : ''}`)
  konsollFeil.slice(0, 3).forEach(l => console.log('        ' + l.replace(/^.*CONSOLE/, 'CONSOLE').slice(0, 200)))
  if (!ok) feil++
}
console.log(feil ? `\n${feil} sider feilet` : '\nAlle sider åpner uten feil')
process.exit(feil ? 1 : 0)
