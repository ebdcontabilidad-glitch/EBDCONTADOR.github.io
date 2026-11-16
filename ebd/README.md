# Sitio web · EBD Contadores Públicos y Profesionales Asociados

**Para ponerlo en marcha, siga `GUIA-DE-ACTIVACION.md`.**

```
index.html                         el sitio: apartados con transiciones y logo animado
admin/                             panel de administración (blog, datos del despacho, reformas)
content/blog/                      artículos del blog (los crea el panel)
data/noticias.json                 noticias del día (las descarga la tarea automática)
data/blog.json                     índice del blog (se genera al publicar)
data/sitio.json                    datos de contacto, redes, cédulas (editables en el panel)
data/reformas.json                 fechas de reforma de Consulta de Leyes (editables en el panel)
img/                               logotipo (SVG y PNG), favicon e imagen para redes
images/blog/                       imágenes que sube desde el panel
scripts/actualizar-noticias.mjs    descarga y clasifica las noticias
scripts/generar-blog.mjs           arma el índice del blog
.github/workflows/publicar-sitio.yml  publica en GitHub Pages: al guardar y 2 veces al día
INSTALACION/publicar-sitio.yml        copia visible de la tarea anterior (Paso 6 de la guía)
```

## Cambiar las fuentes de noticias
Edite la lista `FUENTES` al inicio de `scripts/actualizar-noticias.mjs`. Por defecto usa búsquedas de
Google Noticias México por categoría. Para agregar el RSS directo de un medio, use `categoria: 'auto'`
y la nota se clasificará por palabras clave.

## Ver el sitio en su computadora
Si abre `index.html` con doble clic, el navegador no deja leer los archivos de `data/`. Use un servidor
local, por ejemplo `npx serve .` o `python -m http.server`, y abra la dirección que le indique.
