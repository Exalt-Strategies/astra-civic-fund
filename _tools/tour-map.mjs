// Builds the fall 2022 campus-tour map (us-atlas, Albers USA) and writes it
// between <!--TOUR--> and <!--/TOUR--> in index.html.
// Usage: node _tools/tour-map.mjs <dir with d3-geo, topojson-client, us-atlas> index.html
import {createRequire} from 'module';
import fs from 'fs';
const [geoDir, htmlPath] = process.argv.slice(2);
const require = createRequire(geoDir + '/package.json');
const d3 = require('d3-geo'), topo = require('topojson-client');
const us = require('us-atlas/states-10m.json');
const fc = topo.feature(us, us.objects.states);
const lower48 = {type:'FeatureCollection', features: fc.features.filter(f => !['02','15','60','66','69','72','78'].includes(f.id))};
const PRIORITY = new Set(['26','17','39','27','37','42']);
const W = 960, H = 600;
const proj = d3.geoAlbersUsa().fitExtent([[10,10],[W-10,H-10]], lower48);
const path = d3.geoPath(proj);
const r = s => s.replace(/(\d+\.\d)\d+/g, '$1');
// order matches STOPS in app.js
const STOPS = [
  [-86.176,39.774],[-95.098,29.583],[-82.837,34.678],[-81.027,33.996],[-84.515,39.132],[-84.179,39.740],
  [-81.675,41.502],[-97.071,36.125],[-97.445,35.205],[-87.655,41.925],[-88.775,41.934],[-95.255,38.954],
  [-94.576,39.034],[-86.803,36.144],[-83.738,42.278],[-84.482,42.701],[-83.069,42.357],[-95.343,29.720],
  [-80.422,37.227],[-84.396,33.776],[-98.619,29.583],[-105.085,40.575],[-93.228,44.974]
];
let states = '';
for (const f of lower48.features) states += `<path${PRIORITY.has(f.id) ? ' class="pri"' : ''} d="${r(path(f))}"/>`;
let dots = '';
STOPS.forEach(([lo,la],i) => {
  const [x,y] = proj([lo,la]).map(v => +v.toFixed(1));
  dots += `<circle data-stop="${i}" cx="${x}" cy="${y}" r="6"/>`;
});
const svg = `<svg class="tour-map" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="tour-t"><title id="tour-t">Map of the 23 campuses visited between September and December 2022</title><g class="st">${states}</g><g class="dots">${dots}</g></svg>`;
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<!--TOUR-->[\s\S]*?<!--\/TOUR-->/, `<!--TOUR-->${svg}<!--/TOUR-->`);
fs.writeFileSync(htmlPath, html);
console.log('tour map bytes', svg.length);
