// Actualizador diario de precios de competencia — Wine Concierge
// Node >= 20, sin dependencias externas. Genera data.json en la raíz del repo.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(DIR, '..');
const DATA = path.join(RAIZ, 'data.json');
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
let UA_ACTUAL = UA_CHROME;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, tipo = 'text', intentos = 2) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA_ACTUAL,
          'Accept-Language': 'es-PE,es;q=0.9',
          Accept: tipo === 'json' ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (tipo === 'json') return await r.json();
      if (tipo === 'raw') return { status: r.status, texto: await r.text() };
      return await r.text();
    } catch (e) {
      ultimo = e;
      await dormir(800 * (i + 1));
    }
  }
  throw ultimo;
}

const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.,]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  let limpio;
  if (coma > -1 && punto > -1) {
    limpio = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    const partes = s.split(',');
    limpio = partes.length > 2 || partes[1].length === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (punto > -1) {
    const partes = s.split('.');
    limpio = partes.length > 2 || partes[1].length === 3 ? s.replace(/\./g, '') : s;
  } else {
    limpio = s;
  }
  const n = Number(limpio);
  return isFinite(n) ? n : null;
};

function armar({ tienda, nombre, marca, precio, moneda, precioLista, disponible, url, imagen, categoria }) {
  const p = Math.round(Number(precio) * 100) / 100;
  if (!isFinite(p) || p <= 0) return null;
  const l = precioLista != null && isFinite(Number(precioLista)) && Number(precioLista) > p ? Math.round(Number(precioLista) * 100) / 100 : null;
  return {
    tienda,
    nombre: String(nombre || '').trim().replace(/\s+/g, ' '),
    marca: marca ? String(marca).trim().replace(/\s+/g, ' ') : null,
    precio: p,
    moneda: moneda || 'PEN',
    precioLista: l,
    disponible: disponible === true ? true : disponible === false ? false : null,
    url: url || null,
    imagen: imagen || null,
    categoria: categoria || null,
  };
}

// ---------- Adaptadores por plataforma ----------

async function vtexWineConcierge() {
  const productos = [];
  const paso = 49;
  let desde = 0;
  for (let pagina = 0; pagina < 12; pagina++) {
    const url = `https://www.wineconcierge.pe/api/catalog_system/pub/products/search?_from=${desde}&_to=${desde + paso}&O=OrderByPriceDESC`;
    const arr = await pedir(url, 'json');
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const prod of arr) {
      const cats = prod.categories || [];
      const cat = cats.find((c) => /\/(Vinos|Espumantes)\//i.test(c));
      if (!cat) continue;
      const item = (prod.items || [])[0];
      const off = item?.sellers?.[0]?.commertialOffer || {};
      const fila = armar({
        tienda: 'wineconcierge',
        nombre: prod.productName || prod.productTitle,
        marca: prod.brand,
        precio: off.Price,
        moneda: 'PEN',
        precioLista: off.ListPrice,
        disponible: typeof off.IsAvailable === 'boolean' ? off.IsAvailable : null,
        url: prod.link,
        imagen: item?.images?.[0]?.imageUrl,
        categoria: cat,
      });
      if (fila) productos.push(fila);
    }
    if (arr.length < paso + 1) break;
    desde += paso + 1;
    await dormir(400);
  }
  return { productos, meta: { categoria: 'Vinos y espumantes (excluye destilados)', fuente: 'api/catalog_system/pub/products/search' } };
}

function shopifyAdapter({ tienda, base, coleccion, filtrar }) {
  return async () => {
    const productos = [];
    for (let pagina = 1; pagina <= 6; pagina++) {
      const url = coleccion
        ? `${base}/collections/${coleccion}/products.json?limit=250&page=${pagina}`
        : `${base}/products.json?limit=250&page=${pagina}`;
      const data = await pedir(url, 'json');
      const arr = data?.products || [];
      if (!arr.length) break;
      for (const p of arr) {
        if (filtrar && !filtrar(p)) continue;
        const v = (p.variants || [])[0] || {};
        const fila = armar({
          tienda,
          nombre: p.title,
          marca: p.vendor,
          precio: v.price,
          moneda: 'USD',
          precioLista: v.compare_at_price,
          disponible: typeof v.available === 'boolean' ? v.available : null,
          url: `${base}/en/products/${p.handle}`,
          imagen: p.images?.[0]?.src,
          categoria: p.product_type || coleccion,
        });
        if (fila) productos.push(fila);
      }
      if (arr.length < 250) break;
      await dormir(400);
    }
    return { productos, meta: { fuente: coleccion ? `collections/${coleccion}/products.json` : 'products.json' } };
  };
}

function wooAdapter({ tienda, base, categoriaId, categoriaNombre }) {
  return async () => {
    const productos = [];
    for (let pagina = 1; pagina <= 6; pagina++) {
      const url = `${base}/wp-json/wc/store/v1/products?category=${categoriaId}&per_page=100&page=${pagina}`;
      const arr = await pedir(url, 'json');
      if (!Array.isArray(arr) || !arr.length) break;
      for (const p of arr) {
        const precio = p.prices?.price != null ? Number(p.prices.price) / 100 : null;
        const lista = p.prices?.regular_price != null ? Number(p.prices.regular_price) / 100 : null;
        const fila = armar({
          tienda,
          nombre: p.name,
          marca: null,
          precio,
          moneda: p.prices?.currency_code || 'PEN',
          precioLista: p.on_sale ? lista : null,
          disponible: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : null,
          url: p.permalink,
          imagen: p.images?.[0]?.src,
          categoria: categoriaNombre,
        });
        if (fila) productos.push(fila);
      }
      if (arr.length < 100) break;
      await dormir(400);
    }
    return { productos, meta: { categoria: categoriaNombre, fuente: `wp-json/wc/store/v1/products?category=${categoriaId}` } };
  };
}

async function vinitecaPremium() {
  const mapa = new Map();
  const bloque = /<div class="tvproduct-image"><a href="[^"]+" class="thumbnail product-thumbnail"><img[^>]*?(?:data-src|src)="([^"]+)"[^>]*>[\s\S]*?tvproduct-name product-title"><a href="([^"]+)"><h6>([^<]+)<\/h6>[\s\S]*?product-price-and-shipping">([\s\S]*?)<\/div><\/div>/g;
  const extraer = (html) => {
    let nuevos = 0;
    for (const m of html.matchAll(bloque)) {
      const [, imagen, enlace, nombre, bloquePrecio] = m;
      if (mapa.has(enlace)) continue;
      const precio = num((bloquePrecio.match(/class="price">S\/\s*([\d.,]+)/) || [])[1]);
      const lista = num((bloquePrecio.match(/class="regular-price">S\/\s*([\d.,]+)/) || [])[1]);
      const fila = armar({ tienda: 'viniteca', nombre, marca: null, precio, moneda: 'PEN', precioLista: lista, disponible: null, url: enlace, imagen, categoria: 'premium' });
      if (fila) { mapa.set(enlace, fila); nuevos++; }
    }
    return nuevos;
  };

  const htmlUna = await pedir('https://viniteca.com.pe/218-premium?resultsPerPage=120', 'text');
  extraer(htmlUna);

  if (mapa.size <= 13) {
    for (let pagina = 1; pagina <= 8; pagina++) {
      const html = await pedir(`https://viniteca.com.pe/218-premium?page=${pagina}`, 'text');
      const encontrados = [...html.matchAll(bloque)].length;
      extraer(html);
      if (encontrados === 0) break;
      await dormir(600);
    }
  }

  const productos = [...mapa.values()];
  if (!productos.length) throw new Error('patrón HTML de listado no reconocido (0 productos)');
  return { productos, meta: { categoria: 'Categoría premium (/218-premium)', fuente: 'HTML de categoría (PrestaShop, sin API pública)' } };
}

async function maderoMarket() {
  const html = await pedir('https://www.maderomarket.pe/', 'text');
  const precios = html.match(/S\/\s?[\d.,]+/g) || [];
  return {
    productos: [],
    meta: {
      categoria: 'Sitio institucional (Mobirise) sin catálogo de precios',
      fuente: 'HTML de la portada',
      nota: precios.length
        ? `Se detectaron ${precios.length} coincidencias de precio en la portada; revisar manualmente.`
        : 'Sin precios publicados en el HTML público de la portada (0 coincidencias de "S/").',
    },
  };
}

const FUENTES = [
  { id: 'wineconcierge', nombre: 'Wine Concierge', rol: 'propia', url: 'https://www.wineconcierge.pe/', plataforma: 'VTEX IO', correr: vtexWineConcierge },
  {
    id: 'winenotstore', nombre: 'Wine Not Store', rol: 'competencia', url: 'https://winenotstore.com/', plataforma: 'Shopify',
    correr: shopifyAdapter({
      tienda: 'winenotstore', base: 'https://winenotstore.com', coleccion: null,
      filtrar: (p) => ['Vino', 'Vino Espumante'].includes(p.product_type) && !/^test/i.test(p.handle || ''),
    }),
  },
  { id: 'perufarma', nombre: 'Perufarma', rol: 'competencia', url: 'https://perufarma.com.pe/', plataforma: 'WooCommerce', ua: UA_EDGE, correr: wooAdapter({ tienda: 'perufarma', base: 'https://perufarma.com.pe', categoriaId: 783, categoriaNombre: 'VINOS PREMIUM' }) },
  { id: 'licoreriasunidas', nombre: 'Licorerías Unidas', rol: 'competencia', url: 'https://licoreriasunidas.pe/', plataforma: 'Shopify', correr: shopifyAdapter({ tienda: 'licoreriasunidas', base: 'https://licoreriasunidas.pe', coleccion: 'vino-de-lujo' }) },
  { id: 'viniteca', nombre: 'La Viniteca', rol: 'competencia', url: 'https://viniteca.com.pe/', plataforma: 'PrestaShop', correr: vinitecaPremium },
  { id: 'panuts', nombre: 'Panuts', rol: 'competencia', url: 'https://panuts.com/', plataforma: 'WooCommerce', correr: wooAdapter({ tienda: 'panuts', base: 'https://panuts.com', categoriaId: 26, categoriaNombre: 'Alta Gama' }) },
  { id: 'maderomarket', nombre: 'Madero Market', rol: 'competencia', url: 'https://www.maderomarket.pe/', plataforma: 'Sitio estático', correr: maderoMarket },
];

// ---------- Tipo de cambio (para la única tienda que publica en USD) ----------
async function tipoCambio(previo) {
  try {
    const d = await pedir('https://open.er-api.com/v6/latest/USD', 'json');
    const pen = d?.rates?.PEN;
    if (!isFinite(pen)) throw new Error('PEN no disponible');
    return { ok: true, usdAPen: pen, fuente: 'open.er-api.com (tipo de cambio de referencia)', obtenidoEn: new Date().toISOString() };
  } catch (e) {
    if (previo?.usdAPen) return { ...previo, ok: false, advertencia: `No se pudo actualizar el tipo de cambio: ${e.message}` };
    return { ok: false, usdAPen: null, fuente: null, advertencia: `Sin tipo de cambio: ${e.message}` };
  }
}

// ---------- Revalidación diaria de políticas de envío ----------
async function validarEnvios(previo) {
  const cfg = JSON.parse(await readFile(path.join(DIR, 'envios.json'), 'utf8'));
  const prevHash = Object.fromEntries((previo?.envios || []).map((e) => [e.tienda, e.hash]));
  const salida = [];
  for (const e of cfg.envios) {
    UA_ACTUAL = FUENTES.find((f) => f.id === e.tienda)?.ua || UA_CHROME;
    const fila = { ...e, verificadoEn: new Date().toISOString(), estado: 'ok', hash: null, cambioDetectado: false };
    try {
      const { texto } = await pedir(e.fuente, 'raw');
      const limpio = texto.replace(/\s+/g, ' ').trim();
      fila.hash = String(limpio.length);
      const fragmento = limpio.match(/.{0,160}(env[ií]o|delivery|despacho|flete|costo).{0,220}/i)?.[0] || '';
      fila.evidencia = fragmento.slice(0, 340);
      if (prevHash[e.tienda] && prevHash[e.tienda] !== fila.hash) fila.cambioDetectado = true;
    } catch (err) {
      fila.estado = 'error';
      fila.error = err.message;
      fila.evidencia = null;
    }
    salida.push(fila);
    await dormir(500);
  }
  return salida;
}

// ---------- Main ----------
const previo = existsSync(DATA) ? JSON.parse(await readFile(DATA, 'utf8')) : null;
const inicio = Date.now();
const fuentes = [];
const productos = [];

for (const f of FUENTES) {
  UA_ACTUAL = f.ua || UA_CHROME;
  const registro = {
    id: f.id, nombre: f.nombre, rol: f.rol, url: f.url, plataforma: f.plataforma,
    estado: 'ok', error: null, productos: 0, categoria: null, fuenteDato: null, nota: null,
    leidoEn: new Date().toISOString(), datosDe: null,
  };
  try {
    const { productos: ps, meta } = await f.correr();
    registro.productos = ps.length;
    registro.categoria = meta.categoria || null;
    registro.fuenteDato = meta.fuente || null;
    registro.nota = meta.nota || null;
    productos.push(...ps);
  } catch (e) {
    const previos = (previo?.productos || []).filter((p) => p.tienda === f.id);
    registro.estado = previos.length ? 'error' : 'vacio';
    registro.error = e.message;
    registro.productos = previos.length;
    registro.datosDe = previo?.generadoEn || null;
    productos.push(...previos);
  }
  fuentes.push(registro);
  await dormir(500);
}

const fx = await tipoCambio(previo?.fx);
for (const p of productos) {
  if (p.moneda === 'USD') {
    if (fx.usdAPen) {
      p.precioOriginal = p.precio;
      p.precio = Math.round(p.precio * fx.usdAPen * 100) / 100;
      p.moneda = 'PEN';
      p.convertido = true;
    } else {
      p.noComparable = true;
    }
  }
}

const envios = await validarEnvios(previo);

const conPrecio = productos.filter((p) => isFinite(p.precio) && p.precio > 0);
const salida = {
  generadoEn: new Date().toISOString(),
  duracionMs: Date.now() - inicio,
  resumen: {
    productos: conPrecio.length,
    fuentesOk: fuentes.filter((f) => f.estado === 'ok').length,
    fuentesTotal: fuentes.length,
    convertidosUSD: productos.filter((p) => p.convertido).length,
    sinPrecio: productos.filter((p) => p.noComparable).length,
    conDescuento: productos.filter((p) => p.precioLista).length,
  },
  fx,
  fuentes,
  envios,
  productos,
};

await writeFile(DATA, JSON.stringify(salida), 'utf8');
console.log(`OK: ${salida.resumen.productos} productos · ${salida.resumen.fuentesOk}/${salida.resumen.fuentesTotal} fuentes · ${salida.duracionMs} ms`);
for (const f of fuentes) console.log(`  - ${f.nombre}: ${f.estado} · ${f.productos} productos${f.error ? ' · ' + f.error : ''}`);
if (salida.resumen.fuentesOk === 0) process.exit(1);
