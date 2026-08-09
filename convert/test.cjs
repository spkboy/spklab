'use strict';
// 로컬 샘플 .aep 파일들로 엔진을 검증한다.
const fs = require('fs');
const path = require('path');
const AEP = require('./engine.js');

const DL = 'C:/Users/tobi_vlast/Downloads';
const SAMPLES = [
  { file: `${DL}/_기타/paper-rips-folds-transitions-after-effects-2023-10-19-07-06-02-utc/Paper Rips & Folds Transitions.aep`, expectId: 'ae2022', expectConf: 'build' },
  { file: `${DL}/_기타/paper-rips-folds-transitions-after-effects-2023-10-19-07-06-02-utc/Paper Rips & Folds Transitions (17.x).aep`, expectId: 'ae2022', expectConf: 'build' },
  { file: `${DL}/_기타/paper-rips-folds-transitions-after-effects-2023-10-19-07-06-02-utc/Welcome_To_Plave_4_change_ball_4.aep`, expectId: 'ae2023', expectConf: 'build' },
  { file: `${DL}/_기타/energy-hand-drawn-transitions-after-effects-2023-07-14-09-22-42-utc/Energy transitions.aep`, expectId: 'ae2022', expectConf: 'build' },
  { file: `${DL}/_VFX_에셋/grunge-transitions-2023-02-28-09-37-07-utc/Grunge Transitions/Grunge Transitions.aep`, expectId: 'ae2022', expectConf: 'build' },
  { file: `${DL}/_VFX_에셋/Particles Credits/After Effects/Particles Credits.aep`, expectId: 'ae2022', expectConf: 'build' },
  { file: `${DL}/_3D모델_에셋/the-universe-2021-08-31-06-51-25-utc/The Universe v2.aep`, expectId: 'ae2021', expectConf: 'exact' },
  { file: `${DL}/_VFX_에셋/glitch-transition-2023-11-27-05-21-22-utc/Glitch_AE_CS4Project.aep`, expectId: null, expectConf: 'legacy' },
  { file: `${DL}/_VFX_에셋/glitch-transitions-2022-08-03-05-40-32-utc/Glitch_AE_CS4Project.aep`, expectId: null, expectConf: 'legacy' },
];

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

console.log('== 1) 샘플 파싱 + 버전 감지');
for (const s of SAMPLES) {
  const name = path.basename(s.file);
  let bytes;
  try { bytes = new Uint8Array(fs.readFileSync(s.file)); }
  catch (e) { console.log(`  skip ${name} (읽기 실패: ${e.message})`); continue; }
  try {
    const info = AEP.parse(bytes);
    console.log(`  · ${name}\n      sig=[${AEP.hex(info.signature)}] → ${info.detected.label} (${info.detected.confidence})`);
    const gotId = info.detected.version ? info.detected.version.id : null;
    check(`${name}: 기대 버전`, gotId === s.expectId, `got ${gotId}`);
    check(`${name}: 기대 신뢰도`, info.detected.confidence === s.expectConf || (s.expectConf === 'build' && info.detected.confidence === 'exact'), `got ${info.detected.confidence}`);
  } catch (e) {
    fail++; console.log(`  FAIL ${name}: ${e.message}`);
  }
}

console.log('== 2) 패치 라운드트립 (2023 파일 → 각 버전 → 재감지)');
{
  const src = new Uint8Array(fs.readFileSync(SAMPLES[2].file));
  const orig = new Uint8Array(src); // 원본 불변 확인용 사본
  for (const v of AEP.VERSIONS) {
    const r = AEP.patch(src, v.id);
    const re = AEP.parse(r.bytes);
    const gotId = re.detected.version ? re.detected.version.id : null;
    const wantConf = v.verified ? 'exact' : undefined;
    check(`→ ${v.id}: 재감지 일치`, gotId === v.id, `got ${gotId} (${re.detected.label})`);
    if (wantConf) check(`→ ${v.id}: exact 시그니처`, re.detected.confidence === 'exact', re.detected.confidence);
    check(`→ ${v.id}: 파일 크기 불변`, r.bytes.length === src.length);
    // 변경 바이트가 head 시그니처 범위 안에만 있는지
    const info = AEP.parse(src);
    const okRange = r.changed.every(c => c.offset >= info.head.offset && c.offset < info.head.offset + 8);
    check(`→ ${v.id}: 변경이 head 시그니처에 국한 (${r.changed.length}바이트)`, okRange);
  }
  check('원본 배열 불변', Buffer.compare(Buffer.from(src), Buffer.from(orig)) === 0);
}

console.log('== 2.5) Premiere .prproj 엔진');
{
  const zlib = require('zlib');
  const P = require('./prproj.js');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<PremiereData Version="3">\n' +
    '<Project ObjectRef="1"/>\n<Project ObjectID="1" ClassID="62ad66dd-0dcd-42da-a660-6d8fbde94876" Version="42">\n' +
    '<Node Version="1"/>\n</Project>\n</PremiereData>';
  check('버전 파싱 = 42', P.parseXml(xml).version === 42);
  const r = P.patchXml(xml);
  check('패치 후 Version=1', /Version="1"/.test(r.xml.match(/<Project ObjectID[^>]*>/)[0]) && r.from === 42);
  check('다른 요소는 불변', r.xml.includes('ClassID="62ad66dd-0dcd-42da-a660-6d8fbde94876"') && r.xml.includes('<Node Version="1"/>'));
  const gz = zlib.gzipSync(Buffer.from(xml));
  check('gzip 매직 감지', P.isGzip(new Uint8Array(gz)));
  check('gunzip 라운드트립', P.parseXml(zlib.gunzipSync(gz).toString()).version === 42);
  let threw = false;
  try { P.parseXml('<?xml version="1.0"?><NotPremiere/>'); } catch { threw = true; }
  check('비-프리미어 XML 거부', threw);
}

console.log('== 3) 비정상 입력 거부');
{
  let threw = false;
  try { AEP.parse(new Uint8Array([1, 2, 3])); } catch { threw = true; }
  check('3바이트 쓰레기 거부', threw);
  threw = false;
  const fake = new Uint8Array(64); fake.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF" (리틀엔디안 wav 등)
  try { AEP.parse(fake); } catch { threw = true; }
  check('RIFF(non-RIFX) 거부', threw);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
