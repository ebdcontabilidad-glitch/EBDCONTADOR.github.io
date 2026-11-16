/**
 * EBD · Índice del blog
 * Lee los artículos que el panel de administración guarda en content/blog/*.json
 * y genera data/blog.json, que el sitio muestra. Lo ejecuta GitHub Actions en
 * cada publicación (.github/workflows/publicar-sitio.yml). Manual:  node scripts/generar-blog.mjs
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CARPETA = fileURLToPath(new URL('../content/blog/', import.meta.url));
const SALIDA = fileURLToPath(new URL('../data/blog.json', import.meta.url));

const texto = md => String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`|~-]/g, ' ').replace(/\s+/g, ' ').trim();

let archivos = [];
try { archivos = (await readdir(CARPETA)).filter(f => f.endsWith('.json')); } catch {}

const posts = [];
for (const f of archivos) {
  try {
    const p = JSON.parse(await readFile(CARPETA + f, 'utf8'));
    if (p.publicado === false || !p.titulo) continue;
    const plano = texto(p.body);
    const fecha = new Date(p.fecha);
    posts.push({
      slug: f.replace(/\.json$/, ''),
      titulo: p.titulo,
      fecha: isNaN(fecha) ? null : fecha.toISOString(),
      autor: p.autor || 'EBD Contadores Públicos',
      extracto: p.extracto || (plano.length > 180 ? plano.slice(0, 177).replace(/\s+\S*$/, '') + '…' : plano),
      etiquetas: Array.isArray(p.etiquetas) ? p.etiquetas.filter(Boolean) : [],
      portada: p.portada || '',
      minutos: Math.max(1, Math.round(plano.split(' ').length / 200)),
      cuerpo: p.body || ''
    });
  } catch (e) { console.warn(`✖ ${f}: ${e.message}`); }
}
posts.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

await mkdir(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
await writeFile(SALIDA, JSON.stringify({ generadoEn: new Date().toISOString(), posts }, null, 2) + '\n');
console.log(`Blog: ${posts.length} artículo(s) publicados en data/blog.json`);
