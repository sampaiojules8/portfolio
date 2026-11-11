#!/usr/bin/env node
// Password-locks part of a case study, for real: the locked HTML and the images
// and videos only it uses are encrypted (AES-256-GCM, key from PBKDF2-SHA256),
// so the published files hold no readable copy. vault.js decrypts in the browser.
//
//   VAULT_PASSWORD='…' node tools/vault.mjs lock   page.html [more.html …]
//   VAULT_PASSWORD='…' node tools/vault.mjs unlock page.html [more.html …]
//
// lock   expects the part to hide wrapped in <!-- vault:start --> … <!-- vault:end -->.
// unlock puts that plain HTML (and the plain image/video files) back, markers
//        included, so the page can be edited; run lock again afterwards.
// Passwords are compared loosely: case, punctuation and extra spaces are ignored.

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SALT = 'anVsZXMtc2FtcGFpby12YXVsdC12MQ=='; // not secret; shared by every locked page
const ITER = 310000;
const EMAIL = 'sampaiojuliana08@gmail.com';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const norm = (p) => p.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function getKey(password) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(SALT, 'base64'), iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
async function decrypt(key, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}

const START = '<!-- vault:start -->', END = '<!-- vault:end -->';
const VAULT_RE = /<div class="vault"[^>]*>[\s\S]*?<script type="application\/octet-stream" class="vault-data">([A-Za-z0-9+/=\s]+)<\/script>\s*<\/div><!-- \/vault -->/;

function gate(data) {
  return `<div class="vault" data-salt="${SALT}" data-iter="${ITER}">
  <div class="vault-card">
    <img class="guard" src="images/guard.webp" alt="My Italian greyhound, head of security, peering over a laptop" width="280" height="280" loading="lazy">
    <div class="vault-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="4" y="10" width="16" height="11" rx="3" fill="currentColor"/></svg></div>
    <h2 class="vault-title">The rest is behind the velvet rope.</h2>
    <p class="vault-copy">Some of this work is still confidential, and<br> <span class="security" role="button" tabindex="0" aria-expanded="false">my head of security, an Italian greyhound,</span><br> takes that very seriously. Got the password? Come on in.</p>
    <form class="vault-form">
      <label class="sr-only" for="vault-pw">Password</label>
      <input id="vault-pw" name="password" type="password" placeholder="Password" autocomplete="off" autocapitalize="off" spellcheck="false" required>
      <button class="btn solid" type="submit">Let me in</button>
    </form>
    <p class="vault-msg" role="status" aria-live="polite"></p>
    <p class="vault-alt">No password? <a href="mailto:${EMAIL}">Email me</a> and I’ll happily walk you through it.</p>
  </div>
  <script type="application/octet-stream" class="vault-data">${data}</script>
</div><!-- /vault -->`;
}

// Text of every page with locked/marked parts removed: an asset referenced here stays public.
function publicText(exceptFile, exceptFragment) {
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => {
    let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (f === exceptFile) s = s.replace(exceptFragment, '');
    const a = s.indexOf(START), b = s.indexOf(END);
    if (a !== -1 && b !== -1) s = s.slice(0, a) + s.slice(b);
    return s.replace(VAULT_RE, '');
  }).join('\n');
}

async function lock(file, key) {
  const fp = path.join(ROOT, file);
  let html = fs.readFileSync(fp, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a === -1 || b === -1) throw new Error(`${file}: no ${START} … ${END} markers`);
  let frag = html.slice(a + START.length, b);
  const pub = publicText(file, frag);
  const done = new Map();
  const refs = [...frag.matchAll(/\s(src|poster)="(images\/[^"]+)"/g)];
  for (const [whole, attr, rel] of refs) {
    if (pub.includes(rel)) continue; // also shown publicly somewhere: leave it alone
    const type = MIME[path.extname(rel).toLowerCase()];
    if (!type) throw new Error(`${file}: unknown file type ${rel}`);
    if (!done.has(rel)) {
      const src = path.join(ROOT, rel);
      fs.writeFileSync(src + '.enc', await encrypt(key, fs.readFileSync(src)));
      fs.unlinkSync(src);
      done.set(rel, type);
    }
    frag = frag.replace(whole, ` data-vault-${attr}="${rel}.enc" data-vault-type="${type}"`);
  }
  const data = b64(await encrypt(key, new TextEncoder().encode(frag)));
  html = html.slice(0, a) + gate(data) + html.slice(b + END.length);
  fs.writeFileSync(fp, html);
  console.log(`locked ${file}: ${done.size} files encrypted`);
}

async function unlock(file, key) {
  const fp = path.join(ROOT, file);
  let html = fs.readFileSync(fp, 'utf8');
  const m = html.match(VAULT_RE);
  if (!m) throw new Error(`${file}: no locked section`);
  let frag;
  try { frag = new TextDecoder().decode(await decrypt(key, Buffer.from(m[1].replace(/\s/g, ''), 'base64'))); }
  catch { throw new Error(`${file}: wrong password`); }
  const restored = new Set();
  for (const [whole, attr, rel] of [...frag.matchAll(/ data-vault-(src|poster)="(images\/[^"]+)\.enc" data-vault-type="[^"]+"/g)]) {
    const enc = path.join(ROOT, rel + '.enc');
    if (!restored.has(rel) && fs.existsSync(enc)) {
      fs.writeFileSync(path.join(ROOT, rel), await decrypt(key, fs.readFileSync(enc)));
      fs.unlinkSync(enc);
      restored.add(rel);
    }
    frag = frag.replace(whole, ` ${attr}="${rel}"`);
  }
  html = html.replace(m[0], START + frag + END);
  fs.writeFileSync(fp, html);
  console.log(`unlocked ${file}: ${restored.size} files restored`);
}

const [cmd, ...files] = process.argv.slice(2);
const pw = process.env.VAULT_PASSWORD;
if (!['lock', 'unlock'].includes(cmd) || !files.length || !pw) {
  console.error("usage: VAULT_PASSWORD='…' node tools/vault.mjs lock|unlock page.html [more.html …]");
  process.exit(1);
}
const key = await getKey(pw);
try {
  for (const f of files) await (cmd === 'lock' ? lock : unlock)(path.basename(f), key);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
