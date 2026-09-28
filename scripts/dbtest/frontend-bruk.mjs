// Finner hver tabell, hver operasjon og hver RPC frontend faktisk kaller,
// så rettighetsrevisjonen i run.mjs sjekker det som brukes - ikke en liste
// noen må huske å oppdatere.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function hentBruk(repo) {
  const mappe = join(repo, 'src', 'components')
  const filer = readdirSync(mappe).filter(f => /\.jsx?$/.test(f)).map(f => join(mappe, f))
    .concat([join(repo, 'src', 'App.jsx')])
  const tab = {}, rpc = {}
  for (const f of filer) {
    const s = readFileSync(f, 'utf8').replace(/\s+/g, ' ')
    for (const m of s.matchAll(/\.from\((?:"|')([a-z_]+)(?:"|')\)((?:\s*\.[a-zA-Z]+\([^()]*(?:\([^()]*\))?[^()]*\))*)/g)) {
      const ops = [...(m[2] || '').matchAll(/\.(select|insert|update|delete|upsert)\(/g)].map(x => x[1])
      tab[m[1]] = tab[m[1]] || new Set(); (ops.length ? ops : ['?']).forEach(o => tab[m[1]].add(o))
    }
    for (const m of s.matchAll(/\.rpc\((?:"|')([a-z_]+)(?:"|')/g)) rpc[m[1]] = 1
  }
  return { tabeller: Object.fromEntries(Object.entries(tab).map(([k, v]) => [k, [...v].sort()])),
    rpc: Object.keys(rpc).sort() }
}
