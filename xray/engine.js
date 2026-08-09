'use strict';
// AEP X-Ray — 코어 엔진
// .aep(RIFX) 청크 트리를 재귀 순회해 이펙트 인스턴스(tdmn + LIST sspc 짝)를 수집하고
// 내장/서드파티/미확인으로 분류한다. 브라우저·Node 겸용.

var XrayEngine = (function () {

  // AE에 기본 번들되는 이펙트 계열 (매치네임 프리픽스)
  var BUILTIN_PREFIXES = [
    'ADBE',            // Adobe 기본
    'CC ',             // Cycore FX (AE 6.5+ 번들)
    'APC ',            // Atomic Power (Shatter, Card Dance 등 — 번들)
    'Keylight',        // The Foundry Keylight (번들)
    'mocha',           // Mocha AE (번들)
    'CINEMA 4D', 'Cineware', // Cineware (번들)
    'SA Color Finesse', 'Synthetic Aperture' // 구버전 번들
  ];

  // 알려진 서드파티 벤더 (프리픽스 매칭, 위에서부터 우선)
  var VENDORS = [
    { prefix: 'tc ',          vendor: 'Maxon Red Giant — Trapcode Suite', url: 'https://www.maxon.net/en/red-giant/trapcode' },
    { prefix: 'Trapcode',     vendor: 'Maxon Red Giant — Trapcode Suite', url: 'https://www.maxon.net/en/red-giant/trapcode' },
    { prefix: 'MB ',          vendor: 'Maxon Red Giant — Magic Bullet',   url: 'https://www.maxon.net/en/red-giant/magic-bullet' },
    { prefix: 'VIDEOCOPILOT', vendor: 'Video Copilot',                    url: 'https://www.videocopilot.net' },
    { prefix: 'VC ',          vendor: 'Video Copilot',                    url: 'https://www.videocopilot.net' },
    { prefix: 'S_',           vendor: 'Boris FX — Sapphire',              url: 'https://borisfx.com/products/sapphire' },
    { prefix: 'BCC',          vendor: 'Boris FX — Continuum',             url: 'https://borisfx.com/products/continuum' },
    { prefix: 'RE:',          vendor: 'RE:Vision Effects',                url: 'https://revisionfx.com' },
    { prefix: 'RSMB',         vendor: 'RE:Vision Effects — ReelSmart Motion Blur', url: 'https://revisionfx.com' },
    { prefix: 'Twixtor',      vendor: 'RE:Vision Effects — Twixtor',      url: 'https://revisionfx.com' },
    { prefix: 'FL ',          vendor: 'Frischluft — Lenscare',            url: 'https://www.frischluft.com' },
    { prefix: 'PEDG',         vendor: 'Plugin Everything — Deep Glow',    url: 'https://aescripts.com/deep-glow/' },
    { prefix: 'Plexus',       vendor: 'Rowbyte — Plexus',                 url: 'https://www.rowbyte.com/plexus' },
    { prefix: 'Stardust',     vendor: 'Superluminal — Stardust',          url: 'https://www.superluminal.tv' },
    { prefix: 'Neat Video',   vendor: 'Neat Video',                       url: 'https://www.neatvideo.com' },
    { prefix: 'Saber',        vendor: 'Video Copilot — Saber (무료)',      url: 'https://www.videocopilot.net/blog/2016/03/new-plug-in-saber-now-available-100-free/' }
  ];

  // aescripts 계열 가짜(pseudo) 이펙트 — 플러그인 설치 없이도 파일에 내장되어 렌더됨
  var PSEUDO_PREFIX = 'Pseudo/';

  // head 청크의 연도별 포맷 리비전 (버전 체인저와 동일한 매핑)
  var REV_BASE = 0x5b; // 2020(17.x)
  var REV_LABELS = { 0x5b: '2020 (17.x)', 0x5c: '2021 (18.x)', 0x5d: '2022 (22.x)', 0x5e: '2023 (23.x)', 0x5f: '2024 (24.x)', 0x60: '2025 (25.x)', 0x61: '2026 (26.x)' };

  // AE 내부용이라 사용자에게 의미 없는 폰트
  var FONT_IGNORE = { AdobeInvisFont: true };
  var FONT_DEFAULT = { 'Myriad-Roman': true }; // AE 기본 폰트 — 표시하되 태그

  function fourcc(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }
  function readU32BE(bytes, off) {
    return ((bytes[off] << 24) >>> 0) + (bytes[off + 1] << 16) + (bytes[off + 2] << 8) + bytes[off + 3];
  }
  function readCStr(bytes, off, max) {
    var s = '';
    for (var i = off; i < off + max && bytes[i] !== 0; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function readUtf8(bytes, off, len) {
    var s = '';
    for (var i = off; i < off + len; i++) {
      var c = bytes[i];
      if (c === 0) break;
      if (c < 0x80) s += String.fromCharCode(c);
      else { // 간단 UTF-8 디코드
        try { s = new TextDecoder().decode(bytes.slice(off, off + len)).replace(/\0+$/, ''); } catch (e) {}
        return s;
      }
    }
    return s;
  }

  // sspc LIST 내부에서 fnam(페이로드에 Utf8 서브청크를 품은 청크)의 표시 이름을 찾는다
  function findDisplayName(bytes, start, end) {
    var off = start;
    while (off + 8 <= end) {
      var id = fourcc(bytes, off);
      var size = readU32BE(bytes, off + 4);
      var payload = off + 8;
      if (payload + size > end) break;
      if (id === 'fnam' && size >= 8 && fourcc(bytes, payload) === 'Utf8') {
        var len = readU32BE(bytes, payload + 4);
        if (payload + 8 + len <= end) return readUtf8(bytes, payload + 8, len);
      }
      off = payload + size + (size & 1);
    }
    return null;
  }

  function walk(bytes, start, end, out) {
    var off = start, lastTdmn = null;
    while (off + 8 <= end) {
      var id = fourcc(bytes, off);
      var size = readU32BE(bytes, off + 4);
      var payload = off + 8;
      if (payload + size > end) break;
      if (id === 'LIST') {
        var listType = fourcc(bytes, payload);
        if (listType === 'sspc' && lastTdmn && lastTdmn !== 'ADBE Group End') {
          var rec = out.effects[lastTdmn];
          if (!rec) rec = out.effects[lastTdmn] = { count: 0, displayName: null };
          rec.count++;
          if (!rec.displayName) rec.displayName = findDisplayName(bytes, payload + 4, payload + size);
        }
        walk(bytes, payload + 4, payload + size, out);
        lastTdmn = null;
      } else {
        if (id === 'tdmn') lastTdmn = readCStr(bytes, payload, size);
        else lastTdmn = null;
        if (id === 'cdta') out.comps++;
        if (id === 'ldta') out.layers++;
      }
      off = payload + size + (size & 1);
    }
  }

  // 최상위 head 청크에서 저장 버전(연도) 감지
  function detectVersion(bytes, end) {
    var off = 12;
    while (off + 8 <= end) {
      var id = fourcc(bytes, off);
      var size = readU32BE(bytes, off + 4);
      var payload = off + 8;
      if (payload + size > bytes.length) break;
      if (id === 'head') {
        if (size < 2) return null;
        var rev = bytes[payload + 1];
        if (REV_LABELS[rev]) return { rev: rev, label: 'After Effects ' + REV_LABELS[rev] };
        if (rev > 0x61) return { rev: rev, label: 'After Effects ' + (2020 + rev - REV_BASE) + ' (estimated / 추정)' };
        return { rev: rev, label: 'After Effects 2019 or earlier / 2019 이하 (CC·CS)' };
      }
      off = payload + size + (size & 1);
    }
    return null;
  }

  // '/CoolTypeFont /0 << /0 (' + FEFF + UTF-16BE 폰트명 + ')' 패턴을 원시 스캔
  var FONT_PAT = '/CoolTypeFont /0 << /0 (';
  function extractFonts(bytes) {
    var found = {};
    var plen = FONT_PAT.length;
    for (var i = 0; i + plen + 4 < bytes.length; i++) {
      if (bytes[i] !== 0x2f) continue; // '/'
      var hit = true;
      for (var j = 0; j < plen; j++) {
        if (bytes[i + j] !== FONT_PAT.charCodeAt(j)) { hit = false; break; }
      }
      if (!hit) continue;
      var p = i + plen;
      if (bytes[p] === 0xfe && bytes[p + 1] === 0xff) p += 2; // BOM
      var name = '';
      while (p + 1 < bytes.length && bytes[p] !== 0x29 && name.length < 100) {
        var code = (bytes[p] << 8) + bytes[p + 1];
        name += String.fromCharCode(code);
        p += 2;
      }
      if (name && !FONT_IGNORE[name]) {
        if (!found[name]) found[name] = { name: name, count: 0, isDefault: !!FONT_DEFAULT[name] };
        found[name].count++;
      }
      i = p;
    }
    return Object.keys(found).map(function (k) { return found[k]; })
      .sort(function (a, b) { return (a.isDefault - b.isDefault) || b.count - a.count || a.name.localeCompare(b.name); });
  }

  function classify(matchName) {
    if (matchName.indexOf(PSEUDO_PREFIX) === 0) {
      return { status: 'preset', vendor: 'aescripts 계열 pseudo effect', url: null };
    }
    for (var i = 0; i < BUILTIN_PREFIXES.length; i++) {
      if (matchName.indexOf(BUILTIN_PREFIXES[i]) === 0) return { status: 'builtin', vendor: 'Adobe After Effects 내장', url: null };
    }
    for (var j = 0; j < VENDORS.length; j++) {
      if (matchName.indexOf(VENDORS[j].prefix) === 0) return { status: 'thirdparty', vendor: VENDORS[j].vendor, url: VENDORS[j].url };
    }
    return { status: 'unknown', vendor: null, url: null };
  }

  function parse(bytes) {
    if (bytes.length < 24) throw new Error('File too small to be an AEP. / 파일이 너무 작아 AEP가 아닙니다.');
    if (fourcc(bytes, 0) !== 'RIFX' || fourcc(bytes, 8) !== 'Egg!') {
      throw new Error('Not an After Effects project (RIFX/Egg!) file. / After Effects 프로젝트 파일이 아닙니다.');
    }
    var end = Math.min(bytes.length, 8 + readU32BE(bytes, 4));
    var out = { effects: {}, comps: 0, layers: 0 };
    walk(bytes, 12, end, out);

    var list = [];
    var totalInstances = 0;
    Object.keys(out.effects).forEach(function (mn) {
      var rec = out.effects[mn];
      var cls = classify(mn);
      totalInstances += rec.count;
      list.push({
        matchName: mn,
        displayName: rec.displayName,
        count: rec.count,
        status: cls.status,   // 'thirdparty' | 'unknown' | 'preset' | 'builtin'
        vendor: cls.vendor,
        url: cls.url
      });
    });
    var order = { thirdparty: 0, unknown: 1, preset: 2, builtin: 3 };
    list.sort(function (a, b) {
      return (order[a.status] - order[b.status]) || (b.count - a.count) || a.matchName.localeCompare(b.matchName);
    });
    return {
      comps: out.comps,
      layers: out.layers,
      totalInstances: totalInstances,
      effects: list,
      required: list.filter(function (e) { return e.status === 'thirdparty'; }),
      unknown: list.filter(function (e) { return e.status === 'unknown'; }),
      version: detectVersion(bytes, end),
      fonts: extractFonts(bytes)
    };
  }

  // ── Premiere Pro .prproj (gzip XML) ─────────────────────────────
  // <Video|AudioFilterComponent> / <Video|AudioTransitionComponent> 블록의
  // <MatchName>을 수집한다. "AE."/"PR." 접두사를 벗기면 AE와 같은 매치네임 체계라
  // 동일한 벤더 DB로 분류할 수 있다. Intrinsic(Motion/Opacity 등)은 제외.
  function isGzip(bytes) { return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }

  function parsePrprojXml(xml) {
    if (xml.indexOf('<PremiereData') === -1) {
      throw new Error('Not a Premiere Pro project XML. / Premiere Pro 프로젝트 XML이 아닙니다.');
    }
    var verMatch = xml.match(/<Project\b[^>]*\bVersion="(\d+)"/);
    var blocks = xml.match(/<(?:Video|Audio)(?:Filter|Transition)Component\b[\s\S]*?<\/(?:Video|Audio)(?:Filter|Transition)Component>/g) || [];
    var byName = {};
    var totalInstances = 0;
    blocks.forEach(function (b) {
      if (/<Intrinsic>true<\/Intrinsic>/.test(b)) return;
      var mn = (b.match(/<MatchName>([^<]+)<\/MatchName>/) || [])[1];
      if (!mn) return;
      totalInstances++;
      var rec = byName[mn];
      if (!rec) rec = byName[mn] = { count: 0, displayName: null };
      rec.count++;
      if (!rec.displayName) {
        var dn = (b.match(/<DisplayName>([^<]+)<\/DisplayName>/) || [])[1];
        if (dn) rec.displayName = dn;
      }
    });
    var list = Object.keys(byName).map(function (mn) {
      var normalized = mn.replace(/^(AE|PR)\./, '');
      var cls = classify(normalized);
      return {
        matchName: mn,
        displayName: byName[mn].displayName,
        count: byName[mn].count,
        status: cls.status,
        vendor: cls.vendor,
        url: cls.url
      };
    });
    var order = { thirdparty: 0, unknown: 1, preset: 2, builtin: 3 };
    list.sort(function (a, b) {
      return (order[a.status] - order[b.status]) || (b.count - a.count) || a.matchName.localeCompare(b.matchName);
    });
    return {
      kind: 'prproj',
      sequences: (xml.match(/<Sequence Object(?:U?ID|UID)="/g) || []).length,
      clips: (xml.match(/<(?:Video|Audio)Clip Object/g) || []).length,
      totalInstances: totalInstances,
      effects: list,
      required: list.filter(function (e) { return e.status === 'thirdparty'; }),
      unknown: list.filter(function (e) { return e.status === 'unknown'; }),
      version: verMatch ? { rev: parseInt(verMatch[1], 10), label: 'Premiere Pro (internal format v' + verMatch[1] + ' / 내부 포맷 v' + verMatch[1] + ')' } : null,
      fonts: []
    };
  }

  return { parse: parse, classify: classify, isGzip: isGzip, parsePrprojXml: parsePrprojXml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = XrayEngine;
