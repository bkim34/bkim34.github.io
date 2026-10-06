/* SimpleMark toy demo: a self-contained miniature of the paper's pipeline.
   q = 8 candidate words per step (one per vertex of a 7-simplex), a 3-bit message,
   a repetition code in place of the LDPC code, the closed-form divergence-constrained
   tilt (TV or KL), and the maximum-likelihood decoder.                                */
(function (root) {
  'use strict';

  var Q = 8;      // candidate tokens per step
  var NMSG = 8;   // 3-bit message

  /* ---------- keyed pseudo-randomness (stands in for SHA-256 in the paper) ---------- */
  function hash32(a, b) {
    var h = (a ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = (h ^ ((b + 0x7f4a7c15) >>> 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Side information S_t = (V_t, sigma_t): key value in Z_q and a bijection token -> vertex,
     derived from the secret key, the position and the previous watermarked token (h = 1). */
  function sideInfo(key, t, prevTok) {
    var rng = mulberry32(hash32(hash32(key >>> 0, t + 1), prevTok + 1));
    var V = Math.floor(rng() * Q);
    var sigma = [], i, j, tmp;
    for (i = 0; i < Q; i++) sigma.push(i);
    for (i = Q - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); tmp = sigma[i]; sigma[i] = sigma[j]; sigma[j] = tmp; }
    var sigmaInv = new Array(Q);
    for (i = 0; i < Q; i++) sigmaInv[sigma[i]] = i;
    return { V: V, sigma: sigma, sigmaInv: sigmaInv };
  }

  /* ---------- the divergence-constrained tilt (Section 3.1 of the paper) ---------- */
  function binKL(s, B) { // KL( Bern(s) || Bern(B) ) in nats
    function f(a, b) { return a <= 0 ? 0 : a * Math.log(a / b); }
    return f(s, B) + f(1 - s, 1 - B);
  }
  function sStar(B, eps, mode, alphaMax) {
    var s, lo, hi, mid, i;
    if (mode === 'tv') {
      s = B + Math.min(eps, 1 - B);
    } else {
      if (eps >= Math.log(1 / B)) s = 1;
      else {
        lo = B; hi = 1;
        for (i = 0; i < 60; i++) { mid = (lo + hi) / 2; if (binKL(mid, B) < eps) lo = mid; else hi = mid; }
        s = lo;
      }
    }
    if (alphaMax && isFinite(alphaMax)) s = Math.max(B, Math.min(s, alphaMax * B)); // the cap only lowers the boost (alpha >= 1); it never inverts the tilt
    return s;
  }
  function tilt(base, targetTok, eps, mode, alphaMax) {
    var B = base[targetTok];
    var s = sStar(B, eps, mode, alphaMax);
    var alpha = s / B;
    var beta = (1 - B) > 1e-12 ? (1 - s) / (1 - B) : 0;
    var wm = base.map(function (p, i) { return i === targetTok ? alpha * p : beta * p; });
    return { wm: wm, B: B, s: s, alpha: alpha, beta: beta, tv: s - B, kl: binKL(s, B) };
  }
  /* Repetition code: the 3-bit message m (a number 0..7) is sent as the code symbol at every step.
     (The paper uses an LDPC code over F_53 for the same purpose.) */
  function codeSymbol(m, t) { return m % Q; }
  function sampleFrom(probs, u) {
    var acc = 0;
    for (var i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
    return probs.length - 1;
  }
  function zipf(n, a) {
    var w = [], s = 0, i;
    for (i = 0; i < n; i++) { w.push(1 / Math.pow(i + 1, a)); s += w[i]; }
    return w.map(function (x) { return x / s; });
  }

  /* ---------- the toy "language model": a story with 8-way word choices ---------- */
  var EXPO = [0.9, 1.5, 0.6, 2.0, 1.1, 0.8, 1.7, 1.0];
  var STORY = [
    ['The ', ['quick', 'old', 'tiny', 'brave', 'sleepy', 'clever', 'hungry', 'curious'], ' fox ', ['crept', 'ran', 'wandered', 'strolled', 'dashed', 'tiptoed', 'trotted', 'slipped'], ' through the ', ['quiet', 'dark', 'misty', 'frozen', 'ancient', 'sunlit', 'tangled', 'silent'], ' forest at ', ['dawn', 'dusk', 'noon', 'midnight', 'sunrise', 'twilight', 'daybreak', 'nightfall'], '.'],
    [' It was looking for ', ['berries', 'shelter', 'water', 'company', 'mushrooms', 'warmth', 'adventure', 'home'], ', but the trail was ', ['muddy', 'narrow', 'steep', 'blocked', 'hidden', 'winding', 'icy', 'overgrown'], ' and the air smelled of ', ['rain', 'smoke', 'pine', 'snow', 'earth', 'salt', 'moss', 'flowers'], '.'],
    [' Near the ', ['river', 'cliff', 'meadow', 'bridge', 'cabin', 'orchard', 'marsh', 'ruins'], ', a ', ['heron', 'crow', 'deer', 'rabbit', 'badger', 'hawk', 'turtle', 'squirrel'], ' watched ', ['silently', 'nervously', 'curiously', 'calmly', 'warily', 'lazily', 'proudly', 'kindly'], '.'],
    [' “You look ', ['lost', 'tired', 'cold', 'hungry', 'worried', 'brave', 'small', 'lonely'], ',” it said in a ', ['soft', 'low', 'cheerful', 'raspy', 'gentle', 'hurried', 'warm', 'sleepy'], ' voice.'],
    [' The fox ', ['laughed', 'shrugged', 'nodded', 'sighed', 'grinned', 'paused', 'blinked', 'bowed'], ' and asked for ', ['directions', 'a story', 'food', 'rest', 'advice', 'company', 'a map', 'a secret'], '.'],
    [' Together they followed the ', ['stream', 'moonlight', 'footprints', 'wind', 'road', 'fence', 'ridge', 'smoke'], ' until they reached a ', ['village', 'clearing', 'lake', 'farmhouse', 'cave', 'garden', 'windmill', 'lighthouse'], '.'],
    [' There, under a ', ['willow', 'lantern', 'bridge', 'porch', 'pine', 'haystack', 'archway', 'skylight'], ', they shared ', ['apples', 'bread', 'a blanket', 'stories', 'a fire', 'silence', 'a song', 'honey'], ' and watched the ', ['stars', 'rain', 'snow', 'fog', 'fireflies', 'river', 'clouds', 'embers'], '.'],
    [' By ', ['morning', 'midnight', 'noon', 'evening', 'spring', 'tomorrow', 'sunrise', 'Friday'], ', the fox felt ', ['rested', 'braver', 'lighter', 'wiser', 'at home', 'hopeful', 'stronger', 'grateful'], ' and ', ['thanked', 'hugged', 'waved to', 'promised', 'followed', 'raced', 'teased', 'remembered'], ' its new friend.'],
    [' Some say the fox still ', ['visits', 'dreams of', 'writes about', 'sings about', 'guards', 'searches for', 'returns to', 'tells of'], ' that ', ['forest', 'friend', 'village', 'night', 'bridge', 'lantern', 'river', 'fire'], ', especially when the ', ['wind', 'snow', 'moon', 'fog', 'rain', 'sun', 'thunder', 'frost'], ' is ', ['high', 'soft', 'bright', 'heavy', 'cold', 'warm', 'loud', 'late'], '.'],
    [' And if you listen ', ['closely', 'quietly', 'carefully', 'patiently', 'at dusk', 'by water', 'in winter', 'with friends'], ', you might hear its ', ['laugh', 'footsteps', 'song', 'story', 'whistle', 'name', 'secret', 'echo'], ' too.'],
    [' Every traveler who crosses the ', ['bridge', 'meadow', 'ridge', 'marsh', 'orchard', 'river', 'cliff', 'clearing'], ' leaves a ', ['coin', 'feather', 'note', 'pebble', 'ribbon', 'song', 'wish', 'drawing'], ' for the ', ['fox', 'heron', 'badger', 'wind', 'moon', 'stars', 'forest', 'river'], '.'],
    [' Nobody knows who started the ', ['custom', 'rumor', 'song', 'game', 'map', 'legend', 'path', 'fire'], ', but the pile grows ', ['taller', 'older', 'stranger', 'brighter', 'warmer', 'quieter', 'wider', 'heavier'], ' every ', ['year', 'spring', 'winter', 'morning', 'eclipse', 'storm', 'harvest', 'decade'], '.'],
    [' Last ', ['winter', 'spring', 'autumn', 'summer', 'week', 'year', 'night', 'month'], ', a ', ['child', 'farmer', 'poet', 'baker', 'sailor', 'teacher', 'shepherd', 'painter'], ' from the ', ['village', 'city', 'coast', 'mountains', 'valley', 'island', 'north', 'south'], ' claimed to have seen the fox ', ['dancing', 'reading', 'fishing', 'sleeping', 'singing', 'painting', 'laughing', 'waiting'], ' by the water.'],
    [' Maybe it was only the ', ['fog', 'moonlight', 'wind', 'firelight', 'tide', 'frost', 'shadows', 'rain'], ', or maybe the story is ', ['true', 'older', 'bigger', 'stranger', 'simpler', 'kinder', 'wilder', 'closer'], ' than anyone ', ['thinks', 'admits', 'remembers', 'expects', 'hopes', 'fears', 'knows', 'says'], '.'],
    [' Either way, the ', ['forest', 'river', 'bridge', 'lantern', 'village', 'meadow', 'cabin', 'orchard'], ' keeps its ', ['secrets', 'visitors', 'songs', 'promises', 'quiet', 'light', 'stories', 'friends'], ', and the fox keeps ', ['walking', 'listening', 'smiling', 'searching', 'dreaming', 'returning', 'humming', 'wandering'], '.'],
    [' The end, or at least the ', ['beginning', 'middle', 'prologue', 'chapter', 'preface', 'epilogue', 'rumor', 'legend'], '.']
  ];
  // Flatten into a token stream: fixed text and "slots" (steps where the model has a choice).
  var STREAM = [], SLOTS = [];
  (function () {
    var k = 0;
    STORY.forEach(function (sentence) {
      sentence.forEach(function (part) {
        if (typeof part === 'string') STREAM.push({ fixed: part });
        else {
          var slot = { words: part, base: zipf(Q, EXPO[k % EXPO.length]), idx: k };
          STREAM.push(slot); SLOTS.push(slot); k++;
        }
      });
    });
  })();

  /* ---------- encoder / decoder over the whole story ---------- */
  function encodeStep(state, t, message, key, eps, mode, alphaMax, u) {
    var slot = SLOTS[t];
    var prevTok = t === 0 ? 0 : state.history[t - 1].x + 1;
    var S = sideInfo(key, t, prevTok);
    var C = codeSymbol(message, t);              // code symbol for this step
    var Z = (C + S.V) % Q;                       // target vertex
    var target = S.sigmaInv[Z];                  // the token sitting on that vertex
    var T = tilt(slot.base, target, eps, mode, alphaMax);
    var x = sampleFrom(T.wm, u);
    return { t: t, S: S, C: C, Z: Z, target: target, tilt: T, x: x, hit: x === target };
  }
  function decodeScores(history, key, eps, mode, alphaMax) {
    var scores = [], m, i, step, slot, prevTok, S, z, tok, B, s, L;
    for (m = 0; m < NMSG; m++) scores.push(0);
    for (i = 0; i < history.length; i++) {
      step = history[i]; slot = SLOTS[step.t];
      prevTok = i === 0 ? 0 : history[i - 1].x + 1;
      S = sideInfo(key, step.t, prevTok);
      for (m = 0; m < NMSG; m++) {
        z = (codeSymbol(m, step.t) + S.V) % Q; tok = S.sigmaInv[z];
        B = slot.base[tok]; s = sStar(B, eps, mode, alphaMax);
        L = (step.x === tok) ? Math.log((s / B) * slot.base[step.x])
                             : Math.log(((1 - s) / (1 - B)) * slot.base[step.x]);
        if (!isFinite(L)) L = -50;
        scores[m] += L;
      }
    }
    return scores;
  }
  function posterior(scores) {
    var mx = Math.max.apply(null, scores);
    var e = scores.map(function (s) { return Math.exp(s - mx); });
    var z = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (v) { return v / z; });
  }
  function argmax(a) { var b = 0; for (var i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; }

  var core = { Q: Q, NMSG: NMSG, SLOTS: SLOTS, STREAM: STREAM, sideInfo: sideInfo, tilt: tilt, sStar: sStar, codeSymbol: codeSymbol,
               binKL: binKL, sampleFrom: sampleFrom, encodeStep: encodeStep, decodeScores: decodeScores,
               posterior: posterior, argmax: argmax, zipf: zipf };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  root.SimpleMarkDemo = core;

  /* =============================== UI =============================== */
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function bits(m) { return ((m >> 2) & 1) + '' + ((m >> 1) & 1) + '' + (m & 1); }
  function fmt(x, d) { return (typeof d === 'number') ? x.toFixed(d) : String(x); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var SVGNS = 'http://www.w3.org/2000/svg';

  var ui = {
    message: 5, mode: 'tv', eps: 0.2, alphaMax: Infinity, key: 1234,
    wrongKey: false, history: [], timer: null
  };

  function init() {
    var root = $('smdemo');
    if (!root) return;

    // message buttons
    var mb = $('sm-msg');
    for (var m = 0; m < NMSG; m++) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = bits(m); b.dataset.m = m;
      b.setAttribute('aria-pressed', m === ui.message ? 'true' : 'false');
      b.addEventListener('click', function () { ui.message = +this.dataset.m; syncButtons(); reset(); });
      mb.appendChild(b);
    }
    Array.prototype.forEach.call($('sm-mode').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { ui.mode = this.dataset.mode; syncButtons(); reset(); });
    });
    $('sm-eps').addEventListener('input', function () { ui.eps = +this.value; $('sm-eps-val').textContent = fmt(ui.eps, 2); reset(); });
    $('sm-alpha').addEventListener('change', function () { ui.alphaMax = this.value === 'none' ? Infinity : +this.value; reset(); });
    $('sm-key').addEventListener('change', function () { ui.key = (+this.value || 0) >>> 0; reset(); });
    $('sm-wrongkey').addEventListener('change', function () { ui.wrongKey = this.checked; render(); });
    $('sm-step').addEventListener('click', function () { stopPlay(); step(); });
    $('sm-play').addEventListener('click', function () { if (ui.timer) stopPlay(); else play(); });
    $('sm-run').addEventListener('click', function () { stopPlay(); while (ui.history.length < SLOTS.length) step(true); render(); });
    $('sm-reset').addEventListener('click', function () { stopPlay(); reset(); });
    // initial state comes from the markup so the controls and the encoder never disagree
    ui.eps = +$('sm-eps').value; $('sm-eps-val').textContent = fmt(ui.eps, 2);
    ui.alphaMax = $('sm-alpha').value === 'none' ? Infinity : +$('sm-alpha').value;
    ui.key = (+$('sm-key').value || 0) >>> 0;
    syncButtons();
    reset();
  }
  function syncButtons() {
    Array.prototype.forEach.call($('sm-msg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', +b.dataset.m === ui.message ? 'true' : 'false'); });
    Array.prototype.forEach.call($('sm-mode').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.mode === ui.mode ? 'true' : 'false'); });
  }
  function reset() { ui.history = []; render(); }
  function step(silent) {
    if (ui.history.length >= SLOTS.length) return;
    var t = ui.history.length;
    var st = encodeStep(ui, t, ui.message, ui.key, ui.eps, ui.mode, ui.alphaMax, Math.random());
    ui.history.push(st);
    if (!silent) render();
    if (ui.history.length >= SLOTS.length) stopPlay();
  }
  function play() {
    if (ui.history.length >= SLOTS.length) reset();
    $('sm-play').textContent = 'Pause';
    ui.timer = setInterval(function () { step(); }, 420);
  }
  function stopPlay() { if (ui.timer) { clearInterval(ui.timer); ui.timer = null; } $('sm-play').textContent = 'Play'; }

  /* ---------- rendering ---------- */
  function render() {
    var n = ui.history.length;
    var done = n >= SLOTS.length;
    // which step to show in the encoder panel: the last sampled one, or a preview of step 0
    var showStep, preview = false;
    if (n === 0) {
      var S0 = sideInfo(ui.key, 0, 0), C0 = codeSymbol(ui.message, 0), Z0 = (C0 + S0.V) % Q, tg0 = S0.sigmaInv[Z0];
      showStep = { t: 0, S: S0, C: C0, Z: Z0, target: tg0, tilt: tilt(SLOTS[0].base, tg0, ui.eps, ui.mode, ui.alphaMax), x: -1, hit: false };
      preview = true;
    } else showStep = ui.history[n - 1];
    renderPipeline(showStep, preview);
    renderBars(showStep, preview);
    renderReadouts(showStep, preview);
    renderDecoder();
    renderStory();
    $('sm-step').disabled = done; $('sm-run').disabled = done;
    $('sm-count').textContent = n + ' / ' + SLOTS.length;
  }
  function renderPipeline(st, preview) {
    var slot = SLOTS[st.t];
    var html = '';
    html += '<span class="chip"><span class="k">message</span>' + bits(ui.message) + ' (= ' + ui.message + ')</span><span class="arrow">→</span>';
    html += '<span class="chip"><span class="k">code symbol C<sub>' + (st.t + 1) + '</sub></span>' + st.C + '</span><span class="arrow">+</span>';
    html += '<span class="chip"><span class="k">step key V<sub>' + (st.t + 1) + '</sub></span>' + st.S.V + '</span><span class="arrow">→</span>';
    html += '<span class="chip"><span class="k">target slot Z<sub>' + (st.t + 1) + '</sub></span>(' + st.C + '+' + st.S.V + ') mod 8 = ' + st.Z + '</span><span class="arrow">→</span>';
    html += '<span class="chip target"><span class="k">target word</span>“' + esc(slot.words[st.target]) + '”</span>';
    $('sm-pipeline').innerHTML = html;
    $('sm-steptitle').textContent = (preview ? 'Next word (step 1 of ' : 'Word ' + (st.t + 1) + ' of ') + SLOTS.length + (preview ? ')' : '') + ' — the model chooses among 8 words';
  }
  function renderBars(st, preview) {
    var slot = SLOTS[st.t], T = st.tilt;
    var W = 420, H = 230, padL = 34, padR = 8, padT = 22, padB = 46;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxY = Math.max(0.5, Math.max.apply(null, slot.base.concat(T.wm)) * 1.08);
    var bw = innerW / Q, barW = bw * 0.62;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    var title = document.createElementNS(SVGNS, 'title');
    title.textContent = 'Base next-word distribution versus the watermarked (tilted) distribution for this step';
    svg.appendChild(title);
    function y(v) { return padT + innerH - (v / maxY) * innerH; }
    function el(tag, attrs, text) {
      var e = document.createElementNS(SVGNS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e); return e;
    }
    // axes and gridlines
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      if (g > maxY) return;
      el('line', { x1: padL, x2: W - padR, y1: y(g), y2: y(g), stroke: '#eee', 'stroke-width': 1 });
      el('text', { x: padL - 5, y: y(g) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: '#6b7280' }, g.toFixed(2));
    });
    el('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), stroke: '#999', 'stroke-width': 1 });
    for (var i = 0; i < Q; i++) {
      var cx = padL + bw * i + bw / 2, x0 = cx - barW / 2;
      var isT = i === st.target, b = slot.base[i], w = T.wm[i];
      // base distribution: dashed outline
      el('rect', { x: x0, y: y(b), width: barW, height: y(0) - y(b), fill: 'none', stroke: '#8a8dd6', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' });
      // watermarked distribution: filled
      el('rect', { x: x0, y: y(w), width: barW, height: Math.max(0, y(0) - y(w)), fill: isT ? '#c9463a' : '#c7c9f0', 'fill-opacity': isT ? 0.85 : 0.9, stroke: isT ? '#9b2f25' : '#5b5fc7', 'stroke-width': 1 });
      // multiplier label
      el('text', { x: cx, y: Math.min(y(w), y(b)) - 4, 'text-anchor': 'middle', 'font-size': 9.5, fill: isT ? '#9b2f25' : '#666', 'font-weight': isT ? 700 : 400 }, isT ? '×' + fmt(T.alpha, 2) : '×' + fmt(T.beta, 2));
      // word label
      var label = slot.words[i];
      el('text', { x: cx, y: H - padB + 14, 'text-anchor': 'middle', 'font-size': label.length > 8 ? 8.5 : 10, fill: isT ? '#9b2f25' : '#333', 'font-weight': isT ? 700 : 400 }, label);
      // sampled marker
      if (!preview && st.x === i) {
        el('polygon', { points: (cx - 5) + ',' + (H - padB + 30) + ' ' + (cx + 5) + ',' + (H - padB + 30) + ' ' + cx + ',' + (H - padB + 22), fill: '#222' });
        el('text', { x: cx, y: H - padB + 41, 'text-anchor': 'middle', 'font-size': 8.5, fill: '#222' }, 'sampled');
      }
    }
    el('text', { x: padL, y: 12, 'font-size': 10, fill: '#666' }, 'probability');
    var wrap = $('sm-bars'); wrap.innerHTML = ''; wrap.appendChild(svg);
  }
  function renderReadouts(st, preview) {
    var T = st.tilt, slot = SLOTS[st.t];
    var rows = [
      ['original prob. B', fmt(T.B, 3)],
      ['new prob. s\u2605', fmt(T.s, 3)],
      ['boost \u03B1 = s\u2605/B', fmt(T.alpha, 2) + (isFinite(ui.alphaMax) && Math.abs(T.alpha - ui.alphaMax) < 1e-9 ? ' (capped)' : '')],
      ['scale-down \u03B2', fmt(T.beta, 3)],
      ['TV moved = s\u2605\u2212B', fmt(T.tv, 3), ui.mode === 'tv'],
      ['KL spent (nats)', fmt(T.kl, 3), ui.mode === 'kl']
    ];
    $('sm-readouts').innerHTML = rows.map(function (r) {
      return '<div><span class="k">' + r[0] + '</span><span class="v' + (r[2] ? ' red' : '') + '">' + r[1] + '</span></div>';
    }).join('');
    var adv = T.tv; // s* - B = TV(Q*_t, Q_t) bounds the per-word distinguishing advantage in both modes
    var samp = preview ? 'Press <b>Next word</b> to sample from the red-tinted distribution.' :
      ('Sampled “<b>' + esc(slot.words[st.x]) + '</b>” ' + (st.hit ? '— the target. ' : '— not the target (that happens most of the time at small ε). ') +
       'The best possible detector gains at most <b>' + fmt(adv, 3) + '</b> advantage from this word (the TV distance s★ − B' +
       (ui.mode === 'tv' ? '; budget ε = ' + fmt(ui.eps, 2) + ').' :
                            '; the KL budget ε = ' + fmt(ui.eps, 2) + ' nats bounds it only indirectly, via Pinsker’s inequality TV ≤ √(ε/2) = ' + fmt(Math.sqrt(ui.eps / 2), 3) + ').'));
    if (!preview && T.s >= 1 - 1e-12) samp += ' At this budget the tilt reaches s★ = 1 (β = 0): the target gets all the mass, so this step was certain rather than a random draw.';
    $('sm-sample').innerHTML = samp;
  }
  function renderDecoder() {
    var n = ui.history.length;
    var key = ui.wrongKey ? (ui.key + 1) >>> 0 : ui.key;
    var scores = decodeScores(ui.history, key, ui.eps, ui.mode, ui.alphaMax);
    var post = posterior(scores);
    var best = argmax(scores);
    var W = 420, H = 190, padL = 34, padR = 8, padT = 20, padB = 30;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var bw = innerW / NMSG, barW = bw * 0.62;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    var title = document.createElementNS(SVGNS, 'title');
    title.textContent = 'Decoder posterior probability for each of the 8 candidate messages';
    svg.appendChild(title);
    function y(v) { return padT + innerH - v * innerH; }
    function el(tag, attrs, text) {
      var e = document.createElementNS(SVGNS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e); return e;
    }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      el('line', { x1: padL, x2: W - padR, y1: y(g), y2: y(g), stroke: '#eee', 'stroke-width': 1 });
      el('text', { x: padL - 5, y: y(g) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: '#6b7280' }, g.toFixed(2));
    });
    el('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), stroke: '#999', 'stroke-width': 1 });
    for (var m = 0; m < NMSG; m++) {
      var cx = padL + bw * m + bw / 2, x0 = cx - barW / 2;
      var isTrue = m === ui.message, isBest = n > 0 && m === best;
      var fill = isBest ? (isTrue ? '#2e8b57' : '#c9463a') : '#c7c9f0';
      el('rect', { x: x0, y: y(post[m]), width: barW, height: Math.max(0, y(0) - y(post[m])), fill: fill, stroke: isBest ? '#222' : '#5b5fc7', 'stroke-width': isBest ? 1.4 : 1 });
      if (n > 0) el('text', { x: cx, y: y(post[m]) - 4, 'text-anchor': 'middle', 'font-size': 9, fill: '#555' }, (post[m] * 100).toFixed(0) + '%');
      el('text', { x: cx, y: H - padB + 14, 'text-anchor': 'middle', 'font-size': 10.5, 'font-family': 'ui-monospace, Menlo, monospace', fill: '#333', 'font-weight': isTrue ? 700 : 400 }, bits(m));
      if (isTrue) el('text', { x: cx, y: H - padB + 25, 'text-anchor': 'middle', 'font-size': 8, fill: '#666' }, 'true');
    }
    el('text', { x: padL, y: 12, 'font-size': 10, fill: '#666' }, 'posterior probability of each of the 8 candidate messages');
    var wrap = $('sm-dec'); wrap.innerHTML = ''; wrap.appendChild(svg);

    var v = $('sm-verdict');
    if (n === 0) v.innerHTML = '<span class="wait">No words yet. With the key, the decoder scores each candidate message by how well it explains the sampled words.</span>';
    else {
      var sorted = scores.slice().sort(function (a, b) { return b - a; });
      var nCap = 0;
      for (var i = 0; i < n; i++) if (isFinite(ui.alphaMax) && Math.abs(ui.history[i].tilt.alpha - ui.alphaMax) < 1e-9) nCap++;
      var gap = sorted[0] - sorted[1];
      var txt = 'After <b>' + n + '</b> word' + (n === 1 ? '' : 's') + ': decoded <b>' + bits(best) + '</b> ';
      txt += (best === ui.message) ? '<span class="ok">✓ correct</span>' : '<span class="bad">✗ wrong</span>';
      txt += ' (posterior ' + (post[best] * 100).toFixed(0) + '%; the runner-up message trails by ' + fmt(gap, 1) + ' in log-likelihood).';
      if (ui.wrongKey) txt += ' <span class="wait">Without the right key the scores are noise, so the message is unreadable.</span>';
      else if (n >= SLOTS.length && best !== ui.message) txt += ' <span class="wait">The story ran out before the evidence did: smaller budgets need more text. Try a larger ε' + (isFinite(ui.alphaMax) && nCap >= n / 3 ? ', loosen or remove the α cap (it capped the boost on ' + nCap + ' of ' + n + ' words, so ε alone has little effect)' : '') + ', or Reset for a fresh sample.</span>';
      v.innerHTML = txt;
    }
  }
  function renderStory() {
    // Show the text generated so far: all parts up to the next (pending) slot, then an ellipsis.
    var html = '', n = ui.history.length, stop = false;
    STREAM.forEach(function (part) {
      if (stop) return;
      if (part.fixed) { html += esc(part.fixed); return; }
      var i = part.idx;
      if (i < n) {
        var st = ui.history[i];
        html += '<span class="w' + (st.hit ? ' hit' : '') + (i === n - 1 ? ' cur' : '') + '" title="' + (st.hit ? 'target word' : 'not the target') + '">' + esc(part.words[st.x]) + '</span>';
      } else {
        html += '<span class="pending">\u2026</span>';
        stop = true;
      }
    });
    $('sm-story').innerHTML = html;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);
