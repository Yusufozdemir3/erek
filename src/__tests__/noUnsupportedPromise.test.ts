// React Native runs app code on a Promise polyfill that lacks Promise.allSettled
// and Promise.any (Node, where the tests run, has both — so a screen using them
// passes every test and then crashes on the phone with "undefined is not a
// function"; this happened with the font picker). This keeps them out of the app.

import * as fs from 'fs';
import * as path from 'path';

const ROOTS = ['src', 'app'].map((d) => path.join(__dirname, '..', '..', d));
const FORBIDDEN = /Promise\.(allSettled|any)\s*\(/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('React Native\'in Promise\'inde olmayan işlevler', () => {
  it('uygulama kodunda Promise.allSettled / Promise.any kullanılmaz', () => {
    const offenders = ROOTS.flatMap((r) => sourceFiles(r)).filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(path.join(__dirname, '..', '..'), f))).toEqual([]);
  });
});
