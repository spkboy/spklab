'use strict';
// Premiere Pro .prproj 지원 — gzip으로 감싼 XML이며, 루트 <Project> 요소의
// Version 속성을 "1"로 바꾸면 모든 구버전 Premiere가 열 수 있다(자동 마이그레이션).
// gzip 압축/해제는 호출 측(브라우저: (De)CompressionStream, Node 테스트: zlib)이 담당한다.

var PrprojEngine = (function () {
  function isGzip(bytes) { return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }
  function looksXml(text) { return /^\s*<\?xml/.test(text) && text.indexOf('<PremiereData') !== -1; }

  var PROJECT_RE = /(<Project\b[^>]*\bVersion=")(\d+)(")/;

  function parseXml(text) {
    if (!looksXml(text)) throw new Error('Not a Premiere Pro project XML. / Premiere Pro 프로젝트 XML이 아닙니다.');
    var m = text.match(PROJECT_RE);
    if (!m) throw new Error('Project Version attribute not found. / Project 요소의 Version 속성을 찾지 못했습니다.');
    return { version: parseInt(m[2], 10) };
  }

  // 루트 Project의 Version만 1로 교체 (첫 번째 매치만)
  function patchXml(text) {
    var info = parseXml(text);
    var out = text.replace(PROJECT_RE, function (all, p1, v, p3) { return p1 + '1' + p3; });
    return { xml: out, from: info.version, to: 1 };
  }

  return { isGzip: isGzip, looksXml: looksXml, parseXml: parseXml, patchXml: patchXml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PrprojEngine;
