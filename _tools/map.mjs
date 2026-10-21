// Builds the "Where We Work" SVG map from us-atlas (U.S. Census cartographic boundaries)
// and writes it between <!--MAP--> markers in index.html.
// Usage: node _tools/map.mjs <dir with d3-geo, topojson-client, us-atlas installed> index.html
import {createRequire} from 'module';
import fs from 'fs';
const [geoDir, htmlPath] = process.argv.slice(2);
const require = createRequire(geoDir + '/package.json');
const d3 = require('d3-geo'), topo = require('topojson-client');
const us = require('us-atlas/states-10m.json');
const fc = topo.feature(us, us.objects.states);
const PHASE = {26:['mi',1],17:['il',1],39:['oh',1],27:['mn',2],37:['nc',2],42:['pa',2]};
const W = 900, H = 640;
const sel = {type:'FeatureCollection', features: fc.features.filter(f => PHASE[+f.id])};
const proj = d3.geoConicConformal().parallels([33,45]).rotate([84,0]).fitExtent([[40,40],[W-40,H-30]], sel);
const path = d3.geoPath(proj);
const r = s => s.replace(/(\d+\.\d)\d+/g, '$1');
const P = (lo,la) => proj([lo,la]).map(v => +v.toFixed(1));

let base = '', focus = '';
for (const f of fc.features) {
  const d = path(f); if (!d) continue;
  const b = path.bounds(f);
  if (b[1][0] < -40 || b[0][0] > W+40 || b[1][1] < -40 || b[0][1] > H+40) continue;
  const ph = PHASE[+f.id];
  if (ph) focus += `<path data-state="${ph[0]}" class="p${ph[1]}" d="${r(d)}"><title>${f.properties.name}</title></path>`;
  else base += `<path d="${r(d)}"/>`;
}
const CITY = {mi:['Detroit',-83.2,42.45],il:['Chicago',-87.63,41.88],oh:['Columbus',-82.99,39.96],mn:['Minneapolis–St. Paul',-93.2,44.97],nc:['Raleigh-Durham',-78.79,35.9],pa:['Philadelphia',-75.16,39.95]};
const LABEL = {mi:['Michigan',-84.75,43.75],il:['Illinois',-89.25,40.1],oh:['Ohio',-82.75,40.75],mn:['Minnesota',-94.4,46.4],nc:['North Carolina',-80.4,35.45],pa:['Pennsylvania',-77.7,41.05]};
const [ax, ay] = P(CITY.mi[1], CITY.mi[2]);
let arcs = '', cities = '', labels = '';
for (const [k,[n,lo,la]] of Object.entries(CITY)) {
  const [x,y] = P(lo,la);
  if (k !== 'mi') {
    const mx = (ax+x)/2, my = (ay+y)/2, dx = x-ax, dy = y-ay, len = Math.hypot(dx,dy);
    let nx = -dy/len, ny = dx/len; if (ny > 0) { nx = -nx; ny = -ny; }   // bow upward
    const c = [mx + nx*len*.22, my + ny*len*.22].map(v => +v.toFixed(1));
    arcs += `<path class="p${PHASE[Object.keys(PHASE).find(id => PHASE[id][0]===k)][1]}" d="M${ax} ${ay}Q${c[0]} ${c[1]} ${x} ${y}"/>`;
  }
  cities += `<g class="city${k==='mi'?' anchor':''}">${k==='mi'?`<circle class="ring" cx="${x}" cy="${y}" r="6"/>`:''}<circle cx="${x}" cy="${y}" r="${k==='mi'?6:4.5}"><title>${n}</title></circle></g>`;
}
for (const [k,[n,lo,la]] of Object.entries(LABEL)) {
  const [x,y] = P(lo,la);
  labels += `<text class="st-lbl" x="${x}" y="${y}" text-anchor="middle">${n}</text>`;
}
const [dx, dy] = P(-77.04, 38.91);
const dc = `<g class="dc"><circle cx="${dx}" cy="${dy}" r="7"/><text x="${dx+13}" y="${dy+5}">Washington, D.C.</text><text class="sub" x="${dx+13}" y="${dy+24}">Not where our</text><text class="sub" x="${dx+13}" y="${dy+42}">power begins</text></g>`;
const svg = `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="map-t map-d"><title id="map-t">Astra's priority states</title><desc id="map-d">Map of the eastern United States. Phase One states: Michigan, Illinois, and Ohio. Phase Two states: Minnesota, North Carolina, and Pennsylvania. Lines run outward from Michigan, the anchor state, to each of the others. Washington, D.C. is marked but is not a priority.</desc><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#4A634C"/><rect width="2.2" height="7" fill="#C4C2A8"/></pattern><pattern id="hatch-on" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#566F58"/><rect width="3.4" height="7" fill="#ECEDEA"/></pattern></defs><g class="base">${base}</g><g class="focus">${focus}</g><g class="arcs">${arcs}</g>${dc}<g class="cities">${cities}</g><g class="labels">${labels}</g></svg>`;
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<!--MAP-->[\s\S]*?(<!--\/MAP-->|(?=\s*<div class="map-legend"))/, `<!--MAP-->${svg}<!--/MAP-->`);
fs.writeFileSync(htmlPath, html);
console.log('map bytes', svg.length);
