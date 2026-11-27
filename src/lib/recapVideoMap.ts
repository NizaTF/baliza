export interface LatLngBoundsBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MercatorViewport {
  rect: CanvasRect;
  centerWx: number;
  centerWy: number;
  pixelsPerWorld: number;
  tileZoom: number;
  tiles: Array<{
    tx: number;
    ty: number;
    wrapTx: number;
    z: number;
    dx: number;
    dy: number;
    sizePx: number;
  }>;
  project: (lat: number, lng: number) => { x: number; y: number };
  metersToPx: (meters: number, refLat: number) => number;
}

const MAX_MERCATOR_LAT = 85.0511287798066;
const EARTH_CIRCUMFERENCE_M = 40075016.68557849;

export function lngToWorldX(lng: number): number {
  return (lng + 180) / 360;
}

export function latToWorldY(lat: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export function createMercatorViewport(
  bounds: LatLngBoundsBox,
  rect: CanvasRect
): MercatorViewport {
  const wxMin = lngToWorldX(bounds.minLng);
  const wxMax = lngToWorldX(bounds.maxLng);
  const wyMin = latToWorldY(bounds.maxLat); // norte = worldY menor
  const wyMax = latToWorldY(bounds.minLat); // sur = worldY mayor

  const spanWx = Math.max(1e-7, wxMax - wxMin);
  const spanWy = Math.max(1e-7, wyMax - wyMin);

  const pixelsPerWorld = Math.min(rect.width / spanWx, rect.height / spanWy);
  const exactZoom = Math.log2(Math.max(1, pixelsPerWorld) / 256);

  let tileZoom = Math.max(10, Math.min(18, Math.ceil(exactZoom)));

  const computeTileGrid = (z: number) => {
    const n = Math.pow(2, z);
    const centerWx = (wxMin + wxMax) / 2;
    const centerWy = (wyMin + wyMax) / 2;
    const visMinWx = centerWx - rect.width / 2 / pixelsPerWorld;
    const visMaxWx = centerWx + rect.width / 2 / pixelsPerWorld;
    const visMinWy = centerWy - rect.height / 2 / pixelsPerWorld;
    const visMaxWy = centerWy + rect.height / 2 / pixelsPerWorld;

    const txStart = Math.floor(visMinWx * n);
    const txEnd = Math.floor(visMaxWx * n);
    const tyStart = Math.max(0, Math.floor(visMinWy * n));
    const tyEnd = Math.min(n - 1, Math.floor(visMaxWy * n));
    const count = Math.max(0, txEnd - txStart + 1) * Math.max(0, tyEnd - tyStart + 1);
    return { n, centerWx, centerWy, txStart, txEnd, tyStart, tyEnd, count };
  };

  let grid = computeTileGrid(tileZoom);
  if (grid.count > 25 && tileZoom > 10) {
    tileZoom -= 1;
    grid = computeTileGrid(tileZoom);
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const sizePx = pixelsPerWorld / grid.n;

  const tiles: MercatorViewport['tiles'] = [];
  for (let tx = grid.txStart; tx <= grid.txEnd; tx++) {
    const wrapTx = ((tx % grid.n) + grid.n) % grid.n;
    for (let ty = grid.tyStart; ty <= grid.tyEnd; ty++) {
      tiles.push({
        tx,
        ty,
        wrapTx,
        z: tileZoom,
        dx: cx + (tx / grid.n - grid.centerWx) * pixelsPerWorld,
        dy: cy + (ty / grid.n - grid.centerWy) * pixelsPerWorld,
        sizePx,
      });
    }
  }

  const project = (lat: number, lng: number) => ({
    x: cx + (lngToWorldX(lng) - grid.centerWx) * pixelsPerWorld,
    y: cy + (latToWorldY(lat) - grid.centerWy) * pixelsPerWorld,
  });

  const metersToPx = (meters: number, refLat: number) => {
    const cosLat = Math.max(0.15, Math.cos((refLat * Math.PI) / 180));
    const worldFraction = meters / (EARTH_CIRCUMFERENCE_M * cosLat);
    return Math.max(3, worldFraction * pixelsPerWorld);
  };

  return {
    rect,
    centerWx: grid.centerWx,
    centerWy: grid.centerWy,
    pixelsPerWorld,
    tileZoom,
    tiles,
    project,
    metersToPx,
  };
}

function buildTileCandidateUrls(
  primaryTemplate: string,
  z: number,
  x: number,
  y: number
): string[] {
  const subs = ['a', 'b', 'c'];
  const sub = subs[(x + y) % subs.length];
  const primary = primaryTemplate
    .replace('{s}', sub)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  const cartoSub = ['a', 'b', 'c', 'd'][(x + y) % 4];
  const cartoFallback = `https://${cartoSub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
  const osmFallback = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

  return Array.from(new Set([primary, cartoFallback, osmFallback]));
}

async function fetchTileAsUntaintedImage(
  urls: string[],
  timeoutMs = 3000
): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        mode: 'cors',
        cache: 'reload',
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => {
          URL.revokeObjectURL(objUrl);
          resolve(el);
        };
        el.onerror = () => {
          URL.revokeObjectURL(objUrl);
          resolve(null);
        };
        el.src = objUrl;
      });
      if (img) return img;
    } catch {
      // Probar siguiente proveedor de tiles con CORS
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Pre-renderiza los tiles reales del mapa en un canvas estático untainted para usarlo
 * como fondo de cada fotograma al exportar el vídeo del recorrido.
 */
export async function renderStaticBaseMapCanvas(params: {
  size: number;
  viewport: MercatorViewport;
  tileUrlTemplate: string;
}): Promise<{ canvas: HTMLCanvasElement; loadedTiles: number; totalTiles: number }> {
  const { size, viewport, tileUrlTemplate } = params;
  const { rect, tiles } = viewport;

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = size;
  baseCanvas.height = size;
  const ctx = baseCanvas.getContext('2d');
  if (!ctx) {
    return { canvas: baseCanvas, loadedTiles: 0, totalTiles: tiles.length };
  }

  // Marco exterior oscuro
  ctx.fillStyle = '#090F1A';
  ctx.fillRect(0, 0, size, size);

  // Fondo interior claro cartográfico por si algún tile tarda o falta
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.width, rect.height);
  ctx.clip();

  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

  // Rejilla sutil base (visible solo si no carga algún tile)
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
  ctx.lineWidth = 1;
  for (let gx = rect.left; gx <= rect.left + rect.width; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, rect.top);
    ctx.lineTo(gx, rect.top + rect.height);
    ctx.stroke();
  }
  for (let gy = rect.top; gy <= rect.top + rect.height; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(rect.left, gy);
    ctx.lineTo(rect.left + rect.width, gy);
    ctx.stroke();
  }

  let loadedTiles = 0;
  const images = await Promise.all(
    tiles.map((t) =>
      fetchTileAsUntaintedImage(
        buildTileCandidateUrls(tileUrlTemplate, t.z, t.wrapTx, t.ty)
      )
    )
  );

  images.forEach((img, idx) => {
    if (!img) return;
    const t = tiles[idx];
    ctx.drawImage(img, t.dx, t.dy, t.sizePx + 0.75, t.sizePx + 0.75);
    loadedTiles += 1;
  });

  // Velo muy sutil para que las rutas y zonas destaquen sobre calles claras sin perder detalle
  if (loadedTiles > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  } else {
    // Si está sin conexión o sin CORS, usar fondo táctico oscuro como respaldo limpio
    ctx.fillStyle = '#090F1A';
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    for (let gx = rect.left; gx <= rect.left + rect.width; gx += 48) {
      ctx.beginPath();
      ctx.moveTo(gx, rect.top);
      ctx.lineTo(gx, rect.top + rect.height);
      ctx.stroke();
    }
    for (let gy = rect.top; gy <= rect.top + rect.height; gy += 48) {
      ctx.beginPath();
      ctx.moveTo(rect.left, gy);
      ctx.lineTo(rect.left + rect.width, gy);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Borde limpio del marco del mapa
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

  return { canvas: baseCanvas, loadedTiles, totalTiles: tiles.length };
}
