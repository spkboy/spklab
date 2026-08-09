'use strict';
// AEP Version Changer — 코어 엔진
// .aep(RIFX) 파일의 `head` 청크에 있는 포맷 리비전 시그니처를 읽고 패치한다.
// 브라우저와 Node 양쪽에서 동작한다.

var AEPEngine = (function () {
  // head 페이로드의 [1,3,4,5,6,7] 바이트 시그니처.
  // verified=true: 실제 파일/공개 테이블로 확인된 값. null: 미확인(패치 시 건드리지 않음).
  var VERSIONS = [
    { id: 'ae2026', year: 2026, internal: '26.x', label: 'After Effects 2026 (26.x)', sig: [0x61, 0x02, 0x0f, 0x10, 0x06, 0x43], verified: true },
    { id: 'ae2025', year: 2025, internal: '25.x', label: 'After Effects 2025 (25.x)', sig: [0x60, 0x09, 0x0f, 0x0b, 0x06, 0x65], verified: true },
    { id: 'ae2024', year: 2024, internal: '24.x', label: 'After Effects 2024 (24.x)', sig: [0x5f, 0x05, 0x0f, 0x02, 0x86, 0x34], verified: true },
    { id: 'ae2023', year: 2023, internal: '23.x', label: 'After Effects 2023 (23.x)', sig: [0x5e, 0x09, 0x0b, 0x3b, 0x06, 0x37], verified: true },
    { id: 'ae2022', year: 2022, internal: '22.x', label: 'After Effects 2022 (22.x)', sig: [0x5d, 0x2b, 0x0b, 0x33, 0x06, 0x3b], verified: true },
    { id: 'ae2021', year: 2021, internal: '18.x', label: 'After Effects 2021 (18.x)', sig: [0x5c, 0x0e, 0x07, 0x38, 0x96, 0x46], verified: false },
    { id: 'ae2020', year: 2020, internal: '17.x', label: 'After Effects 2020 (17.x)', sig: [0x5b, null, null, null, null, null], verified: false }
  ];

  var BASE_REV = 0x5b; // = 2020년 릴리스의 포맷 리비전
  var SIG_OFFSETS = [1, 3, 4, 5, 6, 7]; // head 페이로드 내 시그니처 바이트 위치

  function fourcc(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }

  function readU32BE(bytes, off) {
    return ((bytes[off] << 24) >>> 0) + (bytes[off + 1] << 16) + (bytes[off + 2] << 8) + bytes[off + 3];
  }

  // 최상위 청크를 걸어 `head` 청크를 찾는다. 반환: { offset(페이로드 시작), size }
  function findHead(bytes) {
    if (bytes.length < 24) throw new Error('File too small to be an AEP. / 파일이 너무 작아 AEP가 아닙니다.');
    if (fourcc(bytes, 0) !== 'RIFX' || fourcc(bytes, 8) !== 'Egg!') {
      throw new Error('Not an After Effects project (RIFX/Egg!) file. / After Effects 프로젝트 파일이 아닙니다.');
    }
    var end = Math.min(bytes.length, 8 + readU32BE(bytes, 4));
    var off = 12;
    while (off + 8 <= end) {
      var id = fourcc(bytes, off);
      var size = readU32BE(bytes, off + 4);
      var payload = off + 8;
      if (payload + size > bytes.length) break; // 손상된 청크
      if (id === 'head') {
        if (size < 8) throw new Error('head chunk is shorter than expected (' + size + ' bytes). / head 청크가 예상보다 짧습니다.');
        return { offset: payload, size: size };
      }
      off = payload + size + (size & 1); // 홀수 크기는 1바이트 패딩
    }
    throw new Error('head chunk not found — file may be corrupted. / head 청크를 찾지 못했습니다. 손상되었거나 알 수 없는 형식입니다.');
  }

  function readSignature(bytes, head) {
    var sig = [];
    for (var i = 0; i < SIG_OFFSETS.length; i++) sig.push(bytes[head.offset + SIG_OFFSETS[i]]);
    return sig; // [b1, b3, b4, b5, b6, b7]
  }

  // 시그니처 → 버전 판정
  // confidence: 'exact'(전체 일치) | 'build'(리비전 일치, 빌드 상이) | 'guess'(공식 추정) | 'legacy' | 'unknown'
  function detect(sig) {
    var b1 = sig[0];
    var candidate = null;
    for (var i = 0; i < VERSIONS.length; i++) {
      var v = VERSIONS[i];
      if (v.sig[0] !== b1) continue;
      candidate = v;
      var allKnownMatch = true;
      for (var j = 1; j < 6; j++) {
        if (v.sig[j] !== null && v.sig[j] !== sig[j]) { allKnownMatch = false; break; }
      }
      if (allKnownMatch) return { version: v, confidence: 'exact', label: v.label };
    }
    if (candidate) {
      return {
        version: candidate,
        confidence: 'build',
        label: candidate.label + ' — same year, different build / 동일 연식, 다른 빌드'
      };
    }
    if (b1 > 0x61) {
      var year = 2020 + (b1 - BASE_REV);
      return { version: null, confidence: 'guess', label: 'After Effects ' + year + ' (estimated / 추정 — unregistered revision 0x' + b1.toString(16) + ')' };
    }
    if (b1 < BASE_REV && b1 >= 0x30) {
      return { version: null, confidence: 'legacy', label: 'After Effects 2019 or earlier, CC/CS era / 2019 이하 (CC·CS 시대) 구버전' };
    }
    return { version: null, confidence: 'unknown', label: 'Unknown version / 알 수 없는 버전 (revision 0x' + b1.toString(16) + ')' };
  }

  function parse(bytes) {
    var head = findHead(bytes);
    var sig = readSignature(bytes, head);
    var detected = detect(sig);
    return { head: head, signature: sig, detected: detected };
  }

  // 사본을 만들어 head 시그니처를 목표 버전으로 교체한다. 원본 배열은 건드리지 않는다.
  function patch(bytes, targetId) {
    var target = null;
    for (var i = 0; i < VERSIONS.length; i++) if (VERSIONS[i].id === targetId) target = VERSIONS[i];
    if (!target) throw new Error('Unknown target version / 알 수 없는 목표 버전: ' + targetId);
    var info = parse(bytes);
    var out = new Uint8Array(bytes); // copy
    var changed = [];
    for (var j = 0; j < SIG_OFFSETS.length; j++) {
      if (target.sig[j] === null) continue;
      var off = info.head.offset + SIG_OFFSETS[j];
      if (out[off] !== target.sig[j]) {
        changed.push({ offset: off, from: out[off], to: target.sig[j] });
        out[off] = target.sig[j];
      }
    }
    return { bytes: out, changed: changed, target: target, before: info };
  }

  function hex(sig) {
    return sig.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
  }

  return { VERSIONS: VERSIONS, parse: parse, patch: patch, hex: hex, findHead: findHead };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AEPEngine;
