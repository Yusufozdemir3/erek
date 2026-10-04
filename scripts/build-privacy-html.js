// Builds docs/index.html (the public privacy page) from docs/privacy-policy.md,
// so the two can't drift apart. Run: node scripts/build-privacy-html.js
// Handles only what the policy uses: headings, paragraphs, bullet lists,
// **bold**, bare URLs and e-mail addresses.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mdPath = path.join(root, 'docs', 'privacy-policy.md');
const htmlPath = path.join(root, 'docs', 'index.html');

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  let out = esc(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(https?:\/\/[^\s<)]+[^\s<).,;:])/g, '<a href="$1">$1</a>');
  out = out.replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b/g, '<a href="mailto:$1">$1</a>');
  return out;
}

// Anchors other pages link to (the Play Console "delete account" URL points here).
const HEADING_IDS = { tr: { 7: 'hesap-silme' }, en: { 7: 'delete-account' } };

function render(lines, lang) {
  const html = [];
  let para = [];
  let list = null; // array of strings (one per item)
  let sawLead = false;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    para = [];
    if (!sawLead && /^\*\*(Kısaca|In short):\*\*/.test(text)) {
      sawLead = true;
      html.push(`    <div class="lead">\n      ${inline(text)}\n    </div>`);
    } else {
      html.push(`    <p>${inline(text)}</p>`);
    }
  };
  const flushList = () => {
    if (!list) return;
    html.push('    <ul>\n' + list.map((i) => `      <li>${inline(i)}</li>`).join('\n') + '\n    </ul>');
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flushPara();
      continue; // a blank line does not end a list: items may be separated by it
    }
    const h = /^### (\d+)\. (.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const id = HEADING_IDS[lang][h[1]];
      html.push(`    <h3${id ? ` id="${id}"` : ''}>${inline(`${h[1]}. ${h[2]}`)}</h3>`);
      continue;
    }
    const li = /^- (.*)$/.exec(line);
    if (li) {
      flushPara();
      (list = list || []).push(li[1]);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list[list.length - 1] += ' ' + line.trim();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return html.join('\n\n');
}

const md = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
const date = /Yürürlük tarihi \/ Effective date: \*\*(.+?)\*\*/.exec(md);
if (!date) throw new Error('effective date line not found in privacy-policy.md');

const trStart = md.indexOf('\n## Türkçe\n');
const enStart = md.indexOf('\n## English\n');
if (trStart < 0 || enStart < 0) throw new Error('language sections not found');
const trLines = md.slice(trStart + '\n## Türkçe\n'.length, enStart).replace(/\n---\s*$/, '').split('\n');
const enLines = md.slice(enStart + '\n## English\n'.length).split('\n');

// Keep the existing page's <head>/CSS: everything up to the <h1> line.
const old = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
const headEnd = old.indexOf('      <h1>');
if (headEnd < 0) throw new Error('template <h1> not found in docs/index.html');

const page = `${old.slice(0, headEnd)}      <h1>Erek — Gizlilik Politikası</h1>
      <p class="eff">Yürürlük tarihi / Effective date: ${esc(date[1])}</p>
    </header>

    <!-- Türkçe -->
    <span class="lang-tag">Türkçe</span>

${render(trLines, 'tr')}

    <!-- English -->
    <h2><span class="lang-tag">English</span></h2>

${render(enLines, 'en')}

    <footer>© 2026 Erek</footer>
  </div>
</body>
</html>
`;

fs.writeFileSync(htmlPath, page);
console.log(`wrote ${path.relative(root, htmlPath)} (${page.length} bytes)`);
