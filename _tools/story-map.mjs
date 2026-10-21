// Writes assets/us-lower48.svg (state outlines, Albers USA lower-48 fitted to 960x600,
// same projection as the tour map) and checks the browser projection in app.js against d3.
// Usage: node _tools/story-map.mjs <dir with d3-geo, topojson-client, us-atlas> <astra dir>
import {createRequire} from 'module';
import fs from 'fs';
const [geoDir, root] = process.argv.slice(2);
const require = createRequire(geoDir + '/package.json');
const d3 = require('d3-geo'), topo = require('topojson-client');
const us = require('us-atlas/states-10m.json');
const fc = topo.feature(us, us.objects.states);
const lower48 = {type:'FeatureCollection', features: fc.features.filter(f => !['02','15','60','66','69','72','78'].includes(f.id))};
const W = 960, H = 600;
const proj = d3.geoAlbersUsa().fitExtent([[10,10],[W-10,H-10]], lower48);
const path = d3.geoPath(proj);
const r = s => s.replace(/(\d+\.\d)\d+/g, '$1');
let g = '';
for (const f of lower48.features) g += `<path data-state="${f.properties.name}" d="${r(path(f))}"/>`;
fs.writeFileSync(root + '/assets/us-lower48.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g id="states">${g}</g></svg>\n`);
// browser re-implementation of d3.geoAlbers (conic equal-area) for the lower 48
const k = proj.scale(), t = proj.translate();
const R = Math.PI / 180, p0 = 29.5 * R, p1 = 45.5 * R, n = (Math.sin(p0) + Math.sin(p1)) / 2;
const c = 1 + Math.sin(p0) * (2 * n - Math.sin(p0)), r0 = Math.sqrt(c) / n;
const raw = (lo, la) => { const l = (lo + 96) * R * n, rr = Math.sqrt(c - 2 * n * Math.sin(la * R)) / n; return [rr * Math.sin(l), r0 - rr * Math.cos(l)]; };
const cen = raw(-0.6 - 96 + 96, 38.7); // placeholder, solved below
// d3 albers: center([-0.6, 38.7]) after rotate([96,0]) -> center longitude in rotated frame is -0.6
const rawRot = (lo, la) => { const l = lo * R * n, rr = Math.sqrt(c - 2 * n * Math.sin(la * R)) / n; return [rr * Math.sin(l), r0 - rr * Math.cos(l)]; };
const cc = rawRot(-0.6, 38.7);
const js = (lo, la) => { const q = rawRot(lo + 96, la); return [t[0] + k * (q[0] - cc[0]), t[1] - k * (q[1] - cc[1])]; };
let maxErr = 0;
for (const [lo, la] of [[-83.74,42.28],[-87.63,41.88],[-122.4,37.8],[-74,40.7],[-80.2,25.8],[-117,32.7],[-93.2,44.97]]) {
  const a = proj([lo, la]), b = js(lo, la); maxErr = Math.max(maxErr, Math.hypot(a[0]-b[0], a[1]-b[1]));
}
console.log(JSON.stringify({k: +k.toFixed(4), tx: +t[0].toFixed(4), ty: +t[1].toFixed(4), cx: +cc[0].toFixed(6), cy: +cc[1].toFixed(6), maxErr}));
