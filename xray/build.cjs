'use strict';
// template.html에 engine.js를 인라인해 단일 파일 index.html을 생성한다.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const template = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
if (!template.includes('/*__ENGINE__*/')) throw new Error('template.html에 /*__ENGINE__*/ 마커가 없습니다');
const out = template.replace('/*__ENGINE__*/', () => engine);
fs.writeFileSync(path.join(dir, 'index.html'), out);
console.log('index.html 생성 완료 (' + out.length + ' bytes)');
