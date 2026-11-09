// 앱에 들어가는 오픈소스의 라이선스 문구를 모아 www/licenses.js로 만든다.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const seen = new Map();
function visit(name) {
  if (seen.has(name)) return;
  const dir = path.join(root, 'node_modules', name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) return;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = fs.readdirSync(dir).find(f => /^licen[sc]e/i.test(f));
  seen.set(name, `${name} ${pkg.version} (${pkg.license || '라이선스 표기 없음'})\n${file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : ''}`);
  Object.keys(pkg.dependencies || {}).forEach(visit);
}
const top = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
Object.keys(top.dependencies).forEach(visit);
visit('electron');
const text = [...seen.keys()].sort().map(k => seen.get(k)).join('\n\n----------\n\n')
  + '\n\n----------\n\nChromium 및 함께 포함된 구성 요소의 라이선스는 설치 폴더의 LICENSES.chromium.html에 있습니다.\n';
fs.writeFileSync(path.join(root, 'www', 'licenses.js'), `window.LICENSES = ${JSON.stringify(text)};\n`);
console.log('완료', seen.size);
