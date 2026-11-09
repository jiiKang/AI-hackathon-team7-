/* =====================================================================
   안암 카페 챗 — 화면 로직
   ★ 디자인 시안이 오면 이렇게 바꾸세요
     · 색·글자·간격·모양 → styles.css 맨 위 :root 값 + 각 화면 구역
     · 문구·출처·예시 질문 → 바로 아래 "설정" (TEXT, SOURCES, EXAMPLES, FIELDS)
     · 화면 구조(HTML) → 아래 V.* 함수 (화면 1개 = 함수 1개, data-screen 이름이 CSS 구역 이름과 같아요)
   ===================================================================== */

/* ---------- 설정 ---------- */
const STATION = { lat: 37.5861, lng: 127.0292, level: 4 };   // 안암역 (지도 시작 위치)
const TEXT = {
  eyebrow: "안암동 카페 찾기",
  title: '어떤 <em>카페</em>를 찾으세요?',
  sub: "문장으로 편하게 물어보세요",
  placeholder: "예: 콘센트 많고 조용한 카페",
  footLine: "정보 출처: 카카오맵 · 방문 리뷰(영수증·블로그) · 건축물대장",
  footMore: "자세히",
  contact: "",                       // 문의 연락처가 있으면 적으세요 (예: 인스타 @xxx) — 출처 안내 화면 맨 아래에 나와요
};
const DATA_UPDATED = "2026-11-08";   // ★ 데이터 마지막 업데이트 날짜
const EXAMPLES = [                   // 홈 화면 칩 (아이콘 이름은 ICON 참고)
  { icon: "clock", label: "지금 영업 중", q: "지금 영업 중인 카페" },
  { icon: "plug",  label: "콘센트 많은", q: "콘센트 많고 작업하기 좋은 카페" },
  { icon: "cake",  label: "디저트",     q: "디저트 맛있는 카페" },
  { icon: "quiet", label: "조용한",     q: "조용한 카페" },
];
const FIELDS = [                     // 정보 수정 항목 — key 는 서버(cafe_core.FEEDBACK_FIELDS)와 같아야 해요
  { key: "hours",   label: "영업시간" },
  { key: "seating", label: "좌석·콘센트" },
  { key: "menu",    label: "메뉴" },
  { key: "mood",    label: "분위기·소음" },
  { key: "closed",  label: "폐업·이전" },
  { key: "photo",   label: "사진" },
  { key: "etc",     label: "기타" },
];
const SOURCES = [                    // 데이터·출처 안내 화면의 항목
  ["위치·주소", "카카오맵(카카오 로컬 API)에서 가져왔어요."],
  ["영업시간·좌석·메뉴·분위기", "영수증 리뷰와 블로그 리뷰에서 추출해 팀이 직접 수집·정리했어요. 실제와 다를 수 있어요."],
  ["좌석 규모", "건축물대장의 면적으로 추정한 값이라 참고용이에요."],
  ["신뢰도 A·B·C", "근거가 된 리뷰의 수와 일치 정도에 따른 등급이에요. A가 가장 믿을 만해요."],
  ["AI 해석", "질문을 검색 조건으로 바꾸는 데만 AI(Gemini)를 써요. 카페 정보는 AI가 만들지 않고 정리된 데이터에서만 가져와요."],
  ["사진", "사진 아래에 출처를 표시해요. 사진의 저작권은 원 저작자에게 있어요."],
  ["정보 수정", "틀린 정보는 카페 상세의 '정보가 달라요'로 알려 주세요. 확인 후 반영해요."],
];

/* ---------- 아이콘 (선 아이콘, 색은 CSS 의 .ico) ---------- */
const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plug:  '<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4"/>',
  cake:  '<path d="M4 20h16v-6H4zM4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M12 8V5M12 5c-1 0-1-1 0-2 1 1 1 2 0 2z"/>',
  quiet: '<path d="M11 5 6 9H3v6h3l5 4zM16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>',
  seat:  '<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M4 11h16v4H4zM6 15v4M18 15v4"/>',
  cup:   '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  mood:  '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="m4 17 5-4 3 2.5 3-3 5 4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`;

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const safeUrl = u => /^https?:\/\//i.test(u || "") || /^\//.test(u || "") ? u : "";

const sheet = $("#sheet"), body = $("#body"), form = $("#form"), qEl = $("#q"), foot = $("#foot");
qEl.placeholder = TEXT.placeholder;
foot.innerHTML = `<span>${esc(TEXT.footLine)}</span><button type="button" data-sources>${esc(TEXT.footMore)}</button>`;

/* ---------- 상태 ---------- */
const S = { all: [], results: [], understood: [], notice: "", query: "", selected: null, token: 0, lastView: "home" };
let map = null, overlays = [];

/* =====================================================================
   화면들 — 각 함수는 HTML 문자열을 돌려줘요. (data-screen = 화면 이름)
   ===================================================================== */
const V = {
  /* 화면 1. 홈 */
  home: () => `<div data-screen="home">
    <div class="eyebrow">${esc(TEXT.eyebrow)}</div>
    <h1>${TEXT.title}</h1>
    <p class="sub">${esc(TEXT.sub)}</p>
    <div class="chips">${EXAMPLES.map((e, i) => `<button class="chip" data-chip="${i}">${ico(e.icon)}${esc(e.label)}</button>`).join("")}</div>
  </div>`,

  /* 화면 2. 검색 중 */
  loading: q => `<div data-screen="loading">
    <div class="rhead"><div class="rtitle"><b>“<span class="q">${esc(q)}</span>” 찾는 중…</b></div></div>
    <div class="cards"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
  </div>`,

  /* 화면 3. 결과 목록 */
  results: () => `<div data-screen="results">
    <div class="rhead">
      <div class="rtitle"><b>“<span class="q">${esc(S.query)}</span>”</b><button class="link" data-home>처음으로</button></div>
      ${S.understood.length ? `<div class="und">이렇게 이해했어요 ${S.understood.map(u => `<span class="c">${esc(u)}</span>`).join("")}</div>` : ""}
      ${S.notice ? `<span class="notice">${esc(S.notice)}</span>` : ""}
    </div>
    <ol class="cards">${S.results.map(V.card).join("")}</ol>
  </div>`,

  /* 결과 카드 1장 (짧게: 이름 · 영업 상태 · 시간 · 근거 칩 최대 3개) */
  card: c => {
    const chips = (c.matched || []).slice(0, 3);
    const reason = c.reason && c.reason !== chips.join(" · ") && c.reason !== chips.join(", ") ? c.reason : "";
    const ph = (c.photos || [])[0];
    return `<li class="card" data-id="${c.id}">
      <span class="rank">${c.rank || ""}</span>
      <div class="cmain">
        <div class="cname">${esc(c.name)}</div>
        <div class="meta">${V.badge(c)}${c.summary && c.summary.hours ? `<span>${esc(c.summary.hours)}</span>` : ""}</div>
        ${reason ? `<div class="reason">${esc(reason)}</div>` : ""}
        ${chips.length ? `<div class="kw">${chips.map(k => `<span>${esc(k)}</span>`).join("")}</div>` : ""}
      </div>
      ${ph ? `<div class="thumb"><img src="${esc(safeUrl(ph.url))}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : ""}
    </li>`;
  },
  badge: c => c.open_now === true ? '<span class="badge open">영업 중</span>' : c.open_now === false ? '<span class="badge closed">영업 종료</span>' : "",

  /* 화면 4. 결과 없음 / 오류 */
  error: msg => `<div data-screen="error">
    <div class="rhead"><div class="rtitle"><b>검색 결과</b><button class="link" data-home>처음으로</button></div></div>
    <div class="empty">${esc(msg)}</div>
  </div>`,

  /* 화면 5. 카페 상세 */
  detail: c => {
    const s = c.summary || {}, n = c.notes || {};
    const row = (icon, label, v) => `<div class="row">${ico(icon)}<b>${label}</b><span class="${v ? "" : "none"}">${esc(v || "정보 없음")}</span></div>`;
    const more = [["영업시간", n.hours], ["좌석", n.seating], ["분위기", n.mood]].filter(x => x[1]);
    const q = encodeURIComponent(c.name);
    const nav = c.lat != null ? `https://map.kakao.com/link/to/${q},${c.lat},${c.lng}` : `https://map.kakao.com/link/search/${q}`;
    return `<div class="page detail" data-screen="detail">
      <div class="toprow"><button class="back" data-back>${S.results.length ? "← 후보 목록" : "← 처음으로"}</button></div>
      ${V.photos(c)}
      <h2>${esc(c.name)} ${V.badge(c)}</h2>
      ${c.address ? `<p class="addr">${esc(c.address)}</p>` : ""}
      <div class="rows">
        ${row("clock", "시간", s.hours)}${row("seat", "좌석", s.seating)}${row("cup", "메뉴", s.menu)}${row("mood", "분위기", s.atmosphere)}
      </div>
      ${more.length ? `<details class="more"><summary>자세히</summary>${more.map(m => `<p><b>${m[0]}</b> ${esc(m[1])}</p>`).join("")}</details>` : ""}
      ${c.basis ? `<div class="basis">근거: ${esc(c.basis)}</div>` : ""}
      <div class="actions">
        <a class="go" href="${esc(nav)}" target="_blank" rel="noopener">카카오맵에서 길찾기</a>
        <button class="btn2" data-feedback>정보가 달라요</button>
      </div>
    </div>`;
  },
  photos: c => {
    const ps = c.photos || [];
    if (!ps.length) return `<div class="photos one"><figure class="photo"><div class="ph empty">${ico("photo")}사진 준비 중</div></figure></div>`;
    return `<div class="photos${ps.length === 1 ? " one" : ""}">${ps.map(p => {
      const cap = p.source ? `출처: <a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(host(p.source) || "원문")} ↗</a>` : esc(p.credit || "");
      return `<figure class="photo"><div class="ph"><img src="${esc(safeUrl(p.url))}" alt="${esc(c.name)} 사진" loading="lazy" referrerpolicy="no-referrer"></div><figcaption>${cap}</figcaption></figure>`;
    }).join("")}</div>`;
  },

  /* 화면 6. 정보 수정 제안 */
  feedback: (c, st) => `<div class="page" data-screen="feedback">
    <div class="toprow"><button class="back" data-fb-back>← 돌아가기</button></div>
    <h2 class="fbtitle">${esc(c.name)}</h2>
    <p class="lead">틀린 정보를 알려 주시면 확인 후 고칠게요.</p>
    <div class="seg" id="fbField">${FIELDS.map(f => `<button type="button" data-field="${f.key}" class="${st.field === f.key ? "on" : ""}">${f.label}</button>`).join("")}</div>
    <label class="field">어떻게 달라요?<textarea id="fbValue" maxlength="500" placeholder="예: 일요일은 12시에 열어요">${esc(st.value || "")}</textarea></label>
    <label class="field">참고 링크 (선택)<input id="fbUrl" type="url" inputmode="url" placeholder="https://" value="${esc(st.url || "")}"></label>
    <p class="err" id="fbErr">${esc(st.err || "")}</p>
    <button class="go" id="fbSend">보내기</button>
    <p class="fine">보낸 내용은 확인 후 반영돼요. 개인정보는 적지 마세요.</p>
  </div>`,
  feedbackDone: c => `<div class="page" data-screen="feedback-done">
    <div class="done">${ico("check")}<h2 class="fbtitle" style="margin-top:10px">알려 주셔서 고마워요</h2>
      <p class="lead">확인 후 반영할게요.</p></div>
    <div class="actions"><button class="go" data-fb-back>${esc(c.name)} 보기</button><button class="btn2" data-home>처음으로</button></div>
  </div>`,

  /* 화면 7. 데이터·정보 출처 안내 */
  sources: () => `<div class="page" data-screen="sources">
    <div class="toprow"><button class="back" data-src-back>← 돌아가기</button></div>
    <h2 class="fbtitle">데이터·정보 출처</h2>
    <div class="src">${SOURCES.map(s => `<div><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p></div>`).join("")}</div>
    <p class="fine">마지막 업데이트 ${esc(DATA_UPDATED)}${TEXT.contact ? ` · 문의 ${esc(TEXT.contact)}` : ""}</p>
  </div>`,
};

/* ---------- 화면 그리기 ---------- */
function render(name, html) {
  S.view = name;
  sheet.dataset.view = name;
  body.innerHTML = html;
  body.scrollTop = 0;
}

/* 사진 로드 실패 → 그 사진만 숨김/대체 (캡처 단계에서 이미지 error 를 잡아요) */
document.addEventListener("error", e => {
  const t = e.target;
  if (!t || t.tagName !== "IMG") return;
  const box = t.closest(".thumb, .ph");
  if (!box) return;
  box.classList.add("broken");
  if (box.classList.contains("ph")) { t.remove(); box.insertAdjacentHTML("afterbegin", `${ico("photo")}사진을 불러오지 못했어요`); }
}, true);

/* =====================================================================
   바텀시트 높이·드래그
   ===================================================================== */
const vh = () => window.innerHeight;
const SN = {
  get min() { return 70 + foot.offsetHeight + 26 + 6; },        // 손잡이 + 입력창 + 출처 줄
  get home() { return Math.min(420, vh() * 0.55); },
  get detail() { return Math.round(vh() * 0.66); },
  get mid() { return Math.round(vh() * 0.5); },
  get full() { return Math.round(vh() - 36); },
};
let curH = 0;
function setH(h, animate = true) {
  curH = Math.max(SN.min, Math.min(SN.full, h));
  sheet.classList.toggle("dragging", !animate);
  sheet.style.height = curH + "px";
}
function snapTo(k) { setH(SN[k]); }
function nearest(h) {
  const pts = ["min", "home", "mid", "detail", "full"].map(k => [k, SN[k]]);
  return pts.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
}
(function drag() {
  let startY = 0, startH = 0, moved = false, on = false;
  sheet.addEventListener("pointerdown", e => {
    if (e.target.closest("button, a, input, textarea, summary")) return;
    if (!e.target.closest("[data-drag]")) return;
    on = true; moved = false; startY = e.clientY; startH = curH;
    try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
  });
  sheet.addEventListener("pointermove", e => {
    if (!on) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    if (moved) setH(startH + dy, false);
  });
  const end = e => {
    if (!on) return; on = false;
    sheet.classList.remove("dragging");
    if (!moved) { if (e.target.closest("#grab")) snapTo(curH > SN.home + 20 ? "home" : "full"); return; }
    snapTo(nearest(curH));
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
})();
window.addEventListener("resize", () => setH(curH, false));

/* =====================================================================
   지도 (카카오맵)
   ===================================================================== */
function loadKakao(key) {
  return new Promise((ok, no) => {
    if (!key) return no(new Error("KAKAO_JS_KEY 가 비어 있어요. .env 에 카카오 JavaScript 키를 넣어 주세요."));
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onload = () => kakao.maps.load(ok);
    s.onerror = () => no(new Error("카카오맵을 불러오지 못했어요. 키·사이트 도메인 등록·인터넷을 확인해 주세요."));
    document.head.appendChild(s);
  });
}
function markerEl(c, mode) {            // mode: dot(후보 아님) / pin(후보 번호) / sel(선택)
  const d = document.createElement("div");
  d.className = "mk";
  d.innerHTML = mode === "dot" ? '<div class="dot" style="left:-7px;top:-7px"></div>'
    : mode === "sel" ? `<div class="pin sel" style="left:-17px;top:-34px"><span>${c.rank || ""}</span></div>`
    : `<div class="pin" style="left:-15px;top:-15px">${c.rank || ""}</div>`;
  d.addEventListener("click", ev => { ev.stopPropagation(); selectCafe(c.id); });
  return d;
}
function drawMarkers() {
  if (!map) return;
  overlays.forEach(o => o.setMap(null)); overlays = [];
  const ranked = new Map(S.results.map(r => [r.id, r]));
  const add = (c, mode) => {
    if (c.lat == null || c.lng == null) return;
    overlays.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(c.lat, c.lng), content: markerEl(c, mode), yAnchor: 0, zIndex: mode === "dot" ? 1 : 3 }));
  };
  for (const c of S.all) {
    if (ranked.has(c.id)) continue;
    add(c, "dot");
  }
  for (const r of S.results) add(r, S.selected === r.id ? "sel" : "pin");
  if (S.selected != null && !ranked.has(S.selected)) { const c = S.all.find(x => x.id === S.selected); if (c) add(c, "sel"); }
}
function fitResults() {
  if (!map) return;
  const pts = S.results.filter(r => r.lat != null);
  if (!pts.length) return;
  const b = new kakao.maps.LatLngBounds();
  pts.forEach(p => b.extend(new kakao.maps.LatLng(p.lat, p.lng)));
  map.setBounds(b, 70, 40, Math.round(SN.mid) + 20, 40);
}
function focusOn(c) {
  if (!map || c.lat == null) return;
  map.setCenter(new kakao.maps.LatLng(c.lat, c.lng));
  map.panBy(0, Math.round(curH * 0.4));    // 핀이 시트에 가리지 않게 위로
}
function resetMap() {
  if (!map) return;
  map.setLevel(STATION.level);
  map.setCenter(new kakao.maps.LatLng(STATION.lat, STATION.lng));
}

/* =====================================================================
   동작
   ===================================================================== */
function goHome() {                    // 처음 화면으로 (검색 결과·선택·입력 모두 비움)
  S.token++;
  S.results = []; S.understood = []; S.notice = ""; S.query = ""; S.selected = null;
  qEl.value = "";
  drawMarkers(); resetMap();
  render("home", V.home());
  snapTo("home");
}
function showList() {
  S.selected = null;
  drawMarkers();
  render("results", V.results());
  snapTo("mid");
  fitResults();
}
function selectCafe(id) {
  const c = S.results.find(r => r.id === id) || S.all.find(r => r.id === id);
  if (!c) return;
  S.selected = id;
  drawMarkers();
  render("detail", V.detail(c));
  snapTo("detail");
  setTimeout(() => focusOn(c), 320);
}
function back() { S.results.length ? showList() : goHome(); }

async function search(q) {
  q = (q || "").trim();
  if (!q) return;
  const my = ++S.token;
  S.query = q; S.selected = null;
  qEl.blur();
  render("loading", V.loading(q));
  snapTo("mid");
  try {
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json().catch(() => ({}));
    if (my !== S.token) return;                         // 그 사이 처음으로/다른 검색을 눌렀으면 무시
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    S.results = j.results || []; S.understood = j.understood || []; S.notice = j.notice || "";
    if (!S.results.length) { S.selected = null; drawMarkers(); render("error", V.error(S.notice || "조건에 맞는 카페를 찾지 못했어요. 다르게 물어봐 주세요.")); return; }
    showList();
  } catch (e) {
    if (my !== S.token) return;
    S.results = []; drawMarkers();
    render("error", V.error(e.message || "검색에 실패했어요. 잠시 후 다시 시도해 주세요."));
  }
}

/* ---------- 정보 수정 ---------- */
const FB = { field: "", value: "", url: "", err: "" };
function openFeedback() {
  const c = S.all.find(x => x.id === S.selected) || S.results.find(x => x.id === S.selected);
  if (!c) return;
  Object.assign(FB, { field: "", value: "", url: "", err: "" });
  render("feedback", V.feedback(c, FB));
  snapTo("full");
}
async function sendFeedback() {
  const err = $("#fbErr"), btn = $("#fbSend");
  FB.value = $("#fbValue").value.trim(); FB.url = $("#fbUrl").value.trim();
  if (!FB.field) { err.textContent = "어떤 정보인지 골라 주세요."; return; }
  if (!FB.value) { err.textContent = "어떻게 다른지 적어 주세요."; return; }
  btn.disabled = true; err.textContent = "";
  try {
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cafe_id: S.selected, field: FB.field, value: FB.value, url: FB.url }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    const c = S.all.find(x => x.id === S.selected) || S.results.find(x => x.id === S.selected);
    render("feedback-done", V.feedbackDone(c));
  } catch (e) {
    btn.disabled = false; err.textContent = e.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}
function backToDetail() { if (S.selected != null) selectCafe(S.selected); else goHome(); }

/* ---------- 이벤트 (위임) ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  const card = t.closest(".card[data-id]");
  if (card) return selectCafe(+card.dataset.id);
  const chip = t.closest("[data-chip]");
  if (chip) { const ex = EXAMPLES[+chip.dataset.chip]; qEl.value = ex.q; return search(ex.q); }
  if (t.closest("[data-home]")) return goHome();
  if (t.closest("[data-back]")) return back();
  if (t.closest("[data-feedback]")) return openFeedback();
  if (t.closest("[data-fb-back]")) return backToDetail();
  if (t.closest("[data-sources]")) { S.lastView = { name: S.view, html: body.innerHTML, h: curH, sel: S.selected }; render("sources", V.sources()); return snapTo("full"); }
  if (t.closest("[data-src-back]")) {
    const l = S.lastView;
    if (l && typeof l === "object") { render(l.name, l.html); setH(l.h); }
    else goHome();
    return;
  }
  const f = t.closest("[data-field]");
  if (f) { FB.field = f.dataset.field; document.querySelectorAll("#fbField button").forEach(b => b.classList.toggle("on", b === f)); return; }
  if (t.closest("#fbSend")) return sendFeedback();
});
form.addEventListener("submit", e => { e.preventDefault(); search(qEl.value); });

/* ---------- 시작 ---------- */
(async function init() {
  render("home", V.home());
  setH(SN.home, false);
  try {
    const [cfg, cafes] = await Promise.all([fetch("/api/config").then(r => r.json()), fetch("/api/cafes").then(r => r.json())]);
    S.all = cafes.cafes || [];
    await loadKakao(cfg.kakaoKey);
    map = new kakao.maps.Map($("#map"), { center: new kakao.maps.LatLng(STATION.lat, STATION.lng), level: STATION.level });
    drawMarkers();
  } catch (e) {
    $("#map").innerHTML = `<div class="empty" style="padding-top:60px;text-align:center">${esc(e.message)}</div>`;
  }
})();
