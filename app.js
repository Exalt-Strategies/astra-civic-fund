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
  const stats = document.querySelectorAll('[data-count]');
  const render = (el, v) => {
    const dec = +(el.dataset.dec || 0);
    el.innerHTML = v.toFixed(dec) + (el.dataset.suffix || '') + (el.dataset.sup ? '<sup>' + el.dataset.sup + '</sup>' : '');
  };
  if (!reduce) {
    const so = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      so.unobserve(e.target);
      const el = e.target, end = +el.dataset.count, t0 = performance.now(), dur = 1400;
      const tick = t => {
        const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
        render(el, end * k);
        if (p < 1) requestAnimationFrame(tick);
      };
      render(el, 0);
      requestAnimationFrame(tick);
    }), { threshold: .6 });
    stats.forEach(el => so.observe(el));
  }

  /* ---------- where we work: map + tabs ---------- */
  const STATES = {
    mi: { name: 'Michigan', tag: 'Anchor', phase: 'Phase One · First ground', img: 'photos/mi-capitol.jpg', pos: 'center 35%',
      alt: 'A delegation of young Indian Americans on the steps of the Michigan State Capitol in Lansing',
      cap: 'On the steps of the State Capitol in Lansing',
      desc: 'Engineering corridors, university towns, suburban Detroit, and a rapidly growing political community looking for a home.' },
    il: { name: 'Illinois', tag: 'Density', phase: 'Phase One · First ground', img: 'photos/img-5167.jpg', pos: 'center',
      alt: 'Cultural night at a community gathering with a classical dance performance on stage',
      cap: 'Cultural night meets civic engagement',
      desc: "Chicagoland's deep Indian American density makes it a training ground for chapter-building, voter contact, and candidate pipelines." },
    oh: { name: 'Ohio', tag: 'Battleground', phase: 'Phase One · First ground', img: 'photos/img-0329.jpg', pos: 'center 30%',
      alt: 'A young organizer holding a microphone during a community Q&A session',
      cap: 'Community conversation, taking the mic on civic issues',
      desc: "Motel families, university communities, small-business owners: the constituency national campaigns skip past. We won't." },
    mn: { name: 'Minnesota', tag: 'Twin Cities', phase: 'Phase Two · Then outward', img: 'photos/img-3668.jpg', pos: 'center 30%',
      alt: 'Two young women at a Diwali celebration holding up their voting plan cards',
      cap: 'Get-out-the-vote night at a Diwali celebration',
      desc: 'Engineering and medical communities, growing university chapters, and an active Indian American civic culture ready to scale.' },
    nc: { name: 'North Carolina', tag: 'Research Triangle', phase: 'Phase Two · Then outward', img: 'photos/img-9811.jpg', pos: 'center 30%',
      alt: 'Two students at a campus voter registration table',
      cap: 'Campus voter registration drive',
      desc: "Raleigh-Durham, the Charlotte tech corridor, and the South's fastest-growing Indian American population." },
    pa: { name: 'Pennsylvania', tag: 'Suburbs & Steel', phase: 'Phase Two · Then outward', img: 'photos/img-5652.jpg', pos: 'center',
      alt: 'A speaker addressing a packed theater at a major community gathering',
      cap: 'A packed house at a community town hall',
      desc: 'Philadelphia suburbs, the Pittsburgh tech-and-medical corridor, and a swing-state legacy that makes every cycle count.' }
  };

  const card = document.getElementById('state-card');
  const tabs = [...document.querySelectorAll('.state-tab')];
  const shapes = [...document.querySelectorAll('.map .focus path')];
  if (!card) return;
  const img = card.querySelector('img'), cap = card.querySelector('figcaption');
  const nm = card.querySelector('.nm'), tag = card.querySelector('.tag'), meta = card.querySelector('.meta'), desc = card.querySelector('.desc');
  let current = 'mi', swapT;

  // preload state photos once the section is near
  const pre = new IntersectionObserver(es => { if (es[0].isIntersecting) { Object.values(STATES).forEach(s => { const i = new Image(); i.src = s.img; }); pre.disconnect(); } }, { rootMargin: '600px' });
  pre.observe(card);

  const select = (id, focus) => {
    if (!STATES[id]) return;
    tabs.forEach(t => {
      const on = t.dataset.state === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    shapes.forEach(p => p.classList.toggle('on', p.dataset.state === id));
    if (id === current) return;
    current = id;
    const s = STATES[id];
    const apply = () => {
      img.src = s.img; img.alt = s.alt; img.style.objectPosition = s.pos;
      cap.textContent = s.cap; nm.textContent = s.name; tag.textContent = s.tag; meta.textContent = s.phase; desc.textContent = s.desc;
      card.classList.remove('swap');
    };
    clearTimeout(swapT);
    if (reduce) return apply();
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

  // arc lengths for the draw-in
  document.querySelectorAll('.map .arcs path').forEach(p => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));
})();
