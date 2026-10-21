(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile menu ---------- */
  const btn = document.querySelector('.menu-btn');
  const nav = document.getElementById('site-nav');
  const setMenu = open => {
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('open', open);
  };
  btn.addEventListener('click', () => setMenu(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- active section in nav ---------- */
  const navLinks = [...nav.querySelectorAll('a[href^="#"]:not(.btn)')];
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      navLinks.forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s); });

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .12 });
  document.querySelectorAll('.reveal, .atlas').forEach(el => io.observe(el));

  /* ---------- stat count-up ---------- */
  if (!reduce) {
    const so = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      so.unobserve(e.target);
      const el = e.target, end = +el.dataset.count, dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
      const t0 = performance.now(), dur = 1400;
      const tick = t => {
        const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
        el.textContent = (end * k).toFixed(dec) + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      el.textContent = (0).toFixed(dec) + suf;
      requestAnimationFrame(tick);
    }), { threshold: .6 });
    document.querySelectorAll('[data-count]').forEach(el => so.observe(el));
  }

  // arc lengths for the draw-in on the priority-state map
  document.querySelectorAll('.map .arcs path').forEach(p => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));

  /* ---------- where we work: map + tabs ---------- */
  const STATES = {
    mi: { name: 'Michigan', img: 'photos/msu-group.jpg', pos: 'center',
      alt: 'A large group of students posing together in a lecture hall at Michigan State University',
      cap: 'Michigan State University, East Lansing, 2022',
      desc: 'Engineering corridors, university towns, suburban Detroit, and a rapidly growing political community looking for a home.' },
    il: { name: 'Illinois', img: 'photos/il-niu.jpg', pos: 'center',
      alt: 'A crowd of students in a ballroom at Northern Illinois University',
      cap: 'Northern Illinois University, DeKalb, 2022',
      desc: "Chicagoland's deep Indian American density makes it a training ground for chapter-building, voter contact, and candidate pipelines." },
    oh: { name: 'Ohio', img: 'photos/img-0329.jpg', pos: 'center 30%',
      alt: 'A speaker holding a microphone talks with students seated at round tables at Cleveland State University',
      cap: 'Cleveland State University, 2022',
      desc: "Motel families, university communities, small-business owners: the constituency national campaigns skip past. We won't." },
    mn: { name: 'Minnesota', img: 'photos/img-5652.jpg', pos: 'center',
      alt: 'A speaker addressing a full auditorium at the University of Minnesota',
      cap: 'University of Minnesota, Minneapolis, 2022',
      desc: 'Engineering and medical communities, growing university chapters, and an active Indian American civic culture ready to scale.' },
    nc: { name: 'North Carolina', img: 'photos/img-9811.jpg', pos: 'center 30%',
      alt: 'Two students at a campus voter registration table',
      cap: 'Campus voter registration drive',
      desc: "Raleigh-Durham, the Charlotte tech corridor, and the South's fastest-growing Indian American population." },
    pa: { name: 'Pennsylvania', img: 'photos/pa-voting-plan.jpg', pos: 'center',
      alt: 'Two young women filling in voting plans at an outreach table with Pennsylvania Election Day flyers',
      cap: 'Voting-plan table, Pennsylvania, 2022',
      desc: 'Philadelphia suburbs, the Pittsburgh tech-and-medical corridor, and a swing-state legacy that makes every cycle count.' }
  };

  const card = document.getElementById('state-card');
  const tabs = [...document.querySelectorAll('.state-tab')];
  const shapes = [...document.querySelectorAll('.map .focus path')];
  if (card) {
    const img = card.querySelector('img'), cap = card.querySelector('figcaption');
    const nm = card.querySelector('.nm'), desc = card.querySelector('.desc');
    let current = null, swapT;
    const select = (id, focus) => {
      const s = STATES[id];
      if (!s) return;
      tabs.forEach(t => {
        const on = t.dataset.state === id;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      shapes.forEach(p => p.classList.toggle('on', p.dataset.state === id));
      if (id === current) return;
      const first = current === null;
      current = id;
      const apply = () => {
        img.src = s.img; img.alt = s.alt; img.style.objectPosition = s.pos;
        cap.textContent = s.cap; nm.textContent = s.name; desc.textContent = s.desc;
        card.classList.remove('swap');
      };
      clearTimeout(swapT);
      if (reduce || first) return apply();
      card.classList.add('swap');
      swapT = setTimeout(apply, 220);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t.dataset.state));
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return;
        e.preventDefault();
        select(tabs[(i + k + tabs.length) % tabs.length].dataset.state, true);
      });
    });
    shapes.forEach(p => {
      p.addEventListener('click', () => select(p.dataset.state));
      p.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) select(p.dataset.state); });
    });
    select('mi');
  }

  /* ---------- outreach: campus tour ---------- */
  // order matches the dots drawn by _tools/tour-map.mjs
  const STOPS = [
    ['Sep 2',  'September 2',  'IUPUI', 'Indianapolis, Indiana', '00'],
    ['Sep 3',  'September 3',  'University of Houston-Clear Lake', 'Houston, Texas', '01'],
    ['Sep 4',  'September 4',  'Clemson University', 'Clemson, South Carolina', '02'],
    ['Sep 5',  'September 5',  'University of South Carolina', 'Columbia, South Carolina', '03'],
    ['Sep 6',  'September 6',  'University of Cincinnati', 'Cincinnati, Ohio', '04'],
    ['Sep 8',  'September 8',  'University of Dayton', 'Dayton, Ohio', '05'],
    ['Sep 9',  'September 9',  'Cleveland State University', 'Cleveland, Ohio', '06'],
    ['Sep 10', 'September 10', 'Oklahoma State University', 'Stillwater, Oklahoma', '07'],
    ['Sep 11', 'September 11', 'University of Oklahoma', 'Norman, Oklahoma', '08'],
    ['Sep 17', 'September 17', 'DePaul University', 'Chicago, Illinois', '09'],
    ['Sep 18', 'September 18', 'Northern Illinois University', 'DeKalb, Illinois', '10'],
    ['Sep 20', 'September 20', 'University of Kansas', 'Lawrence, Kansas', '11'],
    ['Sep 21', 'September 21', 'University of Missouri-Kansas City', 'Kansas City, Missouri', '12'],
    ['Sep 23', 'September 23', 'Vanderbilt University', 'Nashville, Tennessee', '13'],
    ['Sep 24', 'September 24', 'University of Michigan', 'Ann Arbor, Michigan', '14'],
    ['Sep 25', 'September 25', 'Michigan State University', 'East Lansing, Michigan', '15'],
    ['Sep 26', 'September 26', 'Wayne State University', 'Detroit, Michigan', null],
    ['Sep 29', 'September 29', 'University of Houston', 'Houston, Texas', null],
    ['Oct 1',  'October 1',    'Virginia Tech', 'Blacksburg, Virginia', null],
    ['Nov 19', 'November 19',  'Georgia Tech, Tamasha', 'Atlanta, Georgia', '19'],
    ['Nov 22', 'November 22',  'University of Texas at San Antonio', 'San Antonio, Texas', '20'],
    ['Nov 27', 'November 27',  'Colorado State University', 'Fort Collins, Colorado', '21'],
    ['Dec 3',  'December 3',   'University of Minnesota', 'Minneapolis, Minnesota', '22']
  ];
  const photo = k => 'photos/tour/' + k + '.jpg';

  const view = document.querySelector('.tour-view');
  const list = document.querySelector('.stop-list');
  const dots = [...document.querySelectorAll('.tour-map .dots circle')];
  if (view && list) {
    const vImg = view.querySelector('.tv-img'), vPic = vImg.querySelector('img');
    const vDate = view.querySelector('.tv-date'), vName = view.querySelector('.tv-name'), vPlace = view.querySelector('.tv-place');
    list.innerHTML = STOPS.map((s, i) => `<li><button type="button" data-stop="${i}"><span>${s[0]}</span>${s[2]}</button></li>`).join('');
    const rows = [...list.querySelectorAll('button')];
    const svgNS = 'http://www.w3.org/2000/svg';
    const pulse = document.createElementNS(svgNS, 'circle');
    pulse.setAttribute('class', 'pulse'); pulse.setAttribute('r', '10');
    dots.forEach((d, i) => d.style.setProperty('--i', i));
    let cur = -1, tT;
    const show = (i, instant) => {
      const next = (i + STOPS.length) % STOPS.length;
      if (next === cur) return;
      cur = next;
      const [, full, name, place, k] = STOPS[cur];
      dots.forEach(d => d.classList.toggle('on', +d.dataset.stop === cur));
      rows.forEach(r => r.setAttribute('aria-current', +r.dataset.stop === cur));
      const on = dots[cur];
      if (on) {
        on.parentNode.appendChild(on);
        pulse.setAttribute('cx', on.getAttribute('cx')); pulse.setAttribute('cy', on.getAttribute('cy'));
        on.parentNode.insertBefore(pulse, on);
      }
      const apply = () => {
        vDate.textContent = full;
        vName.textContent = name;
        vPlace.textContent = place;
        vImg.classList.toggle('empty', !k);
        if (k) { vPic.src = photo(k); vPic.alt = name + ', ' + place; }
        view.classList.remove('swap');
      };
      clearTimeout(tT);
      if (reduce || instant) return apply();
      view.classList.add('swap');
      tT = setTimeout(apply, 220);
    };
    // preload tour photos once the section is near
    const pre = new IntersectionObserver(es => { if (es[0].isIntersecting) { STOPS.forEach(s => { if (s[4]) { const im = new Image(); im.src = photo(s[4]); } }); pre.disconnect(); } }, { rootMargin: '400px' });
    pre.observe(view);
    rows.forEach(r => r.addEventListener('click', () => show(+r.dataset.stop)));
    dots.forEach(d => {
      d.addEventListener('click', () => show(+d.dataset.stop));
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const s = STOPS[+d.dataset.stop]; t.textContent = s[2] + ', ' + s[0];
      d.appendChild(t);
    });
    view.querySelector('.tv-prev').addEventListener('click', () => show(cur - 1));
    view.querySelector('.tv-next').addEventListener('click', () => show(cur + 1));
    show(14, true);
  }
})();

/* ---------- build with us + stories ---------- */
(() => {
  const INBOX = 'info@astracivic.org';
  const STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
  document.querySelectorAll('select[name="State"]').forEach(sel => {
    STATES.forEach(s => sel.insertAdjacentHTML('beforeend', `<option>${s}</option>`));
  });

  /* who-is-filling-this-out tabs */
  const tabs = [...document.querySelectorAll('.form-tabs [role="tab"]')];
  const pick = t => tabs.forEach(b => {
    const on = b === t;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return;
      const n = tabs[(i + k + tabs.length) % tabs.length]; pick(n); n.focus();
    });
  });
  if (location.hash === '#network' && tabs[1]) pick(tabs[1]);
  document.querySelectorAll('a[href$="#network"]').forEach(a => a.addEventListener('click', () => tabs[1] && pick(tabs[1])));

  /* forms: validate, then hand off to the visitor's email app */
  document.querySelectorAll('form.astra-form').forEach(form => {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', e => {
      e.preventDefault();
      form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
      let firstBad = null;
      const flag = el => { el.classList.add('invalid'); firstBad = firstBad || el; };
      form.querySelectorAll('input[required]:not([type=checkbox]), select[required], textarea[required]').forEach(el => {
        if (!el.value.trim() || (el.type === 'email' && !/^\S+@\S+\.\S+$/.test(el.value))) flag(el);
      });
      form.querySelectorAll('.choices[data-required]').forEach(g => { if (!g.querySelector('input:checked')) flag(g); });
      form.querySelectorAll('input[type=checkbox][required]').forEach(c => { if (!c.checked) flag(c.closest('label')); });
      if (firstBad) {
        status.className = 'form-status err';
        status.textContent = 'Please fill in the highlighted fields.';
        (firstBad.querySelector ? firstBad.querySelector('input') || firstBad : firstBad).focus();
        return;
      }
      const data = new FormData(form), lines = [], seen = {};
      for (const [k, v] of data.entries()) {
        if (!String(v).trim()) continue;
        if (seen[k]) { seen[k].push(v); continue; }
        seen[k] = [v];
      }
      for (const k in seen) lines.push(k + ': ' + seen[k].join(', '));
      const subject = form.dataset.subject + (seen.Name ? ' from ' + seen.Name[0] : '');
      location.href = 'mailto:' + INBOX + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n\n') + '\n');
      status.className = 'form-status ok';
      status.textContent = 'Your email app should open with everything filled in. Press send there to finish. If nothing opens, email ' + INBOX + '.';
    });
    form.addEventListener('input', e => {
      const el = e.target.closest('.invalid') || (e.target.classList.contains('invalid') ? e.target : null);
      if (el) el.classList.remove('invalid');
    });
  });

})();

/* ---------- stories: data, map, homepage showcase, stories page ---------- */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LABEL = { leaders: 'Leaders', members: 'Members', issues: 'Issues' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Published stories live in /stories/stories.json. Sample stories exist only for local
  // layout previews and are never deployed (see .vercelignore).
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const getJSON = u => fetch(u).then(r => r.ok ? r.json() : []).catch(() => []);
  const loadStories = () => getJSON('/stories/stories.json').then(list => {
    list = Array.isArray(list) ? list : [];
    if (list.length || !local) return list;
    return getJSON('/stories/sample-stories.json').then(x => (Array.isArray(x) ? x : []).map(s => ({ ...s, sample: true })));
  }).then(list => list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));

  // Albers equal-area, lower 48, fitted to the 960x600 base map in /assets/us-lower48.svg
  const K = 1270.2054, TX = 479.7363, TY = 295.3365, CX = -0.008094, CY = 0.646162;
  const RAD = Math.PI / 180, S0 = Math.sin(29.5 * RAD), N = (S0 + Math.sin(45.5 * RAD)) / 2, C = 1 + S0 * (2 * N - S0), R0 = Math.sqrt(C) / N;
  const project = (lon, lat) => {
    const l = (lon + 96) * RAD * N, r = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N;
    return [TX + K * (r * Math.sin(l) - CX), TY - K * (R0 - r * Math.cos(l) - CY)];
  };
  let baseSVG;
  const baseMap = () => baseSVG || (baseSVG = fetch('/assets/us-lower48.svg').then(r => r.text()));
  const NS = 'http://www.w3.org/2000/svg';
  const PRIORITY = ['Michigan', 'Illinois', 'Ohio', 'Minnesota', 'North Carolina', 'Pennsylvania'];

  // Draws the map into `host` and returns {svg, pins}. Pins carry data-i = index into `list`.
  const drawMap = (host, list, opts = {}) => baseMap().then(txt => {
    host.innerHTML = txt;
    const svg = host.querySelector('svg');
    svg.setAttribute('class', 'smap');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Map of story locations');
    svg.querySelectorAll('path').forEach(p => { if (PRIORITY.includes(p.dataset.state)) p.classList.add('pri'); if (opts.highlight === p.dataset.state) p.classList.add('hl'); });
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pins'); svg.appendChild(g);
    const pins = list.map((s, i) => {
      if (s.lat == null || s.lon == null) return null;
      const [x, y] = project(+s.lon, +s.lat);
      const a = document.createElementNS(NS, 'a');
      if (opts.link !== false) a.setAttribute('href', '/stories/' + s.slug);
      a.setAttribute('class', 'pin s-' + s.series);
      a.dataset.i = i;
      a.style.setProperty('--d', (i * 90) + 'ms');
      const pr = opts.pin || 6.5;
      a.innerHTML = `<circle class="halo" cx="${x}" cy="${y}" r="${pr + 2}"/><circle class="dot" cx="${x}" cy="${y}" r="${pr}"/><title>${esc(s.title)} · ${esc(s.place)}</title>`;
      a.dataset.x = x; a.dataset.y = y;
      g.appendChild(a);
      return a;
    });
    if (opts.fit) {
      const pts = pins.filter(Boolean).map(p => [+p.dataset.x, +p.dataset.y]);
      if (pts.length) {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const w = Math.max(x1 - x0 + 160, opts.fit), h = w / (opts.aspect || 1.25);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        svg.setAttribute('viewBox', [cx - w / 2, cy - h / 2, w, h].map(v => v.toFixed(1)).join(' '));
      }
    }
    if (opts.label) {
      const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'pin-label'); svg.appendChild(t);
      svg.pinLabel = (i) => { const p = pins[i]; if (!p) { t.textContent = ''; return; } t.textContent = list[i].place.split(',')[0]; t.setAttribute('x', +p.dataset.x + (opts.pin || 6.5) + 7); t.setAttribute('y', +p.dataset.y + 4); };
    }
    return { svg, pins };
  });

  /* ----- homepage showcase ----- */
  // [name, place, lat, lon, photo] for tour stops that have a photo
  const TOUR = [
    ['University of Michigan', 'Ann Arbor, Michigan', 42.278, -83.738, '14'],
    ['Michigan State University', 'East Lansing, Michigan', 42.701, -84.482, '15'],
    ['Cleveland State University', 'Cleveland, Ohio', 41.502, -81.675, '06'],
    ['University of Minnesota', 'Minneapolis, Minnesota', 44.974, -93.228, '22'],
    ['Northern Illinois University', 'DeKalb, Illinois', 41.934, -88.775, '10'],
    ['University of Dayton', 'Dayton, Ohio', 39.740, -84.179, '05'],
    ['DePaul University', 'Chicago, Illinois', 41.925, -87.655, '09'],
    ['IUPUI', 'Indianapolis, Indiana', 39.774, -86.176, '00'],
    ['Vanderbilt University', 'Nashville, Tennessee', 36.144, -86.803, '13'],
    ['Georgia Tech', 'Atlanta, Georgia', 33.776, -84.396, '19'],
    ['Clemson University', 'Clemson, South Carolina', 34.678, -82.837, '02'],
    ['University of Kansas', 'Lawrence, Kansas', 38.954, -95.255, '11'],
    ['University of Oklahoma', 'Norman, Oklahoma', 35.205, -97.445, '08'],
    ['University of Texas at San Antonio', 'San Antonio, Texas', 29.583, -98.619, '20'],
    ['Colorado State University', 'Fort Collins, Colorado', 40.575, -105.085, '21']
  ];
  const show = document.querySelector('.story-show');
  if (show) {
    const feat = show.querySelector('.ss-feature'), mapHost = show.querySelector('.ss-map'), reel = show.querySelector('.ss-reel'), empty = show.querySelector('.ss-empty');
    loadStories().then(list => {
      // Until real interviews are published, the showcase shows where the team has already
      // been: the campus tour stops (same data as the "Where we've been" section).
      const tour = !list.length;
      if (tour) {
        show.classList.add('is-tour');
        empty.hidden = false;
        list = TOUR.map(([name, place, lat, lon, k]) => ({ title: name, place, lat, lon, series: 'tour', image: '/photos/tour/' + k + '.jpg', imageAlt: name + ', ' + place, href: '/#outreach' }));
      }
      const href = s => s.href || '/stories/' + s.slug;
      const kicker = s => tour ? 'Campus tour' : (LABEL[s.series] || '') + (s.sample ? ' · Sample' : '');
      const lead = tour ? list : list.slice(0, 6);
      reel.innerHTML = lead.slice(0, 6).map((s, i) => `<a class="ss-card" href="${esc(href(s))}" data-i="${i}"><span class="img"><img src="${esc(s.image)}" alt="${esc(s.imageAlt)}" loading="lazy"></span><span class="k">${kicker(s)}</span><b>${esc(s.title)}</b><span class="pl">${esc(s.place)}</span></a>`).join('');
      const cards = [...reel.children];
      let cur = -1, timer, pins = [], mapSvg = null;
      const set = i => {
        if (i === cur) return;
        cur = i;
        const s = lead[i];
        feat.classList.add('swap');
        setTimeout(() => {
          feat.innerHTML = `<a href="${esc(href(s))}"><span class="img"><img src="${esc(s.image)}" alt="${esc(s.imageAlt)}"></span><span class="ov"><span class="k">${tour ? 'Campus tour' : kicker(s) + (s.sample ? ' story' : '')}</span><b>${esc(s.title)}</b>${s.quote ? `<q>${esc(s.quote)}</q>` : ''}<span class="pl">${esc(s.place)} · ${tour ? 'See every stop' : 'Read the story'}</span></span></a>`;
          feat.classList.remove('swap');
        }, reduce ? 0 : 260);
        cards.forEach((c, j) => c.classList.toggle('on', j === i));
        pins.forEach((p, j) => p && p.classList.toggle('on', j === i));
        const on = pins[i]; if (on) on.parentNode.appendChild(on);
        if (mapSvg && mapSvg.pinLabel) mapSvg.pinLabel(i);
      };
      const loop = () => { clearInterval(timer); if (!reduce) timer = setInterval(() => set((cur + 1) % lead.length), 6500); };
      cards.forEach((c, i) => { c.addEventListener('mouseenter', () => { set(i); clearInterval(timer); }); c.addEventListener('focus', () => set(i)); });
      reel.addEventListener('mouseleave', loop);
      drawMap(mapHost, lead, tour ? { fit: 520, aspect: 1.1, pin: 8, label: true, link: false } : { fit: 560, aspect: 1.1, pin: 9, label: true }).then(m => {
        pins = m.pins; mapSvg = m.svg;
        pins.forEach((p, i) => p && p.addEventListener('mouseenter', () => { set(i); clearInterval(timer); }));
        mapHost.addEventListener('mouseleave', loop);
        const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { mapHost.classList.add('in'); io.disconnect(); } }, { threshold: .25 });
        io.observe(mapHost);
        cur = -1; set(0);
      });
      set(0); loop();
    });
  }

  /* ----- story article: locator map + more stories ----- */
  const loc = document.querySelector('.story-locator');
  if (loc) {
    const host = loc.querySelector('.loc-map');
    drawMap(host, [{ lat: +loc.dataset.lat, lon: +loc.dataset.lon, series: 'leaders', title: '', place: loc.querySelector('figcaption').textContent }], { link: false, highlight: loc.dataset.state })
      .then(m => {
        const svg = m.svg, st = svg.querySelector('path.hl');
        if (st) { const b = st.getBBox(), pad = Math.max(b.width, b.height) * 1.1; svg.setAttribute('viewBox', [b.x + b.width / 2 - pad, b.y + b.height / 2 - pad * .75, pad * 2, pad * 1.5].join(' ')); }
        m.pins[0] && m.pins[0].classList.add('on');
        host.classList.add('in');
      });
  }
  const more = document.querySelector('.more-grid');
  if (more) {
    const here = (document.querySelector('.story-head h1') || {}).textContent;
    loadStories().then(list => {
      const pick = list.filter(s => s.title !== here).slice(0, 3);
      more.innerHTML = pick.map(s => `<a class="story-card" href="/stories/${esc(s.slug)}"><div class="img"><img src="${esc(s.image)}" alt="${esc(s.imageAlt)}" loading="lazy"></div><p class="story-kicker">${LABEL[s.series] || ''}${s.sample ? ' · Sample' : ''}</p><h3>${esc(s.title)}</h3><p class="story-by">${esc(s.place)}</p></a>`).join('');
      if (!pick.length) more.remove();
    });
  }

  /* ----- stories page ----- */
  const feed = document.querySelector('.story-feed');
  if (!feed) return;
  const feature = feed.querySelector('.story-feature'), grid = feed.querySelector('.story-grid'), empty = feed.querySelector('.story-empty');
  const cardsF = [...document.querySelectorAll('.series-card')];
  const mapHost = document.querySelector('.stories-map .map-host'), popup = document.querySelector('.stories-map .map-pop');
  let stories = [], pins = [];
  const render = series => {
    cardsF.forEach(c => c.setAttribute('aria-pressed', c.dataset.series === series));
    pins.forEach((p, i) => p && p.classList.toggle('dim', series !== 'all' && stories[i].series !== series));
    const list = stories.filter(s => series === 'all' || s.series === series);
    feature.innerHTML = ''; grid.innerHTML = '';
    empty.hidden = list.length > 0;
    if (!list.length) return;
    const lead = list.find(s => s.featured) || list[0];
    const tag = s => (LABEL[s.series] || '') + (s.sample ? ' · Sample' : '');
    feature.innerHTML = `<a href="/stories/${esc(lead.slug)}"><div class="img"><img src="${esc(lead.image)}" alt="${esc(lead.imageAlt)}"></div><div><p class="story-kicker">${tag(lead)}</p><h2>${esc(lead.title)}</h2><p class="dek">${esc(lead.dek)}</p>${lead.quote ? `<p class="story-q">“${esc(lead.quote)}”</p>` : ''}<p class="story-by">${esc(lead.place)} · ${fmt(lead.date)}</p></div></a>`;
    grid.innerHTML = list.filter(s => s !== lead).map(s => `<a class="story-card" href="/stories/${esc(s.slug)}"><div class="img"><img src="${esc(s.image)}" alt="${esc(s.imageAlt)}" loading="lazy"></div><p class="story-kicker">${tag(s)}</p><h3>${esc(s.title)}</h3><p>${esc(s.dek)}</p><p class="story-by">${esc(s.place)}</p></a>`).join('');
  };
  cardsF.forEach(c => c.addEventListener('click', () => {
    render(c.dataset.series);
    history.replaceState(null, '', c.dataset.series === 'all' ? location.pathname : '#' + c.dataset.series);
  }));
  const start = LABEL[location.hash.slice(1)] ? location.hash.slice(1) : 'all';
  loadStories().then(list => {
    stories = list;
    document.querySelector('.stories-map') && document.querySelector('.stories-map').classList.toggle('is-empty', !list.length);
    render(start);
    if (!mapHost) return;
    drawMap(mapHost, stories).then(m => {
      pins = m.pins;
      render(start);
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { mapHost.classList.add('in'); io.disconnect(); } }, { threshold: .2 });
      io.observe(mapHost);
      pins.forEach((p, i) => {
        if (!p) return;
        const s = stories[i];
        p.addEventListener('mouseenter', () => {
          const box = mapHost.getBoundingClientRect(), dot = p.querySelector('.dot').getBoundingClientRect();
          popup.innerHTML = `<img src="${esc(s.image)}" alt=""><span class="k">${LABEL[s.series] || ''}${s.sample ? ' · Sample' : ''}</span><b>${esc(s.title)}</b><span class="pl">${esc(s.place)}</span>`;
          popup.style.left = (dot.left - box.left + dot.width / 2) + 'px';
          popup.style.top = (dot.top - box.top) + 'px';
          popup.classList.toggle('flip', dot.left - box.left > box.width * .62);
          popup.hidden = false;
        });
        p.addEventListener('mouseleave', () => { popup.hidden = true; });
      });
    });
  });
})();
