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
    mi: { name: 'Michigan', img: 'photos/mi-capitol.jpg', pos: 'center 35%',
      alt: 'A delegation of young Indian Americans on the steps of the Michigan State Capitol in Lansing',
      cap: 'Michigan State Capitol, Lansing',
      desc: 'Engineering corridors, university towns, suburban Detroit, and a rapidly growing political community looking for a home.' },
    il: { name: 'Illinois', img: 'photos/il-niu.jpg', pos: 'center',
      alt: 'A crowd of students in a ballroom at Northern Illinois University',
      cap: 'Northern Illinois University, DeKalb, 2022',
      desc: "Chicagoland's deep Indian American density makes it a training ground for chapter-building, voter contact, and candidate pipelines." },
    oh: { name: 'Ohio', img: 'photos/img-0329.jpg', pos: 'center 30%',
      alt: 'A speaker holding a microphone talks with students seated at round tables at Cleveland State University',
      cap: 'Cleveland State University, 2022',
      desc: "Motel families, university communities, small-business owners: the constituency national campaigns skip past. We won't." },
    mn: { name: 'Minnesota', img: 'photos/tour/22.jpg', pos: 'center',
      alt: 'A speaker on stage in front of a full auditorium at the University of Minnesota',
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
    ['Nov 27', 'November 27',  'Colorado State University', 'Fort Collins, Colorado', 'csu'],
    ['Dec 3',  'December 3',   'University of Minnesota', 'Minneapolis, Minnesota', '22']
  ];
  const photo = k => k === 'csu' ? 'photos/img-5167.jpg' : 'photos/tour/' + k + '.jpg';

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
