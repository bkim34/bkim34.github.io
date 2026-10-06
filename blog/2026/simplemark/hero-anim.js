/* Looping overview animation shown above the interactive demo.
   Reuses the demo's core (window.SimpleMarkDemo): the same slots, key derivation, tilt and sampling. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  function init() {
    var core = window.SimpleMarkDemo;
    var root = document.getElementById('sm-hero');
    if (!core || !root) return;
    var NS = 'http://www.w3.org/2000/svg';
    var Q = core.Q, SLOTS = core.SLOTS, STREAM = core.STREAM;
    var KEY = 2024, MSG = 5, EPS = 0.2, STEPS = 10;
    var T_LAND = 950, T_TILT = 1750, T_SAMPLE = 2550, T_STEP = 3400, T_RESET = 1800;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var svgA = document.getElementById('sm-hero-key'), svgB = document.getElementById('sm-hero-tilt');
    var wordEl = document.getElementById('sm-hero-word'), badgeEl = document.getElementById('sm-hero-badge');
    var sentEl = document.getElementById('sm-hero-sentence'), countEl = document.getElementById('sm-hero-count');
    if (!svgA || !svgB || !wordEl || !sentEl) return;

    function el(parent, tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      parent.appendChild(e); return e;
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function clamp(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }
    function ease(p) { p = clamp(p); return (1 - Math.cos(Math.PI * p)) / 2; }
    function easeOut(p) { p = clamp(p); return 1 - Math.pow(1 - p, 3); }

    /* ---------- panel 1: the simplex of slots, and the key choosing one ---------- */
    svgA.setAttribute('viewBox', '0 0 340 250');
    svgB.setAttribute('viewBox', '0 0 320 300');
    var cx = 170, cy = 118, R = 72, LR = R + 16;
    var vx = [], vy = [], ang = [];
    for (var i = 0; i < Q; i++) {
      ang.push(-Math.PI / 2 + i * 2 * Math.PI / Q);
      vx.push(cx + R * Math.cos(ang[i])); vy.push(cy + R * Math.sin(ang[i]));
    }
    for (i = 0; i < Q; i++) for (var j = i + 1; j < Q; j++) el(svgA, 'line', { x1: vx[i], y1: vy[i], x2: vx[j], y2: vy[j], stroke: '#e3e3f7', 'stroke-width': 1 });
    var vCircles = [], vLabels = [];
    for (i = 0; i < Q; i++) {
      vCircles.push(el(svgA, 'circle', { cx: vx[i], cy: vy[i], r: 8, fill: '#5b5fc7', stroke: '#fff', 'stroke-width': 2 }));
      var lx = cx + LR * Math.cos(ang[i]), ly = cy + LR * Math.sin(ang[i]);
      var anchor = Math.abs(lx - cx) < 8 ? 'middle' : (lx < cx ? 'end' : 'start');
      vLabels.push(el(svgA, 'text', { x: lx, y: ly + 4, 'text-anchor': anchor, 'font-size': 11, fill: '#333' }, ''));
    }
    var keyDot = el(svgA, 'circle', { cx: cx, cy: cy, r: 7, fill: '#f09228', stroke: '#fff', 'stroke-width': 2 });
    var keyTag = el(svgA, 'text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#777' }, 'secret key');
    var aCaption = el(svgA, 'text', { x: cx, y: 242, 'text-anchor': 'middle', 'font-size': 11, fill: '#555' }, '');

    /* ---------- panel 2: base bars tilting toward the target ---------- */
    var BW = 320, BH = 300, pl = 32, pr = 10, pt = 28, pb = 108, iw = BW - pl - pr, ih = BH - pt - pb, bw = iw / Q, barW = bw * 0.62;
    var baseY = pt + ih;
    el(svgB, 'text', { x: pl, y: 14, 'font-size': 10, fill: '#666' }, 'probability of each candidate word');
    el(svgB, 'line', { x1: pl, x2: BW - pr, y1: baseY, y2: baseY, stroke: '#999' });
    var baseRects = [], fillRects = [], multTexts = [], wordTexts = [];
    for (i = 0; i < Q; i++) {
      var bx = pl + bw * i + bw / 2 - barW / 2;
      baseRects.push(el(svgB, 'rect', { x: bx, y: baseY, width: barW, height: 0, fill: 'none', stroke: '#8a8dd6', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }));
      fillRects.push(el(svgB, 'rect', { x: bx, y: baseY, width: barW, height: 0, fill: '#c7c9f0', stroke: '#5b5fc7', 'stroke-width': 1 }));
      multTexts.push(el(svgB, 'text', { x: bx + barW / 2, y: baseY - 4, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#666', opacity: 0 }, ''));
      wordTexts.push(el(svgB, 'text', { x: bx + barW / 2, y: baseY + (i % 2 ? 25 : 13), 'text-anchor': 'middle', 'font-size': 9.5, fill: '#333' }, ''));
      if (i % 2) el(svgB, 'line', { x1: bx + barW / 2, x2: bx + barW / 2, y1: baseY + 2, y2: baseY + 16, stroke: '#ccc', 'stroke-width': 0.8 });
    }
    var pointer = el(svgB, 'polygon', { points: '0,0 0,0 0,0', fill: '#222', opacity: 0 });
    var pointerLabel = el(svgB, 'text', { x: 0, y: baseY + 56, 'text-anchor': 'middle', 'font-size': 9, fill: '#222', opacity: 0 }, 'sampled');
    var meterText = el(svgB, 'text', { x: pl, y: BH - 22, 'font-size': 10.5, fill: '#555' }, '');
    el(svgB, 'rect', { x: pl, y: BH - 14, width: iw, height: 6, rx: 3, fill: '#eee' });
    var meterFill = el(svgB, 'rect', { x: pl, y: BH - 14, width: 0, height: 6, rx: 3, fill: '#c9463a' });

    /* ---------- data for one pass through the story ---------- */
    var steps = [];
    function makeLoop() {
      steps = []; var state = { history: [] };
      for (var t = 0; t < STEPS; t++) {
        var st = core.encodeStep(state, t, MSG, KEY, EPS, 'tv', Infinity, Math.random());
        state.history.push(st); steps.push(st);
      }
    }
    function sentenceHTML(upto) {
      var html = '', stop = false, last = -1;
      STREAM.forEach(function (part) {
        if (stop) return;
        if (part.fixed) { html += esc(part.fixed); if (last === STEPS - 1) stop = true; return; }
        var i = part.idx;
        if (i < upto) { var st = steps[i]; html += '<span class="w' + (st.hit ? ' hit' : '') + '">' + esc(SLOTS[i].words[st.x]) + '</span>'; last = i; }
        else { html += '<span class="pending">…</span>'; stop = true; }
      });
      return html;
    }

    /* ---------- one frame ---------- */
    var lastK = -1, lastSampled = -1;
    function frame(k, ts) {
      var slot = SLOTS[k], st = steps[k], T = st.tilt;
      var p1 = clamp(ts / T_LAND), p2 = clamp((ts - T_LAND) / (T_TILT - T_LAND)), p3 = clamp((ts - T_TILT) / (T_SAMPLE - T_TILT));
      var landed = p1 >= 1, sampled = p3 >= 1;
      if (k !== lastK) {
        for (var v = 0; v < Q; v++) {
          var wl = slot.words[st.S.sigmaInv[v]];
          vLabels[v].textContent = wl;
          vLabels[v].setAttribute('font-size', wl.length > 8 ? 9.5 : 11);
          wordTexts[v].textContent = slot.words[v];
          wordTexts[v].setAttribute('font-size', slot.words[v].length > 8 ? 8.5 : 9.5);
        }
        lastK = k; lastSampled = -1;
      }
      // panel 1: the key dot spins and lands on the target slot
      var tAng = ang[st.Z], a = tAng - (1 - easeOut(p1)) * (5 * Math.PI);
      var rr = R * Math.min(1, 0.25 + p1);
      keyDot.setAttribute('cx', cx + rr * Math.cos(a)); keyDot.setAttribute('cy', cy + rr * Math.sin(a));
      keyTag.setAttribute('opacity', p1 < 0.15 ? 1 : 0);
      for (v = 0; v < Q; v++) {
        var isT = landed && v === st.Z;
        vCircles[v].setAttribute('fill', isT ? '#c9463a' : '#5b5fc7'); vCircles[v].setAttribute('r', isT ? 10 : 8);
        vLabels[v].setAttribute('fill', isT ? '#9b2f25' : '#333'); vLabels[v].setAttribute('font-weight', isT ? 700 : 400);
      }
      aCaption.textContent = landed ? 'target slot ' + st.Z + ' → “' + slot.words[st.target] + '”' : 'the key picks one of the 8 slots…';
      // panel 2: bars tilt
      var maxY = Math.max(0.5, Math.max.apply(null, slot.base.concat(T.wm)) * 1.12);
      var e2 = ease(p2);
      for (v = 0; v < Q; v++) {
        var hb = slot.base[v] / maxY * ih, hw = (slot.base[v] + e2 * (T.wm[v] - slot.base[v])) / maxY * ih;
        baseRects[v].setAttribute('y', baseY - hb); baseRects[v].setAttribute('height', hb);
        fillRects[v].setAttribute('y', baseY - hw); fillRects[v].setAttribute('height', hw);
        var isTarget = v === st.target;
        fillRects[v].setAttribute('fill', landed && isTarget ? '#c9463a' : '#c7c9f0');
        fillRects[v].setAttribute('stroke', landed && isTarget ? '#9b2f25' : '#5b5fc7');
        wordTexts[v].setAttribute('fill', landed && isTarget ? '#9b2f25' : '#333'); wordTexts[v].setAttribute('font-weight', landed && isTarget ? 700 : 400);
        multTexts[v].textContent = isTarget ? '×' + T.alpha.toFixed(2) : '×' + T.beta.toFixed(2);
        multTexts[v].setAttribute('fill', isTarget ? '#9b2f25' : '#666'); multTexts[v].setAttribute('font-weight', isTarget ? 700 : 400);
        multTexts[v].setAttribute('y', baseY - Math.max(hb, hw) - 4); multTexts[v].setAttribute('opacity', e2);
      }
      meterFill.setAttribute('width', iw * e2 * Math.min(1, T.tv / EPS));
      meterText.textContent = 'probability mass moved: ' + (e2 * T.tv).toFixed(2) + ' of budget ε = ' + EPS.toFixed(2);
      // the sampling pointer slides to the sampled word
      var x0 = pl + bw / 2, x1 = pl + bw * st.x + bw / 2, px = x0 + easeOut(p3) * (x1 - x0);
      pointer.setAttribute('points', (px - 5) + ',' + (baseY + 45) + ' ' + (px + 5) + ',' + (baseY + 45) + ' ' + px + ',' + (baseY + 37));
      pointer.setAttribute('opacity', p3 > 0 ? 1 : 0); pointerLabel.setAttribute('x', px); pointerLabel.setAttribute('opacity', sampled ? 1 : 0);
      // panel 3: the sampled word and the growing text
      if (sampled && lastSampled !== k) {
        wordEl.textContent = slot.words[st.x];
        badgeEl.textContent = st.hit ? 'the target word' : 'not the target';
        badgeEl.className = 'badge' + (st.hit ? ' hit' : '');
        sentEl.innerHTML = sentenceHTML(k + 1); lastSampled = k;
      } else if (!sampled && lastSampled !== -1) {
        lastSampled = -1;
      }
      if (!sampled) { wordEl.textContent = '…'; badgeEl.textContent = p3 > 0 ? 'sampling from the tilted bars' : 'waiting for the tilt'; badgeEl.className = 'badge'; sentEl.innerHTML = sentenceHTML(k); }
      countEl.textContent = 'word ' + (k + 1) + ' of ' + STEPS + ' · message 101 · TV budget ε = ' + EPS.toFixed(2);
    }

    /* ---------- driver ---------- */
    makeLoop();
    window.SimpleMarkHero = { frame: frame, steps: function () { return steps; } };
    if (reduce) { frame(0, T_SAMPLE); return; }
    var loopStart = null, raf = null, visible = true;
    function tick(now) {
      if (loopStart === null) loopStart = now;
      var tl = now - loopStart, loopLen = STEPS * T_STEP + T_RESET;
      if (tl >= loopLen) { loopStart = now; tl = 0; makeLoop(); lastK = -1; }
      var k = Math.min(STEPS - 1, Math.floor(tl / T_STEP));
      var ts = tl >= STEPS * T_STEP ? T_STEP : tl - k * T_STEP;
      frame(k, ts);
      raf = visible ? requestAnimationFrame(tick) : null;
    }
    function start() { if (!raf) { loopStart = null; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.05 }).observe(root);
    } else start();
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
