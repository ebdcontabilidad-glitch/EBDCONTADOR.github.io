/**
 * EBD · Actualización automática de noticias
 * -------------------------------------------------------------
 * Descarga titulares de fuentes RSS, los clasifica en las 4 categorías del
 * sitio y escribe data/noticias.json. Lo ejecuta GitHub Actions cada día
 * (ver .github/workflows/actualizar-noticias.yml); también puede correrlo
 * a mano con:   node scripts/actualizar-noticias.mjs
 *
 * Sin dependencias: solo Node 18+ (fetch incluido).
 * Si una fuente falla se ignora; si fallan casi todas, se conserva el
 * archivo anterior para que el sitio nunca se quede vacío.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SALIDA = fileURLToPath(new URL('../data/noticias.json', import.meta.url));

// Búsqueda de Google Noticias (México, español). "when:3d" = últimos 3 días.
const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:3d')}&hl=es-419&gl=MX&ceid=MX:es-419`;

/* ---------- FUENTES (edítelas libremente) ----------
   categoria: 'fiscal' | 'economia' | 'finanzas' | 'reformas' | 'auto'
   'auto' clasifica cada nota por palabras clave (útil para RSS de un periódico). */
export const FUENTES = [
  { categoria: 'fiscal',   url: gnews('SAT (RESICO OR ISR OR IVA OR CFDI OR contribuyentes OR "declaración anual")') },
  { categoria: 'fiscal',   url: gnews('"Servicio de Administración Tributaria" México') },
  { categoria: 'economia', url: gnews('México economía (Banxico OR INEGI OR inflación OR PIB OR "tipo de cambio")') },
  { categoria: 'finanzas', url: gnews('México (empresas OR BMV OR "Bolsa Mexicana" OR financiamiento OR "resultados trimestrales")') },
  { categoria: 'reformas', url: gnews('("Diario Oficial de la Federación" OR "Resolución Miscelánea Fiscal" OR "reforma fiscal" OR "Paquete Económico") México') },
  // Ejemplo de RSS directo de un medio (descoméntelo si su URL responde):
  // { categoria: 'auto', url: 'https://www.ejemplo.com.mx/rss/economia.xml' },
];

const POR_CATEGORIA = 12;   // máximo de notas por categoría
const DIAS_MAX = 7;         // descarta notas más antiguas
const MINIMO_PARA_GUARDAR = 5;

const REGLAS = [
  ['reformas', /reforma|miscel[aá]nea|decreto|diario oficial|\bdof\b|iniciativa|paquete econ[oó]mico|ley de ingresos/i],
  ['fiscal',   /\bsat\b|\bisr\b|\biva\b|ieps|resico|cfdi|fiscal|declaraci[oó]n|contribuyente|impuesto|prodecon/i],
  ['finanzas', /empresa|corporativ|bolsa|\bbmv\b|cr[eé]dito|financiamiento|inversi[oó]n|utilidad|fusi[oó]n|acciones/i],
  ['economia', /./],
];
export const clasificar = t => REGLAS.find(([, re]) => re.test(t))[0];

/* ---------- Parser RSS/Atom mínimo ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodificar = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const sinHtml = s => decodificar(decodificar(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const etiqueta = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? m[1] : ''; };

export function parsear(xml, categoria) {
  const bloques = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => m[2]);
  return bloques.map(b => {
    let titulo = sinHtml(etiqueta(b, 'title'));
    let enlace = sinHtml(etiqueta(b, 'link')) || (b.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    const fuente = sinHtml(etiqueta(b, 'source'));
    const fecha = sinHtml(etiqueta(b, 'pubDate') || etiqueta(b, 'published') || etiqueta(b, 'updated') || etiqueta(b, 'dc:date'));
    // Google Noticias agrega " - Medio" al final del título
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    let extracto = sinHtml(etiqueta(b, 'description') || etiqueta(b, 'summary'));
    if (fuente) extracto = extracto.replace(new RegExp(`\\s*${fuente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');
    // En Google Noticias el "extracto" suele repetir el título: se descarta
    if (!extracto || extracto.toLowerCase().startsWith(titulo.toLowerCase().slice(0, 40))) extracto = '';
    if (extracto.length > 220) extracto = extracto.slice(0, 217).replace(/\s+\S*$/, '') + '…';
    const f = new Date(fecha);
    return {
      titulo, enlace, fuente, extracto,
      fecha: isNaN(f) ? null : f.toISOString(),
      categoria: categoria === 'auto' ? clasificar(titulo + ' ' + extracto) : categoria,
    };
  }).filter(n => n.titulo && /^https?:\/\//.test(n.enlace));
}

const clave = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 9).join(' ');

async function descargar({ url, categoria }) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (EBD-noticias; +https://github.com)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parsear(await r.text(), categoria);
}

export function combinar(listas, ahora = Date.now()) {
  const vistos = new Set(), cuenta = {};
  return listas.flat()
    .filter(n => !n.fecha || ahora - new Date(n.fecha) < DIAS_MAX * 864e5)
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
    .filter(n => { const k = clave(n.titulo); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .filter(n => (cuenta[n.categoria] = (cuenta[n.categoria] || 0) + 1) <= POR_CATEGORIA);
}

async function main() {
  const res = await Promise.allSettled(FUENTES.map(descargar));
  res.forEach((r, i) => console.log(r.status === 'fulfilled' ? `✔ ${r.value.length} notas · ${FUENTES[i].categoria}` : `✖ ${FUENTES[i].categoria}: ${r.reason.message}`));
  const items = combinar(res.filter(r => r.status === 'fulfilled').map(r => r.value));

  if (items.length < MINIMO_PARA_GUARDAR) {
    console.warn(`Solo ${items.length} notas: se conserva el archivo anterior.`);
    return;
  }
  let anterior = null;
  try { anterior = JSON.parse(await readFile(SALIDA, 'utf8')); } catch {}
  if (anterior && JSON.stringify(anterior.items) === JSON.stringify(items)) { console.log('Sin cambios.'); return; }

  await mkdir(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
  await writeFile(SALIDA, JSON.stringify({ generadoEn: new Date().toISOString(), total: items.length, items }, null, 2) + '\n');
  console.log(`Guardadas ${items.length} notas en data/noticias.json`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
