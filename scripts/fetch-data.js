#!/usr/bin/env node
/**
 * fetch-data.js
 * Descarga los precios de carburantes del Ministerio de Industria
 * y los guarda como data.json optimizado (sin campos innecesarios).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

// Campos que necesitamos (el resto se descarta para reducir tamaño)
const KEEP = [
  'Rótulo', 'Dirección', 'Localidad', 'Provincia', 'Municipio',
  'Latitud', 'Longitud (WGS84)', 'Horario',
  'Precio Gasolina 95 E5',
  'Precio Gasolina 98 E5',
  'Precio Gasoleo A',
  'Precio Gasoleo Premium',
  'Precio Gases licuados del petróleo',
  'C.P.',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('⏳ Descargando datos del Ministerio…');
  const start = Date.now();

  const json = await fetch(API_URL);
  const raw  = json.ListaEESSPrecio || [];
  console.log(`✅ ${raw.length} estaciones descargadas en ${((Date.now()-start)/1000).toFixed(1)}s`);

  // Filtrar campos para reducir tamaño
  const compact = raw.map(s => {
    const out = {};
    for (const k of KEEP) {
      if (s[k] !== undefined && s[k] !== '') out[k] = s[k];
    }
    return out;
  });

  // Estadísticas del día para el histórico de precios nacionales
  const FUELS = {
    G95:  'Precio Gasolina 95 E5',
    G98:  'Precio Gasolina 98 E5',
    GOA:  'Precio Gasoleo A',
    GOP:  'Precio Gasoleo Premium',
    GLP:  'Precio Gases licuados del petróleo',
  };
  const stats = {};
  for (const [key, field] of Object.entries(FUELS)) {
    const vals = compact
      .map(s => parseFloat((s[field]||'').replace(',','.')))
      .filter(v => !isNaN(v) && v > 0);
    if (vals.length) {
      stats[key] = {
        avg: +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3),
        min: +Math.min(...vals).toFixed(3),
        max: +Math.max(...vals).toFixed(3),
        count: vals.length,
      };
    }
  }

  const output = {
    updated: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    count: compact.length,
    stats,
    stations: compact,
  };

  const outPath = path.join(process.cwd(), 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`💾 data.json guardado (${sizeMB} MB, ${compact.length} estaciones)`);
  console.log(`📊 Precio medio G95: ${stats.G95?.avg}€ | GOA: ${stats.GOA?.avg}€`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
