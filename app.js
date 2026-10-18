(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("chg:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("chg:" + k, JSON.stringify(v)); } catch {} }
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const secById = id => SECTIONS.find(s => s.id === id);
  const TOTAL_CHECKS = CHECKLIST.reduce((n, g) => n + g.items.length, 0);

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  /* ---------- day/night + size ---------- */
  const root = document.documentElement;
  root.dataset.mode = LS.get("mode", "day");
  root.dataset.size = LS.get("size", "0");
  $("#modeBtn").onclick = () => { root.dataset.mode = root.dataset.mode === "day" ? "night" : "day"; LS.set("mode", root.dataset.mode); };
  $("#sizeBtn").onclick = () => { root.dataset.size = String((+root.dataset.size + 1) % 3); LS.set("size", root.dataset.size); toast(["Normal text", "Large text", "Extra large text"][+root.dataset.size]); };

  /* ---------- home ---------- */
  $("#homeGrid").innerHTML = SECTIONS.map(s =>
    `<button class="tile" data-go="sec:${s.id}"><span class="t-ico" style="--c:${s.color}22">${s.icon}</span><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></button>`
  ).join("") +
    `<button class="tile" data-go="check"><span class="t-ico" style="--c:#0F766E22">✅</span><b>Checklist</b><small>Tick off each step</small></button>` +
    `<button class="tile" data-go="sources"><span class="t-ico" style="--c:#47556922">📚</span><b>Sources</b><small>Every source, with links</small></button>`;
  $("#probList").innerHTML = PROBLEMS.map(p => `<button class="prob" data-go="sec:${p.go[0]}">${esc(p.t)}</button>`).join("");

  /* ---------- cards ---------- */
  function srcHtml(it) {
    if (!it.src.length) return `<div class="srcs">Source: general phone troubleshooting. No outside source.</div>`;
    return `<div class="srcs">Source${it.src.length > 1 ? "s" : ""}: ` +
      it.src.map(k => `<a href="${S[k].url}" target="_blank" rel="noopener">${esc(S[k].name)}</a>`).join(" · ") +
      (it.when ? `<span class="when">${esc(it.when)}</span>` : "") + `</div>`;
  }
  const kindName = { step: "Try this", why: "Reason", warn: "Be careful", note: "Good to know" };
  function cardHtml(sec, it, i) {
    return `<article class="card ${it.kind}${it.unofficial ? " unoff" : ""}" id="card-${sec.id}-${i}">
      <span class="tag">${it.unofficial ? "News report · not from Clubhouse" : kindName[it.kind]}</span>
      <div class="card-top"><h3>${esc(it.t)}</h3>
      <button class="card-play" data-play="${sec.id}:${i}" aria-label="Read this card out loud">▶</button></div>
      <p>${esc(it.d)}</p>${srcHtml(it)}</article>`;
  }

  /* ---------- routing ---------- */
  let curSec = null;
  function show(view, secId, keepVoice) {
    $$(".view").forEach(v => v.hidden = v.dataset.view !== view);
    if (view === "section") renderSection(secId);
    if (view === "check") renderChecklist();
    if (view === "sources") renderSources();
    const tabKey = view === "section" ? "sec:" + secId : view;
    $$(".tab").forEach(t => t.setAttribute("aria-current", t.dataset.go === tabKey ? "page" : "false"));
    const hash = view === "section" ? "#" + secId : "#" + view;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    if (!keepVoice) window.scrollTo(0, 0);
  }
  function renderSection(id) {
    const s = secById(id) || SECTIONS[0]; curSec = s.id;
    const n = SECTIONS.indexOf(s);
    $("#secEyebrow").textContent = `${s.icon} Section ${n + 1} of ${SECTIONS.length}`;
    $("#secTitle").textContent = s.title;
    $("#secIntro").textContent = s.intro;
    $("#secItems").innerHTML = s.items.map((it, i) => cardHtml(s, it, i)).join("");
    $("#secPrev").disabled = n === 0; $("#secNext").disabled = n === SECTIONS.length - 1;
    $("#secPrev").style.visibility = n === 0 ? "hidden" : "visible";
    $("#secNext").textContent = n === SECTIONS.length - 1 ? "Next ➡" : `${SECTIONS[n + 1].title} ➡`;
    if (n === SECTIONS.length - 1) { $("#secNext").textContent = "Checklist ➡"; $("#secNext").disabled = false; }
    markSpeaking();
  }
  function go(target) {
    if (target === "home" || target === "check" || target === "sources") show(target);
    else if (target.startsWith("sec:")) show("section", target.slice(4));
  }
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-go]");
    if (g) { go(g.dataset.go); return; }
    const p = e.target.closest("[data-play]");
    if (p) { const [sid, i] = p.dataset.play.split(":"); playQueue(sectionQueue(sid), +i, false, true); }
  });
  $("#secPrev").onclick = () => { const n = SECTIONS.findIndex(s => s.id === curSec); if (n > 0) show("section", SECTIONS[n - 1].id); };
  $("#secNext").onclick = () => { const n = SECTIONS.findIndex(s => s.id === curSec); if (n < SECTIONS.length - 1) show("section", SECTIONS[n + 1].id); else show("check"); };

  /* ---------- checklist ---------- */
  let checks = LS.get("checks", {});
  function renderChecklist() {
    let k = 0;
    $("#chkList").innerHTML = CHECKLIST.map(g => `<div class="chk-group"><h3>${esc(g.g)}</h3>` +
      g.items.map(t => { const id = "c" + (k++); return `<label class="chk${checks[id] ? " done" : ""}" id="chk-${id}"><input type="checkbox" data-c="${id}"${checks[id] ? " checked" : ""}><span>${esc(t)}</span></label>`; }).join("") + `</div>`).join("");
    updateCount(); markSpeaking();
  }
  $("#chkList").addEventListener("change", e => {
    const id = e.target.dataset.c; if (!id) return;
    if (e.target.checked) checks[id] = 1; else delete checks[id];
    LS.set("checks", checks); e.target.closest(".chk").classList.toggle("done", e.target.checked); updateCount();
  });
  function updateCount() {
    const n = Object.keys(checks).length;
    $("#chkCount").textContent = `${n} of ${TOTAL_CHECKS}`;
    $("#chkBar").style.width = (n / TOTAL_CHECKS * 100) + "%";
    $("#progChip").textContent = `✅ ${n}/${TOTAL_CHECKS}`;
  }
  $("#chkReset").onclick = () => { if (confirm("Clear all your ticks?")) { checks = {}; LS.set("checks", checks); renderChecklist(); } };
  $("#chkPrint").onclick = () => window.print();
  updateCount();

  /* ---------- sources ---------- */
  function renderSources() {
    const used = {};
    SECTIONS.forEach(s => s.items.forEach(it => it.src.forEach(k => (used[k] = used[k] || []).push(`${s.title}: ${it.t}`))));
    used.request = used.request || []; if (!used.request.length) used.request.push("Moderation: How to appeal a suspension");
    used.knowledge = ["Main Clubhouse help site"];
    used.play = ["Clubhouse support email: support@clubhouse.com"];
    const keys = Object.keys(S).sort((a, b) => {
      const oa = isOfficial(S[a].url), ob = isOfficial(S[b].url);
      return oa === ob ? S[a].name.localeCompare(S[b].name) : (oa ? -1 : 1);
    });
    $("#srcList").innerHTML = `<p class="muted small"><b>${keys.filter(k => isOfficial(S[k].url)).length}</b> sources are from Clubhouse itself. <b>${keys.filter(k => !isOfficial(S[k].url)).length}</b> are news or how-to sites.</p>` +
      keys.map(k => `<div class="src"><a href="${S[k].url}" target="_blank" rel="noopener">${esc(S[k].name)}</a>
        <span class="badge ${isOfficial(S[k].url) ? "off" : "oth"}">${isOfficial(S[k].url) ? "Clubhouse" : "Other"}</span>
        <span class="src-url">${esc(S[k].url)}</span>
        ${used[k] ? `<ul>${used[k].map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}</div>`).join("");
  }
  function isOfficial(u) { return /clubhouse\.com|joinclubhouse|play\.google\.com\/store\/apps\/details\?id=com\.clubhouse/.test(u); }

  /* ---------- share ---------- */
  $("#shareApp").onclick = async () => {
    const data = { title: "Clubhouse Room Visibility Guide", text: "Can't find a Clubhouse room? This guide shows why rooms go missing and how to find them through the host.", url: location.href.split("#")[0] };
    if (navigator.share) { try { await navigator.share(data); } catch {} }
    else { try { await navigator.clipboard.writeText(data.url); toast("Link copied"); } catch { prompt("Copy this link:", data.url); } }
  };

  /* ---------- voice ---------- */
  const synth = window.speechSynthesis;
  const RATES = [0.75, 1, 1.25, 1.5];
  let rate = LS.get("rate", 1);
  let queue = [], qi = 0, si = 0, sentences = [], token = 0;
  let state = "idle"; // idle | playing | paused
  let fullRun = false, wake = null;

  const clean = t => t.replace(/[⚡❓🛡️🚫🏠🔎🎙️🔌]/g, "").replace(/\b(\d+)\.\s/g, "$1, ").trim();
  const split = t => (t.match(/[^.!?]+[.!?]*/g) || [t]).map(s => s.trim()).filter(Boolean);

  function sectionQueue(sid) {
    const s = secById(sid);
    return [{ label: s.title, text: `${s.title}. ${s.intro}`, view: ["section", s.id], el: null }]
      .concat(s.items.map((it, i) => ({ label: `${s.title} · ${it.t}`, text: `${it.t}. ${it.d}`, view: ["section", s.id], el: `card-${s.id}-${i}` })));
  }
  function fullQueue() {
    let q = [{ label: "Welcome", text: "Can't find a Clubhouse room? This guide explains why a room may be missing from your Hallway, and how to get back in through the host's profile. Use Rewind and Forward to move between cards.", view: ["home"], el: null }];
    SECTIONS.forEach(s => { q = q.concat(sectionQueue(s.id)); });
    q.push({ label: "Done", text: "That is the end of the guide. Open the Checklist to tick off each step.", view: ["check"], el: null });
    return q;
  }
  function checkQueue() {
    const q = [{ label: "Checklist", text: "Checklist. Here are the steps to tick off.", view: ["check"], el: null }];
    let k = 0;
    CHECKLIST.forEach(g => {
      q.push({ label: g.g, text: g.g + ".", view: ["check"], el: null });
      g.items.forEach(t => { q.push({ label: t, text: t + ".", view: ["check"], el: "chk-c" + (k++) }); });
    });
    return q;
  }

  function pickVoice() {
    const vs = synth ? synth.getVoices() : [];
    return vs.find(v => /en[-_]US/i.test(v.lang) && /Samantha|Google US|Aria|Jenny|Natural/i.test(v.name)) ||
      vs.find(v => /en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  }
  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};

  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state === "playing") keepAwake(true); });

  function markSpeaking() {
    $$(".speaking").forEach(e => e.classList.remove("speaking"));
    if (state === "idle" || !queue[qi] || !queue[qi].el) return;
    const el = document.getElementById(queue[qi].el);
    if (el) el.classList.add("speaking");
  }
  function updatePlayer() {
    const p = $("#player");
    p.classList.toggle("on", state === "playing"); p.classList.toggle("paused", state === "paused");
    const pb = $("#pPlay");
    pb.innerHTML = state === "playing" ? "⏸<small>Pause</small>" : "▶<small>Play</small>";
    pb.setAttribute("aria-label", state === "playing" ? "Pause" : "Play");
    $("#pLabel").textContent = state === "idle" ? "Tap ▶ to listen" : (state === "paused" ? "Paused · " : "") + queue[qi].label;
    $("#pPos").textContent = state === "idle" ? "" : `${qi + 1} of ${queue.length}`;
    $("#pRate").innerHTML = `${rate}×<small>Speed</small>`;
    markSpeaking();
  }

  function goToItem() {
    const it = queue[qi];
    const [v, sid] = it.view;
    const visible = $(`.view[data-view="${v}"]`);
    if (visible.hidden || (v === "section" && curSec !== sid)) show(v, sid, true);
    markSpeaking();
    const el = it.el ? document.getElementById(it.el) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (si === 0) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function speakCurrent() {
    if (!synth) { toast("This browser cannot read out loud"); return; }
    const my = ++token;
    synth.cancel();
    if (si === 0) goToItem();
    sentences = split(clean(queue[qi].text));
    const u = new SpeechSynthesisUtterance(sentences[si] || "");
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = rate;
    u.onend = () => { if (my !== token || state !== "playing") return; advance(); };
    u.onerror = e => { if (my !== token || state !== "playing") return; if (e.error === "interrupted" || e.error === "canceled") return; advance(); };
    synth.speak(u);
    if (fullRun) LS.set("resume", { qi });
    updatePlayer();
  }
  function advance() {
    si++;
    if (si < sentences.length) { speakCurrent(); return; }
    si = 0; qi++;
    if (qi >= queue.length) { finish(); return; }
    setTimeout(() => { if (state === "playing") speakCurrent(); }, 450);
  }
  function finish() {
    token++; state = "idle"; if (synth) synth.cancel(); keepAwake(false);
    if (fullRun) LS.set("resume", null);
    fullRun = false; qi = 0; si = 0; updatePlayer(); refreshResume();
  }
  function playQueue(q, start = 0, full = false, noScrollTop) {
    queue = q; qi = start; si = 0; fullRun = full; state = "playing"; keepAwake(true);
    speakCurrent();
  }

  $("#pPlay").onclick = () => {
    if (state === "playing") { state = "paused"; token++; synth && synth.cancel(); keepAwake(false); updatePlayer(); return; }
    if (state === "paused") { state = "playing"; keepAwake(true); speakCurrent(); return; }
    // idle: play the section on screen, or the whole guide from home
    const v = $$(".view").find(x => !x.hidden).dataset.view;
    if (v === "section") playQueue(sectionQueue(curSec));
    else if (v === "check") playQueue(checkQueue());
    else playQueue(fullQueue(), 0, true);
  };
  $("#pStop").onclick = () => {
    if (state === "idle") return;
    const keep = fullRun ? qi : null;
    token++; synth && synth.cancel(); state = "idle"; keepAwake(false);
    if (keep !== null) LS.set("resume", { qi: keep });
    fullRun = false; updatePlayer(); refreshResume(); toast("Stopped");
  };
  $("#pPrev").onclick = () => {
    if (state === "idle") { toast("Press ▶ Play first"); return; }
    // within the first sentence, go to the previous card; otherwise restart this card
    if (si === 0 && qi > 0) qi--;
    si = 0;
    if (state === "paused") { state = "playing"; keepAwake(true); }
    speakCurrent();
  };
  $("#pNext").onclick = () => {
    if (state === "idle") { toast("Press ▶ Play first"); return; }
    if (qi >= queue.length - 1) { finish(); return; }
    qi++; si = 0;
    if (state === "paused") { state = "playing"; keepAwake(true); }
    speakCurrent();
  };
  $("#pRate").onclick = () => {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; LS.set("rate", rate);
    toast(`Speed ${rate}×`);
    if (state === "playing") speakCurrent(); else updatePlayer();
  };

  $("#startAll").onclick = () => playQueue(fullQueue(), 0, true);
  $("#secPlay").onclick = () => playQueue(sectionQueue(curSec));
  $("#chkPlay").onclick = () => playQueue(checkQueue());
  function refreshResume() {
    const r = LS.get("resume", null);
    const b = $("#resumeHome");
    if (r && r.qi > 0) { const q = fullQueue(); b.hidden = false; $("#resumeLbl").textContent = `Card ${r.qi + 1} of ${q.length}: ${q[r.qi] ? q[r.qi].label : ""}`; }
    else b.hidden = true;
  }
  $("#resumeHome").onclick = () => { const r = LS.get("resume", null); playQueue(fullQueue(), r ? r.qi : 0, true); };
  refreshResume();

  /* ---------- start ---------- */
  function fromHash() {
    const h = location.hash.slice(1);
    if (secById(h)) show("section", h);
    else if (h === "check" || h === "sources") show(h);
    else show("home");
  }
  window.addEventListener("hashchange", fromHash);
  fromHash(); updatePlayer();
  window.__chg = { get state() { return state; }, get qi() { return qi; }, get queue() { return queue; } };
})();
