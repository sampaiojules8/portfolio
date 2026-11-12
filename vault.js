// Unlocks a case study's password-protected part. The locked HTML and its images
// are encrypted (see tools/vault.mjs); this decrypts them in the browser.
// A correct password is remembered, so the other locked case studies open too.
(function () {
  var vault = document.querySelector('.vault');
  if (!vault) return;
  var form = vault.querySelector('.vault-form');
  var input = vault.querySelector('input');
  var msg = vault.querySelector('.vault-msg');
  var dataEl = vault.querySelector('.vault-data');
  var subtle = window.crypto && window.crypto.subtle;
  var STORE = 'vault-pass';
  var NOPES = [
    'Not quite. The greyhound remains unimpressed.',
    'Nope. Security is now making direct eye contact.',
    'Still no. Check for typos, or email me and skip the line.'
  ];
  var tries = 0;

  function bytes(b64) {
    var bin = atob(b64.replace(/\s/g, '')), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function norm(p) { return p.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function getKey(pw) {
    return subtle.importKey('raw', new TextEncoder().encode(norm(pw)), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: bytes(vault.dataset.salt), iterations: +vault.dataset.iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  function decrypt(key, u8) {
    return subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, key, u8.slice(12)).then(function (b) { return new Uint8Array(b); });
  }

  function loadAsset(key, el, attr) {
    var url = el.getAttribute('data-vault-' + attr);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
      .then(function (buf) { return decrypt(key, new Uint8Array(buf)); })
      .then(function (plain) {
        el.setAttribute(attr, URL.createObjectURL(new Blob([plain], { type: el.getAttribute('data-vault-type') })));
        el.removeAttribute('data-vault-' + attr);
      });
  }

  function open(pw, remember) {
    return getKey(pw).then(function (key) {
      return decrypt(key, bytes(dataEl.textContent)).then(function (plain) {
        try { if (remember) localStorage.setItem(STORE, pw); } catch (e) {}
        var tpl = document.createElement('template');
        tpl.innerHTML = new TextDecoder().decode(plain);
        var content = tpl.content;
        var assets = [].slice.call(content.querySelectorAll('[data-vault-src], [data-vault-poster]'));
        var article = vault.parentNode;
        vault.replaceWith(content);
        var jobs = [];
        assets.forEach(function (el) {
          if (el.hasAttribute('data-vault-poster')) jobs.push(loadAsset(key, el, 'poster'));
          if (el.hasAttribute('data-vault-src')) jobs.push(loadAsset(key, el, 'src'));
        });
        return Promise.all(jobs).catch(function () {}).then(function () {
          if (window.siteEnhance) window.siteEnhance(article);
          if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
        });
      });
    });
  }

  // Easter egg: the head of security peeks out on hover, focus or tap, and after a wrong guess.
  var guardTimer;
  var sec = vault.querySelector('.security');
  function peek(on) { vault.classList.toggle('peek', on); if (sec) sec.setAttribute('aria-expanded', String(on)); }
  if (sec) {
    sec.addEventListener('mouseenter', function () { clearTimeout(guardTimer); peek(true); });
    sec.addEventListener('mouseleave', function () { peek(false); });
    sec.addEventListener('focus', function () { peek(true); });
    sec.addEventListener('blur', function () { peek(false); });
    sec.addEventListener('click', function () { clearTimeout(guardTimer); peek(true); });
    sec.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearTimeout(guardTimer); peek(true); } });
  }
  function alarm() { clearTimeout(guardTimer); peek(true); guardTimer = setTimeout(function () { peek(false); }, 2200); }

  if (!subtle) {
    msg.textContent = 'This browser can’t open the locked part. Try a current version of Chrome, Safari or Firefox, or email me.';
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  var busy = false;
  function attempt() {
    var pw = input.value;
    if (busy || !norm(pw)) { if (!norm(pw)) input.focus(); return; }
    busy = true;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; msg.textContent = 'Checking the list…';
    open(pw, true).catch(function () {
      msg.textContent = NOPES[Math.min(tries++, NOPES.length - 1)];
      vault.classList.remove('nope'); void vault.offsetWidth; vault.classList.add('nope');
      alarm();
      input.select();
    }).then(function () { btn.disabled = false; busy = false; });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); attempt(); });
  // Return / Enter submits even when a browser or password manager swallows the form submit
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); attempt(); }
  });

  // Show / hide password
  var eye = vault.querySelector('.vault-eye');
  if (eye) eye.addEventListener('click', function () {
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    input.focus();
  });

  // Already let in on another case study? Open straight away.
  var saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  if (saved) open(saved, false).catch(function () { try { localStorage.removeItem(STORE); } catch (e) {} });
})();
