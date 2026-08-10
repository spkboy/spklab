'use strict';
// convert/index.html(빌드 산출물)을 기반으로 검색어 전용 랜딩 페이지를 생성한다.
// 실제 변환기 전체가 포함된 진짜 도구 페이지 + 영문 SEO 콘텐츠 섹션.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const base = fs.readFileSync(path.join(ROOT, 'convert/index.html'), 'utf8');

const VARIANTS = [
  {
    dir: 'premiere-downgrader',
    title: 'Premiere Pro Downgrader — Free Online .prproj Version Converter · SPKLAB',
    desc: 'Free Premiere Pro downgrader: convert a .prproj saved in a newer version so any older Premiere Pro can open it. Runs 100% in your browser — no upload, no signup. 프리미어 프로젝트 다운그레이드.',
    h1swap: ['<span id="heroExt">.AEP</span>', '<span id="heroExt">.PRPROJ</span>'],
    defaultTab: 'prproj',
    ldName: 'SPKLAB Premiere Pro Downgrader',
    section: `
<section style="max-width:760px;margin:0 auto;padding:24px 24px 64px">
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">Free Premiere Pro Downgrader</h2>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:14px">Got the dreaded
  <i>"This project was saved in a newer version of Adobe Premiere Pro"</i> error? This downgrader
  converts your <code>.prproj</code> so that <b>any older version of Premiere Pro</b> can open it.
  A .prproj is gzip-compressed XML with a version number inside — this tool rewrites that number,
  and older Premiere opens the file as a migrated project. Sequences, cuts and basic effects carry over.</p>
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">Why use this one?</h2>
  <ul style="font-size:14.5px;line-height:1.9;margin:0 0 14px 20px">
    <li><b>No upload.</b> Your project never leaves your computer — everything runs locally in the browser. Safe for NDA/client work.</li>
    <li><b>Free, no signup, no watermark.</b></li>
    <li><b>Original untouched.</b> You always get a converted copy; your source file is never modified.</li>
    <li><b>Also does After Effects.</b> Switch to the Ae tab to downgrade <code>.aep</code> files (2020–2026).</li>
  </ul>
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">FAQ</h2>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:10px"><b>Which versions are supported?</b><br>
  Any .prproj from any Premiere Pro version. The converted copy opens in any older version, which then migrates it automatically.</p>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:10px"><b>Will I lose anything?</b><br>
  Features that don't exist in the older version (newer graphics/effects) may be dropped during migration — same as with any downgrade method. Keep your original and skim the timeline after opening.</p>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:10px"><b>Does it work with Auto-Save files?</b><br>
  Yes — Auto-Save .prproj files are the same format.</p>
  <p style="font-size:14.5px;line-height:1.9"><a href="../guides/premiere-newer-version-error/" style="color:inherit"><b>Full guide: fixing the "saved in a newer version" error →</b></a></p>
</section>`
  },
  {
    dir: 'after-effects-downgrader',
    title: 'After Effects Downgrader — Open a Newer .aep in Older AE (Free) · SPKLAB',
    desc: 'Free After Effects downgrader: convert an .aep saved in a newer version (2020–2026) so an older AE can open it. Runs 100% in your browser — no upload, no signup. 애프터이펙트 프로젝트 다운그레이드.',
    h1swap: null,
    defaultTab: null,
    ldName: 'SPKLAB After Effects Downgrader',
    section: `
<section style="max-width:760px;margin:0 auto;padding:24px 24px 64px">
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">Free After Effects Downgrader</h2>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:14px">After Effects refuses to open any
  project saved by a newer version — a 2026 <code>.aep</code> won't open in AE 2025. This tool fixes
  that: it detects which version saved your file and converts it to the version you choose
  (2020–2026). Every .aep stores a version signature in its header, and older AE rejects the file on
  that check alone; this converter rewrites the signature while leaving your project data untouched.</p>
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">Why use this one?</h2>
  <ul style="font-size:14.5px;line-height:1.9;margin:0 0 14px 20px">
    <li><b>No upload.</b> Files are processed locally in your browser — safe for client work.</li>
    <li><b>Free, no signup.</b></li>
    <li><b>Original untouched.</b> You download a converted copy; the source file is never modified.</li>
    <li><b>Verified.</b> Tested by saving a project in AE 2026, converting to 2025, and opening it in a real AE 2025 install.</li>
    <li><b>Also does Premiere Pro.</b> Switch to the Pr tab for <code>.prproj</code> files.</li>
  </ul>
  <h2 style="font-size:22px;font-weight:800;margin:32px 0 12px">FAQ</h2>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:10px"><b>Will effects break?</b><br>
  Features introduced in newer versions may show warnings or be ignored in older AE — that limitation
  applies to every downgrade method, including Adobe's own "Save a Copy As". Standard projects convert cleanly.</p>
  <p style="font-size:14.5px;line-height:1.9;margin-bottom:10px"><b>How old can I go?</b><br>
  Verified targets: AE 2022–2026. Experimental: 2020–2021.</p>
  <p style="font-size:14.5px;line-height:1.9"><a href="../guides/ae-newer-version-error/" style="color:inherit"><b>Full guide: fixing the "newer version" error →</b></a></p>
</section>`
  }
];

for (const v of VARIANTS) {
  let t = base;
  // 타이틀/메타/캐노니컬/OG/LD 교체
  t = t.replace(/<title>[\s\S]*?<\/title>/, `<title>${v.title}</title>`);
  t = t.replace(/(<meta name="description" content=")[\s\S]*?(">)/, `$1${v.desc}$2`);
  t = t.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1https://spklab.org/${v.dir}/$2`);
  t = t.replace(/(<meta property="og:title" content=")[\s\S]*?(">)/, `$1${v.title}$2`);
  t = t.replace(/(<meta property="og:description" content=")[\s\S]*?(">)/, `$1${v.desc}$2`);
  t = t.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1https://spklab.org/${v.dir}/$2`);
  t = t.replace(/"name":"[^"]*","url":"https:\/\/spklab\.org\/convert\/"/, `"name":"${v.ldName}","url":"https://spklab.org/${v.dir}/"`);
  if (v.h1swap) t = t.replace(v.h1swap[0], v.h1swap[1]);
  // 기본 탭 전환 (프리미어 변형)
  if (v.defaultTab === 'prproj') {
    t = t.replace('</body>', `<script>document.addEventListener('DOMContentLoaded',function(){var b=document.querySelector('.apptab[data-app="prproj"]');if(b)b.click();});</script>\n</body>`);
  }
  // SEO 콘텐츠 섹션을 푸터 앞에 삽입
  t = t.replace('<footer>', v.section + '\n  <footer>');
  const outDir = path.join(ROOT, v.dir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), t);
  console.log('생성:', v.dir + '/index.html', '(' + t.length + ' bytes)');
}
