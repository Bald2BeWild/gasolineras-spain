#!/usr/bin/env node
/**
 * generate-cities.js
 * Genera páginas HTML estáticas para las principales ciudades españolas.
 * Cada página tiene contenido real indexable por Google:
 * - Precio medio de cada carburante en la ciudad hoy
 * - Lista de las 10 gasolineras más baratas
 * - Metadatos SEO (title, description, schema.org)
 * - Enlace canónico a la app principal con la ciudad preseleccionada
 */

const fs   = require('fs');
const path = require('path');

// Ciudades para las que generamos página
const CITIES = [
  { name: 'Madrid',      slug: 'madrid',      lat: 40.4168, lng: -3.7038, prov: 'Madrid' },
  { name: 'Barcelona',   slug: 'barcelona',   lat: 41.3874, lng:  2.1686, prov: 'Barcelona' },
  { name: 'Valencia',    slug: 'valencia',    lat: 39.4699, lng: -0.3763, prov: 'Valencia/València' },
  { name: 'Sevilla',     slug: 'sevilla',     lat: 37.3886, lng: -5.9823, prov: 'Sevilla' },
  { name: 'Zaragoza',    slug: 'zaragoza',    lat: 41.6488, lng: -0.8891, prov: 'Zaragoza' },
  { name: 'Málaga',      slug: 'malaga',      lat: 36.7213, lng: -4.4214, prov: 'Málaga' },
  { name: 'Bilbao',      slug: 'bilbao',      lat: 43.2630, lng: -2.9350, prov: 'Bizkaia' },
  { name: 'Alicante',    slug: 'alicante',    lat: 38.3452, lng: -0.4815, prov: 'Alicante/Alacant' },
  { name: 'Córdoba',     slug: 'cordoba',     lat: 37.8882, lng: -4.7794, prov: 'Córdoba' },
  { name: 'Murcia',      slug: 'murcia',      lat: 37.9922, lng: -1.1307, prov: 'Murcia' },
  { name: 'Valladolid',  slug: 'valladolid',  lat: 41.6523, lng: -4.7245, prov: 'Valladolid' },
  { name: 'Palma',       slug: 'palma',       lat: 39.5696, lng:  2.6502, prov: 'Illes Balears' },
  { name: 'Las Palmas',  slug: 'las-palmas',  lat: 28.1248, lng:-15.4300, prov: 'Las Palmas' },
  { name: 'A Coruña',    slug: 'a-coruna',    lat: 43.3623, lng: -8.4115, prov: 'A Coruña' },
  { name: 'Granada',     slug: 'granada',     lat: 37.1773, lng: -3.5986, prov: 'Granada' },
  { name: 'Vigo',        slug: 'vigo',        lat: 42.2314, lng: -8.7124, prov: 'Pontevedra' },
  { name: 'Santander',   slug: 'santander',   lat: 43.4623, lng: -3.8099, prov: 'Cantabria' },
  { name: 'Pamplona',    slug: 'pamplona',    lat: 42.8188, lng: -1.6440, prov: 'Navarra' },
  { name: 'San Sebastián', slug: 'san-sebastian', lat: 43.3183, lng: -1.9812, prov: 'Gipuzkoa' },
  { name: 'Burgos',      slug: 'burgos',      lat: 42.3440, lng: -3.6970, prov: 'Burgos' },
  { name: 'Salamanca',   slug: 'salamanca',   lat: 40.9701, lng: -5.6635, prov: 'Salamanca' },
  { name: 'Toledo',      slug: 'toledo',      lat: 39.8628, lng: -4.0273, prov: 'Toledo' },
  { name: 'Albacete',    slug: 'albacete',    lat: 38.9942, lng: -1.8564, prov: 'Albacete' },
  { name: 'Huelva',      slug: 'huelva',      lat: 37.2614, lng: -6.9447, prov: 'Huelva' },
  { name: 'Cádiz',       slug: 'cadiz',       lat: 36.5271, lng: -6.2886, prov: 'Cádiz' },
];

const FUELS = {
  G95:  { field: 'Precio Gasolina 95 E5',                  label: 'Gasolina 95 E5',  color: '#f59e0b' },
  G98:  { field: 'Precio Gasolina 98 E5',                  label: 'Gasolina 98 E5',  color: '#f97316' },
  GOA:  { field: 'Precio Gasoleo A',                       label: 'Gasóleo A',       color: '#3b82f6' },
  GOP:  { field: 'Precio Gasoleo Premium',                 label: 'Gasóleo Premium', color: '#8b5cf6' },
  GLP:  { field: 'Precio Gases licuados del petróleo',     label: 'GLP',             color: '#10b981' },
};

const SITE_URL = 'https://bald2bewild.github.io/gasolineras-spain'; // ← cambia por tu dominio si tienes uno

function haversine(la1, ln1, la2, ln2) {
  const R = 6371;
  const a = Math.sin((la2-la1)*Math.PI/360)**2
    + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin((ln2-ln1)*Math.PI/360)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parsePrice(str) {
  if (!str) return null;
  const v = parseFloat(str.replace(',', '.'));
  return isNaN(v) || v <= 0 ? null : v;
}

function fmt(n) { return n != null ? n.toFixed(3) + ' €/L' : '—'; }

function generateCityPage(city, stations, date) {
  // Estaciones en un radio de 15km del centro de la ciudad
  const nearby = stations
    .map(s => {
      const lat = parseFloat((s['Latitud']||'').replace(',','.'));
      const lng = parseFloat((s['Longitud (WGS84)']||'').replace(',','.'));
      if (!lat || !lng) return null;
      return { ...s, lat, lng, dist: haversine(city.lat, city.lng, lat, lng) };
    })
    .filter(s => s && s.dist <= 15)
    .sort((a, b) => a.dist - b.dist);

  if (nearby.length < 3) return null; // no hay suficientes datos

  // Calcular estadísticas por carburante
  const cityStats = {};
  for (const [key, info] of Object.entries(FUELS)) {
    const vals = nearby.map(s => parsePrice(s[info.field])).filter(v => v != null);
    if (vals.length) {
      cityStats[key] = {
        avg: +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3),
        min: +Math.min(...vals).toFixed(3),
        max: +Math.max(...vals).toFixed(3),
        count: vals.length,
        label: info.label,
        color: info.color,
      };
    }
  }

  // Top 10 más baratas en G95 (o GOA si no hay G95)
  const mainFuel = cityStats.G95 ? 'G95' : 'GOA';
  const mainField = FUELS[mainFuel].field;
  const top10 = nearby
    .filter(s => parsePrice(s[mainField]) != null)
    .sort((a, b) => parsePrice(a[mainField]) - parsePrice(b[mainField]))
    .slice(0, 10);

  const dateFormatted = new Date(date).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Precio más bajo de G95 para el title/description
  const minG95 = cityStats.G95?.min;
  const minGOA = cityStats.GOA?.min;
  const cheapStr = minG95 ? `desde ${minG95.toFixed(3)} €/L` : minGOA ? `desde ${minGOA.toFixed(3)} €/L` : '';

  // ── HTML ────────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gasolineras baratas en ${city.name} hoy ${new Date(date).toLocaleDateString('es-ES', {day:'numeric',month:'long'})} — Precios ${cheapStr}</title>
<meta name="description" content="Encuentra la gasolina más barata en ${city.name} hoy ${dateFormatted}. ${cityStats.G95 ? `Gasolina 95 desde ${cityStats.G95.min.toFixed(3)} €/L` : ''}${cityStats.GOA ? `, gasóleo desde ${cityStats.GOA.min.toFixed(3)} €/L` : ''}. Precios en tiempo real de ${nearby.length} gasolineras.">
<link rel="canonical" href="${SITE_URL}/ciudades/${city.slug}.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<!-- Open Graph -->
<meta property="og:title" content="Gasolineras baratas en ${city.name} — ${dateFormatted}">
<meta property="og:description" content="Los mejores precios de combustible en ${city.name}. Actualizado hoy.">
<meta property="og:url" content="${SITE_URL}/ciudades/${city.slug}.html">
<meta property="og:type" content="website">

<!-- Schema.org: Dataset de precios -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Precios de carburantes en ${city.name} — ${dateFormatted}",
  "description": "Precios de gasolina y gasóleo en ${city.name} actualizados el ${dateFormatted}",
  "url": "${SITE_URL}/ciudades/${city.slug}.html",
  "dateModified": "${date}",
  "spatialCoverage": {
    "@type": "Place",
    "name": "${city.name}, España"
  }
}
</script>

<!-- Schema.org: FAQPage para rich snippets -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "¿Cuál es el precio de la gasolina 95 en ${city.name} hoy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${cityStats.G95 ? `El precio medio de la gasolina 95 en ${city.name} hoy es ${cityStats.G95.avg.toFixed(3)} €/L. El más barato está a ${cityStats.G95.min.toFixed(3)} €/L.` : `No hay datos disponibles para gasolina 95 en ${city.name}.`}"
      }
    },
    {
      "@type": "Question",
      "name": "¿Cuál es el precio del gasóleo en ${city.name} hoy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${cityStats.GOA ? `El precio medio del gasóleo A en ${city.name} hoy es ${cityStats.GOA.avg.toFixed(3)} €/L. El más barato está a ${cityStats.GOA.min.toFixed(3)} €/L.` : `No hay datos disponibles para gasóleo en ${city.name}.`}"
      }
    }
  ]
}
</script>

<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#f8fafc;color:#0f172a;line-height:1.6}
  a{color:#1a56db;text-decoration:none}
  a:hover{text-decoration:underline}
  .container{max-width:860px;margin:0 auto;padding:0 20px}

  /* Header */
  .site-header{background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 0;
    box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .site-header .container{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .site-logo{font-size:16px;font-weight:700;color:#1a56db}
  .btn-app{background:#1a56db;color:#fff;padding:8px 16px;border-radius:8px;
    font-size:13px;font-weight:600;transition:opacity .15s}
  .btn-app:hover{opacity:.88;text-decoration:none}

  /* Hero */
  .hero{background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;
    padding:40px 0 32px;margin-bottom:32px}
  .hero h1{font-size:clamp(22px,4vw,32px);font-weight:800;margin-bottom:8px;line-height:1.2}
  .hero .updated{font-size:12px;opacity:.8;margin-top:8px}
  .hero .subtitle{font-size:15px;opacity:.9;margin-top:6px}

  /* Stats grid */
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:32px}
  .stat-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;
    padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.05)}
  .stat-fuel{font-size:12px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
  .stat-min{font-size:22px;font-weight:800;color:#16a34a;font-variant-numeric:tabular-nums}
  .stat-avg{font-size:11px;color:#64748b;margin-top:4px}
  .stat-label{font-size:10px;color:#94a3b8;margin-top:2px}

  /* Table */
  h2{font-size:18px;font-weight:700;margin-bottom:16px;color:#0f172a}
  .table-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;
    margin-bottom:32px;box-shadow:0 1px 4px rgba(0,0,0,.05)}
  table{width:100%;border-collapse:collapse}
  th{background:#f8fafc;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;
    color:#64748b;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0}
  td{padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#f8fafc}
  .price-val{font-weight:700;font-variant-numeric:tabular-nums;color:#0f172a}
  .price-best{color:#16a34a}
  .dist-val{font-size:11px;color:#94a3b8;font-variant-numeric:tabular-nums}
  .brand-name{font-weight:600}
  .addr{font-size:11px;color:#64748b;margin-top:1px}

  /* CTA */
  .cta-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;
    padding:24px;text-align:center;margin-bottom:32px}
  .cta-box h3{font-size:16px;font-weight:700;margin-bottom:8px;color:#1e40af}
  .cta-box p{font-size:13px;color:#3b82f6;margin-bottom:16px}
  .btn-cta{display:inline-block;background:#1a56db;color:#fff;padding:11px 24px;
    border-radius:10px;font-size:14px;font-weight:700;transition:opacity .15s}
  .btn-cta:hover{opacity:.88;text-decoration:none}

  /* FAQ */
  .faq{margin-bottom:32px}
  .faq h2{margin-bottom:16px}
  .faq-item{background:#fff;border:1px solid #e2e8f0;border-radius:10px;
    padding:16px 20px;margin-bottom:10px}
  .faq-q{font-weight:700;font-size:14px;margin-bottom:6px}
  .faq-a{font-size:13px;color:#475569;line-height:1.6}

  /* Cities nav */
  .cities-nav{margin-bottom:40px}
  .cities-nav h2{margin-bottom:14px}
  .city-chips{display:flex;flex-wrap:wrap;gap:8px}
  .city-chip{padding:6px 14px;border:1px solid #e2e8f0;border-radius:20px;
    font-size:12px;font-weight:500;color:#475569;background:#fff;transition:all .15s}
  .city-chip:hover{border-color:#1a56db;color:#1a56db;text-decoration:none}
  .city-chip.current{background:#eff6ff;border-color:#1a56db;color:#1a56db;font-weight:700}

  /* Footer */
  footer{background:#1e293b;color:#94a3b8;padding:24px 0;font-size:12px;text-align:center}
  footer a{color:#60a5fa}

  @media(max-width:600px){
    th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){display:none}
    .hero{padding:28px 0 22px}
  }
</style>
<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3067134215443448" crossorigin="anonymous"></script>
</head>
<body>

<header class="site-header">
  <div class="container">
    <a href="${SITE_URL}" class="site-logo">⛽ Gasolineras España</a>
    <a href="${SITE_URL}?ciudad=${encodeURIComponent(city.name)}&lat=${city.lat}&lng=${city.lng}" class="btn-app">
      🗺 Ver en el mapa
    </a>
  </div>
</header>

<section class="hero">
  <div class="container">
    <h1>⛽ Gasolineras baratas en ${city.name} hoy</h1>
    <p class="subtitle">${nearby.length} estaciones analizadas en un radio de 15 km${cheapStr ? ` · ${cheapStr}` : ''}</p>
    <p class="updated">Última actualización: ${dateFormatted}</p>
  </div>
</section>

<div class="container">

  <!-- Precios medios -->
  <h2>Precio medio por carburante en ${city.name}</h2>
  <div class="stats-grid">
    ${Object.entries(cityStats).map(([key, s]) => `
    <div class="stat-card">
      <div class="stat-fuel" style="color:${s.color}">${s.label}</div>
      <div class="stat-min">${s.min.toFixed(3)} €</div>
      <div class="stat-avg">Media: ${s.avg.toFixed(3)} €/L</div>
      <div class="stat-label">Mín. de ${s.count} estaciones</div>
    </div>`).join('')}
  </div>

  <!-- Publicidad -->
  <div style="margin-bottom:24px;text-align:center">
    <ins class="adsbygoogle"
      style="display:block"
      data-ad-client="ca-pub-3067134215443448"
      data-ad-slot="auto"
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>

  <!-- Top 10 más baratas -->
  <h2>Las ${top10.length} gasolineras más baratas en ${city.name} — ${FUELS[mainFuel].label}</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Gasolinera</th>
          <th>${FUELS[mainFuel].label}</th>
          <th>Gasóleo A</th>
          <th>Distancia</th>
        </tr>
      </thead>
      <tbody>
        ${top10.map((s, i) => {
          const p95  = parsePrice(s[FUELS[mainFuel].field]);
          const pGOA = parsePrice(s[FUELS.GOA.field]);
          const isMin95 = p95 === cityStats[mainFuel]?.min;
          return `<tr>
            <td style="color:#94a3b8;font-size:12px;font-weight:700">${i+1}</td>
            <td>
              <div class="brand-name">${s['Rótulo']||'—'}</div>
              <div class="addr">${s['Dirección']||''}, ${s['Localidad']||''}</div>
            </td>
            <td><span class="price-val${isMin95?' price-best':''}">${fmt(p95)}</span></td>
            <td><span class="price-val">${fmt(pGOA)}</span></td>
            <td><span class="dist-val">${s.dist.toFixed(1)} km</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- CTA -->
  <div class="cta-box">
    <h3>¿Quieres ver todas las gasolineras en el mapa?</h3>
    <p>Usa nuestra app gratuita para encontrar la gasolinera más barata cerca de ti en tiempo real.</p>
    <a href="${SITE_URL}?ciudad=${encodeURIComponent(city.name)}&lat=${city.lat}&lng=${city.lng}" class="btn-cta">
      🗺 Abrir mapa de ${city.name}
    </a>
  </div>

  <!-- FAQ -->
  <section class="faq">
    <h2>Preguntas frecuentes sobre precios de combustible en ${city.name}</h2>
    ${cityStats.G95 ? `
    <div class="faq-item">
      <div class="faq-q">¿Cuál es el precio de la gasolina 95 en ${city.name} hoy?</div>
      <div class="faq-a">El precio medio de la gasolina 95 sin plomo (95 E5) en ${city.name} el ${dateFormatted} es de <strong>${cityStats.G95.avg.toFixed(3)} €/L</strong>. La gasolinera más barata ofrece gasolina 95 a <strong>${cityStats.G95.min.toFixed(3)} €/L</strong> y la más cara a ${cityStats.G95.max.toFixed(3)} €/L.</div>
    </div>` : ''}
    ${cityStats.GOA ? `
    <div class="faq-item">
      <div class="faq-q">¿Cuál es el precio del gasóleo en ${city.name} hoy?</div>
      <div class="faq-a">El precio medio del gasóleo A (diésel) en ${city.name} el ${dateFormatted} es de <strong>${cityStats.GOA.avg.toFixed(3)} €/L</strong>. El precio mínimo es <strong>${cityStats.GOA.min.toFixed(3)} €/L</strong>.</div>
    </div>` : ''}
    <div class="faq-item">
      <div class="faq-q">¿Con qué frecuencia se actualizan los precios?</div>
      <div class="faq-a">Los precios se actualizan automáticamente cada mañana con los datos oficiales del <strong>Ministerio de Industria y Turismo de España</strong>. Las estaciones están obligadas a comunicar cambios de precio al Ministerio antes de aplicarlos.</div>
    </div>
    <div class="faq-item">
      <div class="faq-q">¿De dónde vienen los datos de precios?</div>
      <div class="faq-a">Los datos provienen de la API pública del <strong>Ministerio de Industria, Comercio y Turismo</strong> de España (MITECO), que publica en tiempo real los precios comunicados por las estaciones de servicio. Son los mismos datos que usa la app oficial del Gobierno.</div>
    </div>
    <div class="faq-item">
      <div class="faq-q">¿Cómo puedo encontrar la gasolinera más barata cerca de mí en ${city.name}?</div>
      <div class="faq-a">Usa <a href="${SITE_URL}?ciudad=${encodeURIComponent(city.name)}&lat=${city.lat}&lng=${city.lng}">nuestra app interactiva</a> para ver todas las gasolineras de ${city.name} en el mapa con sus precios actualizados. Puedes activar tu GPS para ordenarlas por distancia y filtrar por tipo de carburante.</div>
    </div>
  </section>

  <!-- Otras ciudades -->
  <section class="cities-nav">
    <h2>Precios de carburante en otras ciudades</h2>
    <div class="city-chips">
      ${CITIES.map(c => `<a href="./${c.slug}.html" class="city-chip${c.slug===city.slug?' current':''}">${c.name}</a>`).join('\n      ')}
    </div>
  </section>

</div>

<footer>
  <div class="container">
    <p>Datos actualizados el ${dateFormatted} · Fuente: <a href="https://geoportalgasolineras.es" target="_blank" rel="noopener">Ministerio de Industria de España</a></p>
    <p style="margin-top:6px"><a href="${SITE_URL}">Volver a la app</a> · Los precios son orientativos, pueden variar.</p>
  </div>
</footer>

</body>
</html>`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function main() {
  const dataPath = path.join(process.cwd(), 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('❌ data.json no encontrado. Ejecuta fetch-data.js primero.');
    process.exit(1);
  }

  const data     = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const stations = data.stations;
  const date     = data.date;
  const outDir   = path.join(process.cwd(), 'ciudades');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let generated = 0;
  const sitemapUrls = [`  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`];

  for (const city of CITIES) {
    const html = generateCityPage(city, stations, date);
    if (!html) { console.warn(`⚠️  ${city.name}: pocos datos, omitida`); continue; }

    const filePath = path.join(outDir, `${city.slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    generated++;
    console.log(`✅ ${city.name} → ciudades/${city.slug}.html`);

    sitemapUrls.push(
      `  <url><loc>${SITE_URL}/ciudades/${city.slug}.html</loc><changefreq>daily</changefreq><priority>0.8</priority><lastmod>${date}</lastmod></url>`
    );
  }

  // Generar sitemap.xml
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap, 'utf8');
  console.log(`\n🗺  sitemap.xml generado con ${sitemapUrls.length} URLs`);
  console.log(`✨ ${generated} páginas de ciudades generadas en /ciudades/`);
}

main();
