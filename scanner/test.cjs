'use strict';
// 로컬 샘플 .aep로 X-Ray 엔진을 검증한다.
const fs = require('fs');
const path = require('path');
const X = require('./engine.js');

const DL = 'C:/Users/tobi_vlast/Downloads';
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function load(f) { return new Uint8Array(fs.readFileSync(f)); }

console.log('== 1) Particles Credits: Trapcode Particular 감지');
{
  const r = X.parse(load(`${DL}/_VFX_에셋/Particles Credits/After Effects/Particles Credits.aep`));
  const tp = r.required.find(e => e.matchName === 'tc Particular');
  check('tc Particular = 서드파티(Trapcode)', !!tp && /Trapcode/.test(tp.vendor));
  check('displayName 추출', !!(tp && tp.displayName), tp && tp.displayName);
  check('CC Glass는 내장 분류', r.effects.find(e => e.matchName === 'CC Glass').status === 'builtin');
  check('ADBE Tint는 내장 분류', r.effects.find(e => e.matchName === 'ADBE Tint').status === 'builtin');
  check('comps/layers 카운트 존재', r.comps > 0 && r.layers > 0, `comps=${r.comps} layers=${r.layers}`);
  console.log(`     → required: ${r.required.map(e => e.matchName).join(', ')}`);
}

console.log('== 2) Welcome_To_Plave: MB/tc/PEDG 감지');
{
  const r = X.parse(load(`${DL}/_기타/paper-rips-folds-transitions-after-effects-2023-10-19-07-06-02-utc/Welcome_To_Plave_4_change_ball_4.aep`));
  const names = r.required.map(e => e.matchName);
  check('MB LookSuite3 감지 (Magic Bullet)', names.includes('MB LookSuite3'));
  check('tc 3DStrokePath 감지 (Trapcode)', names.includes('tc 3DStrokePath'));
  check('PEDG 감지 (Deep Glow)', names.includes('PEDG'));
  check('미확인 목록에 AGPRetroDither', r.unknown.some(e => e.matchName === 'AGPRetroDither'));
  console.log(`     → required: ${names.join(', ')}`);
  console.log(`     → unknown: ${r.unknown.map(e => e.matchName).join(', ')}`);
}

console.log('== 2.5) 버전 감지 + 폰트 추출 (Welcome_To_Plave)');
{
  const r = X.parse(load(`${DL}/_기타/paper-rips-folds-transitions-after-effects-2023-10-19-07-06-02-utc/Welcome_To_Plave_4_change_ball_4.aep`));
  check('저장 버전 = AE 2023', !!r.version && r.version.label.includes('2023'), r.version && r.version.label);
  const names = r.fonts.map(f => f.name);
  check('폰트 ByteBounce 추출', names.includes('ByteBounce'), names.join(','));
  check('AdobeInvisFont 제외', !names.includes('AdobeInvisFont'));
  check('Myriad-Roman은 기본폰트 태그', r.fonts.find(f => f.name === 'Myriad-Roman')?.isDefault === true);
  console.log(`     → fonts: ${names.join(', ')}`);
}

console.log('== 3) The Universe: APC Shatter는 내장으로 분류');
{
  const r = X.parse(load(`${DL}/_3D모델_에셋/the-universe-2021-08-31-06-51-25-utc/The Universe v2.aep`));
  check('APC Shatter = builtin', r.effects.find(e => e.matchName === 'APC Shatter').status === 'builtin');
  check('서드파티 0개', r.required.length === 0, r.required.map(e => e.matchName).join(','));
}

console.log('== 4) 깨끗한 프로젝트(AE 2026 저장, 이펙트 없음)');
{
  const f = 'C:/Users/TOBI_V~1/AppData/Local/Temp/claude/C--Users-tobi-vlast-Downloads/eaa903d3-0d82-422b-a627-ec770de75f5b/scratchpad/aeptest/test2026_original.aep';
  if (fs.existsSync(f)) {
    const r = X.parse(load(f));
    check('서드파티 0, 미확인 0', r.required.length === 0 && r.unknown.length === 0);
    check('comps=1', r.comps === 1, `comps=${r.comps}`);
  } else console.log('  skip (파일 없음)');
}

console.log('== 4.5) Premiere .prproj 파서');
{
  const zlib = require('zlib');
  const synth = `<?xml version="1.0"?><PremiereData Version="3">
<Project ObjectID="1" ClassID="x" Version="43"></Project>
<Sequence ObjectID="2"></Sequence>
<VideoClip ObjectID="3"></VideoClip>
<VideoFilterComponent ObjectID="10"><Component Version="6"><DisplayName>Motion</DisplayName><Intrinsic>true</Intrinsic></Component><MatchName>AE.ADBE Motion</MatchName></VideoFilterComponent>
<VideoFilterComponent ObjectID="11"><Component Version="6"><DisplayName>S_Glow</DisplayName><Intrinsic>false</Intrinsic></Component><MatchName>AE.S_Glow</MatchName></VideoFilterComponent>
<VideoFilterComponent ObjectID="12"><Component Version="6"><DisplayName>Mask</DisplayName><Intrinsic>false</Intrinsic></Component><MatchName>AE.ADBE AEMask</MatchName></VideoFilterComponent>
</PremiereData>`;
  const r = X.parsePrprojXml(synth);
  check('내부 버전 43', r.version.rev === 43);
  check('intrinsic(Motion) 제외', !r.effects.some(e => e.matchName === 'AE.ADBE Motion'));
  check('AE.S_Glow → Sapphire 서드파티', r.required.length === 1 && /Sapphire/.test(r.required[0].vendor));
  check('AE.ADBE AEMask → 내장', r.effects.find(e => e.matchName === 'AE.ADBE AEMask').status === 'builtin');
  check('시퀀스/클립 카운트', r.sequences === 1 && r.clips === 1);
  let threw = false;
  try { X.parsePrprojXml('<?xml version="1.0"?><NotPremiere/>'); } catch { threw = true; }
  check('비-프리미어 XML 거부', threw);

  // 실제 사용자 프로젝트 (읽기 전용)
  const real = 'C:/Users/tobi_vlast/Desktop/240228_영상취합.prproj';
  if (fs.existsSync(real)) {
    const xml = zlib.gunzipSync(fs.readFileSync(real)).toString('utf8');
    const rr = X.parsePrprojXml(xml);
    check('실파일: 서드파티 0', rr.required.length === 0, rr.required.map(e=>e.matchName).join(','));
    check('실파일: AEMask 내장 감지', rr.effects.some(e => e.matchName === 'AE.ADBE AEMask' && e.status === 'builtin'));
    check('실파일: intrinsic 제외됨', !rr.effects.some(e => e.matchName === 'AE.ADBE Motion'));
  } else console.log('  skip (실파일 없음)');
}

console.log('== 5) 비정상 입력 거부');
{
  let threw = false;
  try { X.parse(new Uint8Array([1, 2, 3])); } catch { threw = true; }
  check('쓰레기 입력 거부', threw);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
