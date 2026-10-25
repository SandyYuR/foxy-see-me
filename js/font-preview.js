(function () {
  'use strict';
  var FE = (window.FE = window.FE || {});
  if (FE.importSymbolFontFile) return;

  /* ================================================================
   * 字体事实（App 端 sv.java）
   * ----------------------------------------------------------------
   * App 的字体是**全局设置**，不存在于布局/主题 JSON 里：
   *   <externalFilesDir>/foxy/frontend/fonts/ 下的 .ttf/.otf/.ttc/.otc，
   *   按 rv 枚举（KEY_MAIN22 / KEY_ALT12 / CANDIDATE18 / POPUP24 …）各存一份
   *   SharedPreferences 的 font_families_<name>（换行分隔，file: 前缀指字体文件）。
   * 网页预览没有 SharedPreferences，只能靠「导入字体文件」显式接管：
   *   - 解析 sfnt 的 cmap 拿到**真实覆盖的码位**，用于「实机会回退系统字体」的提示；
   *   - 用 FontFace 注册到 document.fonts，并把 family 挂到 --kb-preview-font
   *     （只有 .kb-label 消费），于是键面文字按真字形渲染。
   *
   * ⚠️ 解析失败**不能**阻断渲染：仍然注册字体、照常显示，只把覆盖度标为「无法解析」。
   * ⚠️ 这是纯预览状态：不写主题 JSON、不写布局 JSON（与边框/描边开关同一策略）。
   * ================================================================ */

  var FONT_VAR = '--kb-preview-font';
  var fontSeq = 0;

  function st() { return FE.state || {}; }

  /* 读二进制：优先 FileReader.readAsArrayBuffer，其次 file.arrayBuffer()。
   * 测试桩的 FileReader 只有 readAsText，因此两条路都要存在且都可失败。 */
  function readArrayBuffer(file) {
    return new Promise(function (resolve) {
      try {
        if (typeof FileReader !== 'undefined' && file) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result || null); };
          reader.onerror = function () { resolve(null); };
          if (typeof reader.readAsArrayBuffer === 'function') {
            reader.readAsArrayBuffer(file);
            return;
          }
        }
        if (file && typeof file.arrayBuffer === 'function') {
          Promise.resolve(file.arrayBuffer()).then(function (b) { resolve(b || null); },
            function () { resolve(null); });
          return;
        }
        resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  function u16(dv, off) { return dv.getUint16(off, false); }
  function u32(dv, off) { return dv.getUint32(off, false); }

  /* 解析 sfnt（TrueType 0x00010000 / OpenType OTTO / TTC 'ttcf'）的 cmap，
   * 返回覆盖的码位集合（Set）。只取 format 4 / 12 —— 这两者覆盖 BMP 与增补平面，
   * 是 Android 字体实际使用的两种；其余格式一律跳过（覆盖度会被低估，宁缺勿错）。 */
  FE.parseFontCoverage = function (buffer) {
    try {
      if (!buffer || !buffer.byteLength || buffer.byteLength < 12) return null;
      var dv = new DataView(buffer);
      var base = 0;
      /* TTC 头：'ttcf' + 版本 + 字体数 + 首个字体偏移 */
      if (u32(dv, 0) === 0x74746366) {
        if (buffer.byteLength < 16) return null;
        base = u32(dv, 12);
        if (!base || base + 12 > buffer.byteLength) return null;
      }
      var numTables = u16(dv, base + 4);
      if (!numTables || numTables > 512) return null;
      var cmapOff = 0;
      for (var i = 0; i < numTables; i++) {
        var rec = base + 12 + i * 16;
        if (rec + 16 > buffer.byteLength) return null;
        if (u32(dv, rec) === 0x636d6170) { cmapOff = u32(dv, rec + 8); break; } /* 'cmap' */
      }
      if (!cmapOff || cmapOff + 4 > buffer.byteLength) return null;
      var nSub = u16(dv, cmapOff + 2);
      var cov = new Set();
      var got = false;
      for (var s = 0; s < nSub; s++) {
        var sub = cmapOff + 4 + s * 8;
        if (sub + 8 > buffer.byteLength) break;
        var off = cmapOff + u32(dv, sub + 4);
        if (off + 2 > buffer.byteLength) continue;
        var fmt = u16(dv, off);
        if (fmt === 4) { if (readFmt4(dv, off, cov, buffer.byteLength)) got = true; }
        else if (fmt === 12) { if (readFmt12(dv, off, cov, buffer.byteLength)) got = true; }
      }
      if (!got) return null;
      return cov;
    } catch (e) { return null; }
  };

  function readFmt4(dv, off, cov, len) {
    try {
      var segX2 = u16(dv, off + 6);
      var seg = segX2 / 2;
      if (!seg) return false;
      var endO = off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2;
      var rangeO = deltaO + segX2;
      if (rangeO + segX2 > len) return false;
      for (var i = 0; i < seg; i++) {
        var end = u16(dv, endO + i * 2);
        var start = u16(dv, startO + i * 2);
        var delta = dv.getInt16(deltaO + i * 2, false);
        var ro = u16(dv, rangeO + i * 2);
        if (start === 0xffff && end === 0xffff) continue;
        for (var c = start; c <= end && c !== 0x10000; c++) {
          var glyph;
          if (ro === 0) glyph = (c + delta) & 0xffff;
          else {
            var gOff = rangeO + i * 2 + ro + (c - start) * 2;
            if (gOff + 2 > len) continue;
            glyph = u16(dv, gOff);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) cov.add(c);
        }
      }
      return true;
    } catch (e) { return false; }
  }

  function readFmt12(dv, off, cov, len) {
    try {
      var nGroups = u32(dv, off + 12);
      if (nGroups > 100000) return false;
      for (var i = 0; i < nGroups; i++) {
        var g = off + 16 + i * 12;
        if (g + 12 > len) break;
        var start = u32(dv, g), end = u32(dv, g + 4);
        if (end < start) continue;
        for (var c = start; c <= end; c++) cov.add(c);
      }
      return true;
    } catch (e) { return false; }
  }

  /* 当前布局实际用到的字符（键面文字 + Shift 标签 + 手势提示），去重排序。
   * 只收**可见字符**（去掉空白与控制字符）——字体覆盖度提示关心的是字形。 */
  FE.layoutUsedChars = function () {
    var set = new Set();
    function add(s) {
      String(s == null ? '' : s).split('').forEach(function (ch) {
        if (ch.trim()) set.add(ch);
      });
    }
    var compiled = st().compiled;
    if (!compiled) {
      try {
        compiled = FE.compileLayout(st().profile, st().layoutName, {
          split: false,
          status: st().status
        });
      } catch (e) { compiled = null; }
    }
    if (compiled && FE.eachCompiledKey) {
      FE.eachCompiledKey(compiled, function (k) {
        /* 画图标的键在实机上是图标、不出字（v40.e：有图标走 ImageView），
         * 把它们算进"用到的字符"会凭空多出一堆缺字提示。 */
        if (!k.icon) {
          add(k.label);
          add(k.shiftedLabel);
        }
        /* 四向滑动提示：compileKeyItem 把提示直接挂在 k.hints[d] 上
         * （不是 k.hints.dir，见 app.js:2270 与 :2305）。 */
        if (k.hints && typeof k.hints === 'object') {
          ['up', 'down', 'left', 'right'].forEach(function (d) {
            var h = k.hints[d];
            /* 键面上真正显示的是 h.text（hint > label）；h.display 是动作名，
             * 不是画在键上的字，算进来会凭空多出缺字。 */
            if (h) add(h.text);
          });
        }
      });
    }
    return Array.from(set).sort();
  };

  /* 覆盖度报告：{ ok: 是否解析出 cmap, chars, covered, missing } */
  FE.fontCoverageReport = function (coverage) {
    var chars = FE.layoutUsedChars();
    var out = { ok: !!coverage, chars: chars, covered: [], missing: [] };
    if (!coverage) { out.missing = chars.slice(); return out; }
    chars.forEach(function (ch) {
      var cp = ch.codePointAt(0);
      if (coverage.has(cp)) out.covered.push(ch);
      else out.missing.push(ch);
    });
    return out;
  };

  function setFontVar(value) {
    try {
      var root = document.documentElement;
      if (!root || !root.style) return;
      if (value) root.style.setProperty(FONT_VAR, value);
      else root.style.removeProperty(FONT_VAR);
    } catch (e) { /* 桩环境无布局引擎 */ }
  }

  /* 导入字体文件。返回 Promise<{ok, family, coverage, message, report}>。
   * 即使注册/解析都失败也 resolve —— UI 只需要一句人话。 */
  FE.importSymbolFontFile = function (file) {
    var name = String((file && file.name) || '字体文件');
    return readArrayBuffer(file).then(function (buffer) {
      var base = name.replace(/\.[^.]+$/, '');
      /* 文件名可能是纯中文（水彩包就是「字体图标.otf」），`[^\w-]` 会把整段清空，
       * 留下 'foxy-preview-1-' 这种可读性很差的 family 名 → 清空时退回 'font'。 */
      var safe = base.replace(/[^\w-]/g, '').replace(/^-+|-+$/g, '');
      if (!safe) safe = 'font';
      var family = 'foxy-preview-' + (++fontSeq) + '-' + safe;
      var coverage = null;
      if (buffer) {
        try { coverage = FE.parseFontCoverage(buffer); } catch (e) { coverage = null; }
      }
      var registered = false;
      try {
        if (buffer && typeof FontFace !== 'undefined' && document.fonts &&
            typeof document.fonts.add === 'function') {
          var prev = st().previewFontFontFace;
          if (prev && typeof document.fonts.delete === 'function') {
            try { document.fonts.delete(prev); } catch (e) { /* 忽略 */ }
          }
          var face = new FontFace(family, buffer);
          document.fonts.add(face);
          st().previewFontFontFace = face;
          registered = true;
          if (typeof face.load === 'function') {
            try { face.load().catch(function () { /* 加载失败仍保留注册，浏览器会回退 */ }); }
            catch (e2) { /* 忽略 */ }
          }
        }
      } catch (e3) { registered = false; }

      st().previewFontFamily = family;
      st().previewFontName = name;
      st().previewFontCoverage = coverage;
      /* 注册不了（比如没有 FontFace）也要挂变量：字体会回退系统字体，
       * 但至少覆盖度提示还能告诉作者「实机会怎样」。
       * ⚠️ 只写一个 family 名，**不要**追加 ", inherit"：CSS 里 inherit 是整体关键字，
       * 混在列表里会让整条 font-family 声明失效（预览反而看不到字体）。 */
      setFontVar('"' + family + '"');

      var report = FE.fontCoverageReport(coverage);
      var msg;
      if (!registryAvailable() && !registered) {
        /* 环境不支持 @font-face：预览看不到字形，但覆盖度提示仍然要说清「实机会怎样」，
         * 否则作者会以为字体没生效。 */
        msg = '已读到 ' + name + '，但当前浏览器无法预览此字体；' +
          (coverage
            ? '该字体覆盖 ' + coverage.size + ' 个码位。' + coverageNote(report)
            : '也无法解析覆盖度。');
      } else if (!coverage) {
        msg = '已载入 ' + name + '，但无法解析缺字情况；Foxy 会用系统字体补充缺字。';
      } else {
        /* 全图标布局（水彩布局就属于这种：46 个键里 33 个带 icon，剩下那个是空格）
         * 与有文字的布局分开措辞：前者没有"缺字"可言，后者要说清实机回落行为。 */
        msg = '已载入 ' + name + '：覆盖 ' + coverage.size + ' 个码位；' + coverageNote(report);
      }
      if (typeof FE.renderPreviewOnly === 'function') FE.renderPreviewOnly();
      return {
        ok: true, family: family, coverage: coverage,
        message: msg, report: report, registered: registered
      };
    });
  };

  /* 覆盖度说明：统一描述「实机会怎样」（缺字回落系统字体），供各处提示复用 */
  function coverageNote(report) {
    if (!report || !report.ok) return '';
    if (!report.chars.length) {
      return '当前布局没有文字标签，换到带文字的布局可查看字体效果。';
    }
    return '当前布局用到 ' + report.chars.length + ' 个不同字符，其中 ' + report.covered.length +
      ' 个有字形' +
      (report.missing.length
        ? '，' + report.missing.length + ' 个缺失（' + report.missing.slice(0, 12).join('') +
          (report.missing.length > 12 ? '…' : '') + '），实机会回退系统字体渲染这些字。'
        : '，全部字符都有字形。');
  }

  function registryAvailable() {
    return typeof FontFace !== 'undefined' && typeof document !== 'undefined' &&
      !!document.fonts && typeof document.fonts.add === 'function';
  }

  FE.clearSymbolFont = function () {
    var s = st();
    if (s.previewFontFontFace && typeof document !== 'undefined' && document.fonts &&
        typeof document.fonts.delete === 'function') {
      try { document.fonts.delete(s.previewFontFontFace); } catch (e) { /* 忽略 */ }
    }
    s.previewFontFamily = null;
    s.previewFontName = null;
    s.previewFontCoverage = null;
    s.previewFontFontFace = null;
    setFontVar('');
    if (typeof FE.renderPreviewOnly === 'function') FE.renderPreviewOnly();
  };

  /* 状态行文案（主题页 #pt-font-status 用；导入后也可重算） */
  FE.symbolFontStatusText = function () {
    var s = st();
    if (!s.previewFontFamily) return '';
    var report = FE.fontCoverageReport(s.previewFontCoverage);
    var head = '当前预览字体：' + (s.previewFontName || s.previewFontFamily);
    if (!s.previewFontCoverage) return head + '（无法解析覆盖度）';
    if (!report.chars.length) return head + ' —— 当前布局的可见键都用图标、没有文字，预览看不出字体差异是正常的';
    return head + ' —— 布局用到 ' + report.chars.length + ' 个字符，覆盖 ' +
      report.covered.length + ' 个' +
      (report.missing.length ? '；缺失：' + report.missing.join('') : '；无缺失');
  };
})();
