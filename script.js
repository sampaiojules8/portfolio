(function () {
  // Header border once the page scrolls
  var head = document.querySelector('.site-head');
  function onScroll() { if (head) head.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Work filters (home)
  var buttons = document.querySelectorAll('.filters button');
  var rows = document.querySelectorAll('.index li');
  var count = document.querySelector('[data-count]');
  function apply(filter) {
    var n = 0;
    rows.forEach(function (li) {
      var show = filter === 'all' || li.dataset.company === filter;
      li.hidden = !show; if (show) n++;
    });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); });
    if (count) count.textContent = n;
    document.dispatchEvent(new Event('work:filtered'));
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.dataset.filter;
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) document.startViewTransition(function () { apply(f); });
      else apply(f);
    });
  });
  if (count) count.textContent = rows.length;

  // Case study table of contents: links to sections still behind the password
  // scroll to the password form instead of doing nothing.
  document.querySelectorAll('.toc a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (document.getElementById(a.getAttribute('href').slice(1))) return;
      var vault = document.querySelector('.vault');
      if (!vault) return;
      e.preventDefault();
      vault.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = vault.querySelector('input'); if (input) input.focus({ preventScroll: true });
    });
  });
})();

// Enhancements for case-study content. Runs on the page, and again on any
// content revealed by the password form.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var links = document.querySelectorAll('.toc a');
  var io = null;
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = map[e.target.id]; if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
  }

  function enhance(root) {
    // Missing images: drop the <img> so the labelled placeholder shows
    root.querySelectorAll('.shot img').forEach(function (img) {
      if (img.hasAttribute('data-vault-src')) return;
      function fail() { img.remove(); }
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail(); else img.addEventListener('error', fail);
    });
    if (io) root.querySelectorAll('.prose section[id]').forEach(function (s) { io.observe(s); });

    root.querySelectorAll('video[autoplay]:not(.splash-video)').forEach(function (v) {
      if (v.dataset.wired) return; v.dataset.wired = '1';
      function sync() { if (reduce.matches) { v.pause(); v.currentTime = 0; } else { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      sync(); if (reduce.addEventListener) reduce.addEventListener('change', sync);
    });

    // Splash: play once, fade to the login screen, hold, then replay
    root.querySelectorAll('video.splash-video').forEach(function (v) {
      if (v.dataset.wired) return; v.dataset.wired = '1';
      var timer;
      function start() {
        clearTimeout(timer);
        if (reduce.matches) { v.pause(); v.classList.add('done'); return; }
        v.currentTime = 0; v.classList.remove('done');
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      }
      v.addEventListener('ended', function () {
        v.classList.add('done');
        timer = setTimeout(start, 3500);
      });
      start();
      if (reduce.addEventListener) reduce.addEventListener('change', start);
    });
  }
  window.siteEnhance = enhance;
  enhance(document);
})();

// Light / dark switch. Follows the system until the visitor picks; the choice is remembered.
(function () {
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() { var t = root.dataset.theme; return t ? t === 'dark' : mq.matches; }
  function sync() { btn.setAttribute('aria-checked', String(isDark())); }
  btn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    function set() { root.dataset.theme = next; sync(); }
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(set); else set();
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
  if (mq.addEventListener) mq.addEventListener('change', sync);
  sync();
})();

// Home: project rows pile up as you scroll. Each row sticks just below the ones
// before it, leaving their titles visible; a row never sticks so low that its
// bottom is cut off, and rows taller than the screen simply scroll.
(function () {
  var rows = [].slice.call(document.querySelectorAll('.index > li'));
  var head = document.querySelector('.site-head');
  if (!rows.length) return;
  function layout() {
    var hh = head ? head.offsetHeight : 0;
    var peek = window.innerWidth < 700 ? 64 : 66;
    var vh = window.innerHeight;
    var i = 0;
    rows.forEach(function (li) {
      if (li.hidden) return;
      var h = li.offsetHeight;
      var top = Math.min(hh + i * peek, vh - h);
      if (top < hh) { li.classList.add('no-stick'); li.style.top = ''; }
      else { li.classList.remove('no-stick'); li.style.top = top + 'px'; }
      li.style.zIndex = String(i + 1);
      i++;
    });
  }
  var raf;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  document.addEventListener('work:filtered', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  layout();
})();


// ✦ cursor. Mouse users only: it follows the pointer, and over anything clickable
// it turns a quarter, grows a little and goes green.
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var star = document.createElement('div');
  star.className = 'star';
  star.setAttribute('aria-hidden', 'true');
  star.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5C11.1 16.9 7.1 12.9 1.5 12 7.1 11.1 11.1 7.1 12 1.5z"/></svg>';
  document.body.appendChild(star);
  document.documentElement.classList.add('star-cursor');
  var CLICKABLE = 'a[href], button, [role="button"], [role="switch"], label, summary, select, input, textarea';
  var x = 0, y = 0, raf;
  function draw() { raf = 0; star.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    star.classList.add('on');
    if (!raf) raf = requestAnimationFrame(draw);
  }, { passive: true });
  document.addEventListener('pointerover', function (e) {
    star.classList.toggle('hot', !!(e.target.closest && e.target.closest(CLICKABLE)));
  });
  document.addEventListener('pointerdown', function () { star.classList.add('down'); });
  document.addEventListener('pointerup', function () { star.classList.remove('down'); });
  document.documentElement.addEventListener('mouseleave', function () { star.classList.remove('on'); });
})();
