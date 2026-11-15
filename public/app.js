/* =====================================================================
   안암 카페 챗 — 화면 로직
   ★ 디자인이 바뀌면
     · 색·글자·간격·모양 → styles.css 맨 위 :root 값
     · 문구·예시·출처·하단 메뉴 → 바로 아래 "설정"
     · 화면 구조(HTML) → V.* 함수 (화면 1개 = 함수 1개)
   화면 이름: home(기본) · chat(검색 Tip) · loading/results/error/peek(지도+시트) · detail · feedback · feedback-done · sources · history
   ===================================================================== */

/* ---------- 설정 ---------- */
const STATION = { lat: 37.5861, lng: 127.0292, level: 4 };   // 안암역 (지도 시작 위치)
const TEXT = {
  addrPlaceholder: "성북구 안암동 5가",
  footLine: "정보 출처: 카카오맵 · 방문 리뷰(영수증·블로그) · 건축물대장",
  footMore: "자세히",
  contact: "",                       // 문의 연락처가 있으면 적으세요 (출처 안내 화면 맨 아래)
};
const DATA_UPDATED = "2026-11-14";   // ★ 데이터 마지막 업데이트 날짜
const PLACEHOLDER = {                // 표지판 입력창 안내 문구 [굵은 글씨, 연한 예시]
  home:    ["어디로 갈까요?", "ex. 밥 먹고 갈 분위기 좋은 카페 추천해줘"],
  chat:    ["어디로 갈까요?", "ex. 안암에서 늦게까지 작업할만한 곳"],
  results: ["다시 물어보기", "ex. 콘센트 많은 조용한 카페"],
  detail:  ["이 카페에 대해", "ex. 여기 말차라떼도 팔아?"],
};
const EXAMPLES = [                   // 기록이 없을 때 홈에 나오는 추천 키워드
  "지금 영업 중인 카페", "콘센트 많고 작업하기 좋은 카페", "디저트 맛있는 카페", "조용한 카페", "단체로 가기 좋은 넓은 카페",
];
const TIP_POOL = ["지금 영업 중", "콘센트", "디저트", "조용한", "늦게까지", "단체", "작업하기 좋은"];   // 검색 Tip 추천에 쓰는 조건
const FIELDS = [                     // 정보 수정 항목 — key 는 서버(cafe_core.FEEDBACK_FIELDS)와 같아야 해요
  { key: "hours",   label: "영업시간" },
  { key: "seating", label: "좌석·콘센트" },
  { key: "menu",    label: "메뉴" },
  { key: "mood",    label: "분위기·소음" },
  { key: "closed",  label: "폐업·이전" },
  { key: "photo",   label: "사진" },
  { key: "etc",     label: "기타" },
];
const SOURCES = [                    // 데이터·출처 안내 화면
  ["위치·주소", "카카오맵(카카오 로컬 API)에서 가져왔어요."],
  ["영업시간·좌석·메뉴·분위기", "영수증 리뷰와 블로그 리뷰에서 추출해 팀이 직접 수집·정리했어요. 실제와 다를 수 있어요."],
  ["좌석 규모", "건축물대장의 면적으로 추정한 값이라 참고용이에요."],
  ["신뢰도 A·B·C", "근거가 된 리뷰의 수와 일치 정도에 따른 등급이에요. A가 가장 믿을 만해요."],
  ["AI 해석", "질문을 검색 조건으로 바꾸고 카페에 대한 질문에 답하는 데만 AI(Gemini)를 써요. 카페 정보는 정리된 데이터에서만 가져오고, 없는 내용은 '확인되지 않았어요'라고 답해요."],
  ["사진", "사진 아래에 출처를 표시해요. 사진의 저작권은 원 저작자에게 있어요."],
  ["정보 수정", "틀린 정보는 카페 상세의 '정보가 달라요'로 알려 주세요. 확인 후 반영해요."],
  ["내 기록", "로그인하지 않으면 최근 대화와 추천은 이 기기(브라우저)에만 저장돼요. Google로 로그인하면 저장한 카페와 검색어가 내 계정에 보관돼요(본인만 볼 수 있어요)."],
];
const NAV = [                        // 하단 둥근 메뉴 (아이콘은 ICON 참고) — act: 눌렀을 때 동작
  { id: "home",    icon: "home",  label: "홈" },
  { id: "chat",    icon: "chat",  label: "물어보기" },
  { id: "saved",   icon: "heart", label: "저장" },
  { id: "history", icon: "clock", label: "최근 대화" },
  { id: "info",    icon: "info",  label: "정보 출처" },
];

/* ---------- 아이콘 (선 아이콘) ---------- */
const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  seat:  '<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M4 11h16v4H4zM6 15v4M18 15v4"/>',
  cup:   '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  mood:  '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="m4 17 5-4 3 2.5 3-3 5 4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  home:  '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  chat:  '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  info:  '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  locate:'<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`;

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const safeUrl = u => (/^https?:\/\//i.test(u || "") || /^\//.test(u || "")) ? u : "";
const store = {
  get(k, d) { try { const v = localStorage.getItem("anam." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("anam." + k, JSON.stringify(v)); } catch (e) {} },
};

const app = $("#app"), sheet = $("#sheet"), body = $("#body"), page = $("#page"), pbody = $("#pbody"),
  sign = $("#sign"), qEl = $("#q"), phEl = $("#ph"), navEl = $("#nav"), toastEl = $("#toast");

/* ---------- 상태 ---------- */
const S = { all: [], results: [], understood: [], notice: "", query: "", selected: null, token: 0, here: null,
  cur: { view: "home" }, stack: [], qa: {}, hist: store.get("hist", []) };
let map = null, overlays = [], hereOverlay = null;

/* ---------- 회원 (Supabase Auth · Google 로그인) ----------
   키가 없으면(A.sb 없음) 로그인 기능은 숨기고 예전처럼 동작해요. 회원별 데이터는 RLS 로 본인 것만 읽고 써요:
   user_profile(로그인 시 자동 생성) · user_favorite(저장한 카페) · user_search_log(검색 기록) */
const A = { sb: null, user: null, favs: new Set() };
const welcome = $("#welcome");
const cafeKey = c => c && c.src_id;                       // Supabase cafe.id (공공 매장 ID)
const userName = () => (A.user && ((A.user.user_metadata && (A.user.user_metadata.full_name || A.user.user_metadata.name)) || A.user.email)) || "";
const acctHtml = () => !A.sb ? "" : A.user
  ? `<div class="acct"><span><b>${esc(userName())}</b> 님</span><button class="link gray" data-logout>로그아웃</button></div>`
  : `<div class="acct"><span>로그인하지 않았어요</span><button class="link" data-login>로그인</button></div>`;
async function loadFavs() {
  A.favs = new Set();
  if (!A.user) return;
  const { data } = await A.sb.from("user_favorite").select("cafe_id");
  (data || []).forEach(r => A.favs.add(r.cafe_id));
}
async function setUser(u) {
  A.user = u || null;
  if (A.user) welcome.hidden = true;
  await loadFavs();
  if (["home", "saved", "detail"].includes(S.cur.view)) draw();
}
async function googleLogin() {
  const { error } = await A.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) $("#wErr").textContent = "로그인을 시작하지 못했어요: " + error.message;
}
async function toggleFav() {
  const c = cafeById(S.selected);
  if (!A.user) { welcome.hidden = false; return; }
  const k = cafeKey(c); if (!k) return;
  const on = A.favs.has(k);
  const { error } = on ? await A.sb.from("user_favorite").delete().eq("cafe_id", k) : await A.sb.from("user_favorite").insert({ cafe_id: k });
  if (error) return toast("저장하지 못했어요");
  on ? A.favs.delete(k) : A.favs.add(k);
  const b = $("[data-fav]"); if (b) { b.classList.toggle("on", !on); b.setAttribute("aria-pressed", String(!on)); }
  toast(on ? "저장을 해제했어요" : "저장했어요");
}
function logSearch(q) {
  if (!A.user) return;
  A.sb.from("user_search_log").insert({ query: q.slice(0, 200) }).then(({ error }) => { if (error) console.warn("검색 기록 저장 실패:", error.message); });
}

/* ---------- 기록·취향 (이 기기에만 저장) ---------- */
function pushHist(q, und) {
  S.hist = [{ q, und: und || [], t: Date.now() }, ...S.hist.filter(h => h.q !== q)].slice(0, 30);
  store.set("hist", S.hist);
}
function prefs() {                      // 자주 쓴 조건 순서
  const n = {};
  S.hist.forEach(h => (h.und || []).forEach(u => { n[u] = (n[u] || 0) + 1; }));
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function tips() {
  const out = [], top = prefs()[0];
  if (top) {
    const add = TIP_POOL.find(t => !top.includes(t) && !t.includes(top)) || TIP_POOL[0];
    out.push({ pre: "자주 찾는 ", em: top, post: `에 '${add}'을 더해 보세요`, ex: `${top} ${add} 카페` });
  }
  out.push({ pre: "조건을 함께 말하면 정확해요 · ", em: "콘센트 많고 조용한 카페", post: "", ex: "콘센트 많고 조용한 카페" });
  out.push({ pre: "언제 갈지 알려 주면 영업 중인 곳만 골라요 · ", em: "지금 영업 중인 디저트 카페", post: "", ex: "지금 영업 중인 디저트 카페" });
  out.push({ pre: "메뉴 이름도 좋아요 · ", em: "티라미수 있는 카페", post: "", ex: "티라미수 있는 카페" });
  return out.slice(0, 4);
}
function recommend() {                  // 사진 있는 카페를 취향에 맞춰 (취향이 없으면 날짜별로 섞어서)
  const keys = prefs().slice(0, 3).flatMap(p => p.split(/\s+/)).filter(w => w.length >= 2);
  const day = new Date().toDateString();
  const h = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  return S.all.filter(c => (c.photos || []).length).map(c => {
    const text = Object.values(c.summary || {}).join(" ");
    return { c, s: keys.reduce((a, k) => a + (text.includes(k) ? 1 : 0), 0) * 1000 + (h(day + c.id) % 997) };
  }).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.c);
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("on"), 1800); }

/* =====================================================================
   화면들 — 각 함수는 HTML 문자열을 돌려줘요. (data-screen = 화면 이름)
   ===================================================================== */
const V = {
  /* 홈 (지도 위 시트): 주소 검색 · 최근 대화 · 추천 카드 */
  home: () => {
    const rec = S.hist.slice(0, 6).map(h => h.q), has = rec.length > 0;
    const photos = recommend();
    return `<div data-screen="home">
      <form class="addr-search" id="addrForm" role="search">${ico("search")}<input id="addr" type="search" enterkeyhint="search" placeholder="${esc(TEXT.addrPlaceholder)}" aria-label="주소 검색"></form>
      <div class="sec"><b>${has ? "최근 대화" : "이런 건 어때요"}</b>${has ? '<button class="link" data-history>전체보기</button>' : ""}</div>
      <div class="rchips">${(has ? rec : EXAMPLES).map(q => `<button class="rchip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      ${photos.length ? `<div class="sec"><b>${has ? "취향에 맞는 카페" : "오늘의 카페"}</b></div>
      <div class="swipe">${photos.map(V.rcard).join("")}</div>` : ""}
      <div class="sheetfoot"><span>${esc(TEXT.footLine)}</span><button type="button" data-sources>${esc(TEXT.footMore)}</button></div>
    </div>`;
  },
  rcard: c => {
    const p = c.photos[0];
    return `<div class="rcard" data-open="${c.id}">
      <img src="${esc(safeUrl(p.url))}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="shade"></div>
      <span class="src">${p.source ? "사진 출처: " + esc(host(p.source)) : esc(p.credit)}</span>
      <div class="cap"><b>${esc(c.name)}</b><span>${[c.open_now === true ? "영업 중" : c.open_now === false ? "영업 종료" : "", (c.summary || {}).atmosphere || (c.summary || {}).hours || ""].filter(Boolean).map(esc).join(" · ")}</span></div>
    </div>`;
  },

  /* 채팅: 검색 Tip (표지판이 아래로 내려온 상태) */
  chat: () => `<div class="page" data-screen="chat">
    <div class="toprow"><button class="back" data-home>← 처음으로</button></div>
    <div class="tipbox">
      <h2>검색 Tip.</h2><p class="sub">이렇게 물어보면 더 정확해요</p>
      <ul class="tips">${tips().map((t, i) => `<li><button type="button" data-tip="${i}">${esc(t.pre)}<em>${esc(t.em)}</em>${esc(t.post)}</button></li>`).join("")}</ul>
    </div>
  </div>`,

  /* 검색 중 */
  loading: q => `<div data-screen="loading">
    <div class="rhead"><div class="rtitle"><b>“<span class="q">${esc(q)}</span>” 찾는 중…</b></div></div>
    <div class="cards"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
  </div>`,

  /* 결과 목록 */
  results: () => `<div data-screen="results">
    <div class="rhead">
      <div class="rtitle"><b>“<span class="q">${esc(S.query)}</span>”</b><button class="link gray" data-home>처음으로</button></div>
      ${S.understood.length ? `<div class="und">이렇게 이해했어요 ${S.understood.map(u => `<span class="c">${esc(u)}</span>`).join("")}</div>` : ""}
      ${S.notice ? `<span class="notice">${esc(S.notice)}</span>` : ""}
    </div>
    <ol class="cards">${S.results.map(V.card).join("")}</ol>
    <div class="sheetfoot"><span>${esc(TEXT.footLine)}</span><button type="button" data-sources>${esc(TEXT.footMore)}</button></div>
  </div>`,
  card: c => {
    const chips = (c.matched || []).slice(0, 3);
    const reason = c.reason && c.reason !== chips.join(" · ") && c.reason !== chips.join(", ") ? c.reason : "";
    const ph = (c.photos || [])[0];
    return `<li class="card" data-open="${c.id}">
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

  /* 결과 없음 / 오류 */
  error: msg => `<div data-screen="error">
    <div class="rhead"><div class="rtitle"><b>검색 결과</b><button class="link gray" data-home>처음으로</button></div></div>
    <div class="empty">${esc(msg)}</div>
  </div>`,

  /* 지도에서 선택한 카페 미리보기 (시트 아래쪽에 작게) */
  peek: id => {
    const c = cafeById(id); if (!c) return "";
    const q = encodeURIComponent(c.name);
    const nav = c.lat != null ? `https://map.kakao.com/link/to/${q},${c.lat},${c.lng}` : `https://map.kakao.com/link/search/${q}`;
    return `<div class="peek" data-screen="peek">
      <div class="cname">${esc(c.name)} ${V.badge(c)}</div>
      <div class="meta">${c.summary && c.summary.hours ? `<span>${esc(c.summary.hours)}</span>` : ""}</div>
      <div class="btns"><button class="go blue" data-open="${c.id}">상세 보기</button><a class="btn2" href="${esc(nav)}" target="_blank" rel="noopener">길찾기</a></div>
      <div style="text-align:center;margin-top:10px"><button class="link gray" data-back>${S.results.length ? "← 후보 목록" : "← 처음으로"}</button></div>
    </div>`;
  },

  /* 카페 상세: 이름 / 간단한 정보 / 사진(옆으로 스와이프) */
  detail: id => {
    const c = cafeById(id); if (!c) return V.error("카페를 찾을 수 없어요");
    const s = c.summary || {}, n = c.notes || {};
    const row = (icon, label, v) => `<div class="row">${ico(icon)}<b>${label}</b><span class="${v ? "" : "none"}">${esc(v || "정보 없음")}</span></div>`;
    const more = [["영업시간", n.hours], ["좌석", n.seating]].filter(x => x[1]);
    const q = encodeURIComponent(c.name);
    const nav = c.lat != null ? `https://map.kakao.com/link/to/${q},${c.lat},${c.lng}` : `https://map.kakao.com/link/search/${q}`;
    return `<div class="page detail" data-screen="detail">
      <div class="toprow"><button class="back" data-back>${S.results.length ? "← 후보 목록" : "← 뒤로"}</button><button class="link" data-showmap>지도에서 보기</button></div>
      <div class="dname"><div class="dtxt"><h2>${esc(c.name)} ${V.badge(c)}</h2>${c.address ? `<p class="addr">${esc(c.address)}</p>` : ""}</div>${A.sb ? V.heart(c) : ""}</div>
      <div class="info">
        ${n.mood ? `<p class="summary">${esc(n.mood.length > 110 ? n.mood.slice(0, 108) + "…" : n.mood)}</p>` : ""}
        <div class="rows">${row("clock", "시간", s.hours)}${row("seat", "좌석", s.seating)}${row("cup", "메뉴", s.menu)}${row("mood", "분위기", s.atmosphere)}</div>
        ${more.length ? `<details class="more"><summary>자세히</summary>${more.map(m => `<p><b>${m[0]}</b> ${esc(m[1])}</p>`).join("")}</details>` : ""}
        ${c.basis ? `<div class="basis">근거: ${esc(c.basis)}</div>` : ""}
      </div>
      ${V.photos(c)}
      <div class="qa" id="qa">${V.qa(c.id)}</div>
      <div class="actions">
        <a class="go blue" href="${esc(nav)}" target="_blank" rel="noopener">카카오맵에서 길찾기</a>
        <button class="btn2" data-feedback>정보가 달라요</button>
      </div>
      <div class="foot"><span>${esc(TEXT.footLine)}</span><button type="button" data-sources>${esc(TEXT.footMore)}</button></div>
    </div>`;
  },
  heart: c => `<button class="heart${A.favs.has(cafeKey(c)) ? " on" : ""}" data-fav aria-label="저장" aria-pressed="${A.favs.has(cafeKey(c))}">${ico("heart", "")}</button>`,
  photos: c => {
    const ps = c.photos || [];
    if (!ps.length) return `<div class="photos"><figure class="photo"><div class="ph empty">${ico("photo")}사진 준비 중</div></figure></div>`;
    return `<div class="photos" id="photos">${ps.map(p => {
      const cap = p.source ? `출처: <a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(host(p.source) || "원문")} ↗</a>` : esc(p.credit || "");
      return `<figure class="photo"><div class="ph"><img src="${esc(safeUrl(p.url))}" alt="${esc(c.name)} 사진" loading="lazy" referrerpolicy="no-referrer"></div><figcaption>${cap}</figcaption></figure>`;
    }).join("")}</div>${ps.length > 1 ? `<div class="dots" id="dots">${ps.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}`;
  },
  qa: id => {
    const l = S.qa[id] || [];
    return l.length ? `<h3>이 카페에 물어본 내용</h3>` + l.map(x => `<div class="bubble q">${esc(x.q)}</div><div class="bubble a${x.a == null ? " wait" : ""}">${x.a == null ? "찾는 중…" : esc(x.a)}</div>`).join("") : "";
  },

  /* 정보 수정 제안 */
  feedback: st => {
    const c = cafeById(S.selected);
    return `<div class="page" data-screen="feedback">
      <div class="toprow"><button class="back" data-back>← 돌아가기</button></div>
      <h2 class="pagetitle">${esc(c ? c.name : "")}</h2>
      <p class="lead">틀린 정보를 알려 주시면 확인 후 고칠게요.</p>
      <div class="seg" id="fbField">${FIELDS.map(f => `<button type="button" data-field="${f.key}" class="${st.field === f.key ? "on" : ""}">${f.label}</button>`).join("")}</div>
      <label class="field2">어떻게 달라요?<textarea id="fbValue" maxlength="500" placeholder="예: 일요일은 12시에 열어요">${esc(st.value || "")}</textarea></label>
      <label class="field2">참고 링크 (선택)<input id="fbUrl" type="url" inputmode="url" placeholder="https://" value="${esc(st.url || "")}"></label>
      <p class="err" id="fbErr">${esc(st.err || "")}</p>
      <button class="go blue" id="fbSend">보내기</button>
      <p class="fine">보낸 내용은 확인 후 반영돼요. 개인정보는 적지 마세요.</p>
    </div>`;
  },
  "feedback-done": () => `<div class="page" data-screen="feedback-done">
    <div class="done">${ico("check")}<h2 class="pagetitle" style="margin-top:10px">알려 주셔서 고마워요</h2><p class="lead">확인 후 반영할게요.</p></div>
    <div class="actions"><button class="go blue" data-back>카페로 돌아가기</button><button class="btn2" data-home>처음으로</button></div>
  </div>`,

  /* 데이터·정보 출처 안내 */
  sources: () => `<div class="page" data-screen="sources">
    <div class="toprow"><button class="back" data-back>← 돌아가기</button></div>
    <h2 class="pagetitle">데이터·정보 출처</h2>
    <div class="src">${SOURCES.map(s => `<div><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p></div>`).join("")}</div>
    <p class="fine">마지막 업데이트 ${esc(DATA_UPDATED)}${TEXT.contact ? ` · 문의 ${esc(TEXT.contact)}` : ""}</p>
  </div>`,

  /* 저장한 카페 (로그인 필요) */
  saved: () => {
    const list = S.all.filter(c => A.favs.has(cafeKey(c)));
    return `<div class="page" data-screen="saved">
      <div class="toprow"><button class="back" data-back>← 돌아가기</button></div>
      <h2 class="pagetitle">저장한 카페</h2>
      ${acctHtml()}
      ${!A.sb ? '<p class="lead">로그인 기능을 쓸 수 없는 환경이에요.</p>'
        : !A.user ? '<p class="lead">로그인하면 마음에 든 카페를 저장해 둘 수 있어요.</p><button class="go blue" data-login>Google로 로그인</button>'
        : list.length ? `<ol class="cards">${list.map(V.card).join("")}</ol>`
        : '<p class="lead">아직 저장한 카페가 없어요. 카페 상세에서 ♡ 저장하기를 눌러 보세요.</p>'}
    </div>`;
  },

  /* 최근 대화 전체보기 */
  history: () => `<div class="page" data-screen="history">
    <div class="toprow"><button class="back" data-back>← 돌아가기</button>${S.hist.length ? '<button class="link gray" data-clear>기록 지우기</button>' : ""}</div>
    <h2 class="pagetitle">최근 대화</h2>
    ${S.hist.length ? `<ul class="hist">${S.hist.map(h => `<li><button data-q="${esc(h.q)}">${esc(h.q)}<small>${ago(h.t)}${h.und && h.und.length ? " · " + h.und.map(esc).join(" · ") : ""}</small></button></li>`).join("")}</ul>`
      : '<p class="lead">아직 대화 기록이 없어요. 아래 표지판에 물어보세요.</p>'}
  </div>`,
};
const MODE = { home: "home", loading: "map", results: "map", error: "map", peek: "map", chat: "page", detail: "page", history: "page", saved: "page",
  feedback: "plain", "feedback-done": "plain", sources: "plain" };
const cafeById = id => S.results.find(r => r.id === id) || S.all.find(r => r.id === id);

/* ---------- 화면 그리기 / 이동 ---------- */
function setPh() {
  const v = S.cur.view, key = v === "home" ? "home" : v === "chat" ? "chat" : v === "detail" ? "detail" : "results";
  const [b, t] = PLACEHOLDER[key];
  phEl.innerHTML = `<b>${esc(b)}</b><span>${esc(t)}</span>`;
  sign.classList.toggle("has-value", !!qEl.value);
}
function draw() {
  const { view, arg } = S.cur, mode = MODE[view];
  app.dataset.mode = mode;
  const inPage = mode === "page" || mode === "plain";
  page.hidden = !inPage;
  const html = V[view](arg);
  if (inPage) { pbody.innerHTML = html; pbody.scrollTop = 0; } else { body.innerHTML = html; body.scrollTop = 0; sheet.dataset.view = view; }
  qEl.readOnly = view === "home";
  setPh();
  placeLocate();
  ensureSentinel();
}
function go(view, arg) {                // 새 화면으로 (뒤로 가기용으로 지금 화면을 쌓아 둠)
  S.stack.push(S.cur);
  S.cur = { view, arg };
  draw();
}
function back() {
  const p = S.stack.pop();
  if (!p) return goHome();
  S.cur = p;
  if (p.view === "home" || p.view === "results") { S.selected = null; drawMarkers(); }
  draw();
  if (p.view === "home") snapTo("home"); else if (p.view === "results") { snapTo("mid"); } else if (p.view === "peek") snapTo("peek");
  if (p.view === "results" || p.view === "home") { qEl.value = p.view === "results" ? S.query : ""; setPh(); }
}
/* 폰의 뒤로 가기(제스처·버튼)로도 한 단계씩 돌아가게 해요 */
let sentinel = false;
function ensureSentinel() { if (!sentinel && S.cur.view !== "home") { try { history.pushState({ a: 1 }, ""); sentinel = true; } catch (e) {} } }
window.addEventListener("popstate", () => {
  sentinel = false;
  if (S.cur.view !== "home") { back(); ensureSentinel(); }
});

function goHome() {                     // 처음 화면 (검색 결과·선택·입력 모두 비움)
  S.token++;
  Object.assign(S, { results: [], understood: [], notice: "", query: "", selected: null, here: null, stack: [], cur: { view: "home" } });
  qEl.value = ""; qEl.blur();
  drawMarkers(); resetMap();
  draw(); snapTo("home");
}
function openChat() {                   // 표지판을 눌렀을 때: 표지판이 아래로 내려오고 키보드가 올라와요
  if (S.cur.view !== "home") return;
  go("chat");
  qEl.value = ""; setPh();
  qEl.focus();
}
function showResults(fit) {
  S.selected = null;
  S.cur = { view: "results" };
  drawMarkers(); draw(); snapTo("mid");
  qEl.value = S.query; setPh();
  if (fit) fitResults();
}
function openDetail(id) {
  S.selected = id; drawMarkers();
  qEl.value = ""; qEl.blur();
  go("detail", id);
}
function openPeek(id) {                 // 지도에서 핀을 눌렀을 때
  const c = cafeById(id); if (!c) return;
  S.selected = id; drawMarkers();
  if (S.cur.view === "peek") S.cur = { view: "peek", arg: id }; else { S.stack.push(S.cur); S.cur = { view: "peek", arg: id }; }
  qEl.value = ""; draw(); snapTo("peek");
  setTimeout(() => focusOn(c), 320);
}
function showOnMap() {                  // 상세 → 지도에서 보기
  const id = S.selected, c = cafeById(id); if (!c) return;
  S.cur = { view: "peek", arg: id };
  draw(); snapTo("peek"); setTimeout(() => focusOn(c), 320);
}

/* =====================================================================
   바텀시트 높이·드래그
   ===================================================================== */
const H = () => app.clientHeight || window.innerHeight;
const SN = {
  get peek() { return 320; },
  get home() { return Math.round(Math.min(H() * 0.44, 420)); },
  get mid() { return Math.round(H() * 0.56); },
  get full() { return Math.round(H() - 64); },
};
let curH = 0;
function allowed() { const v = S.cur.view; return v === "home" ? ["home", "full"] : v === "peek" ? ["peek", "mid"] : ["peek", "mid", "full"]; }
function setH(h, animate = true) {
  curH = Math.max(SN.peek - 60, Math.min(SN.full, h));
  sheet.classList.toggle("dragging", !animate);
  sheet.style.height = curH + "px";
  placeLocate();
}
function snapTo(k) { app.dataset.snap = k; setH(SN[k]); }
function nearest(h) { return allowed().map(k => [k, SN[k]]).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]; }
(function drag() {
  let startY = 0, startH = 0, moved = false, on = false;
  sheet.addEventListener("pointerdown", e => {
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
  const end = () => {
    if (!on) return; on = false;
    sheet.classList.remove("dragging");
    if (!moved) { const a = allowed(); return snapTo(curH >= SN[a[a.length - 1]] - 20 ? a[0] : a[a.length - 1]); }
    snapTo(nearest(curH));
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
})();

/* 키보드가 올라오면 화면 높이를 줄여서 표지판이 키보드 위에 붙게 해요 */
function fitViewport() {
  const vv = window.visualViewport;
  app.style.setProperty("--vvh", (vv ? vv.height : window.innerHeight) + "px");
  if (vv && vv.offsetTop) window.scrollTo(0, 0);
  setH(curH, false);
}
if (window.visualViewport) { visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); }
window.addEventListener("resize", fitViewport);

/* 내 위치 버튼 */
const locBtn = document.createElement("button");
locBtn.className = "locate"; locBtn.setAttribute("aria-label", "내 위치"); locBtn.innerHTML = ico("locate", "");
app.appendChild(locBtn);
function placeLocate() { locBtn.style.bottom = (curH + 14) + "px"; }
locBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return toast("이 기기에서는 위치를 쓸 수 없어요");
  navigator.geolocation.getCurrentPosition(p => {
    S.here = { lat: p.coords.latitude, lng: p.coords.longitude }; drawMarkers();
    if (map) { map.setCenter(new kakao.maps.LatLng(S.here.lat, S.here.lng)); map.setLevel(4); }
  }, () => toast("위치 권한을 허용해 주세요"), { enableHighAccuracy: true, timeout: 8000 });
});

/* =====================================================================
   지도 (카카오맵)
   ===================================================================== */
function loadKakao(key) {
  return new Promise((ok, no) => {
    if (!key) return no(new Error("KAKAO_JS_KEY 가 비어 있어요. .env 에 카카오 JavaScript 키를 넣어 주세요."));
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    s.onload = () => kakao.maps.load(ok);
    s.onerror = () => no(new Error("카카오맵을 불러오지 못했어요. 키·사이트 도메인 등록·인터넷을 확인해 주세요."));
    document.head.appendChild(s);
  });
}
function markerEl(c, mode) {            // mode: dot(후보 아님) / pin(후보 번호) / sel(선택)
  const d = document.createElement("div");
  d.className = "mk";
  d.innerHTML = mode === "dot" ? '<div class="dot" style="left:-7px;top:-7px"></div>'
    : mode === "sel" ? `<div class="pin sel" style="left:-19px;top:-47px">${c.rank || ""}</div>`
    : `<div class="pin" style="left:-15px;top:-15px">${c.rank || ""}</div>`;
  d.addEventListener("click", ev => { ev.stopPropagation(); openPeek(c.id); });
  return d;
}
function drawMarkers() {
  if (!map) return;
  overlays.forEach(o => o.setMap(null)); overlays = [];
  if (hereOverlay) { hereOverlay.setMap(null); hereOverlay = null; }
  const ranked = new Map(S.results.map(r => [r.id, r]));
  const add = (c, mode) => {
    if (c.lat == null || c.lng == null) return;
    overlays.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(c.lat, c.lng), content: markerEl(c, mode), yAnchor: 0, zIndex: mode === "dot" ? 1 : 3 }));
  };
  for (const c of S.all) if (!ranked.has(c.id) && c.id !== S.selected) add(c, "dot");
  for (const r of S.results) add(r, S.selected === r.id ? "sel" : "pin");
  if (S.selected != null && !ranked.has(S.selected)) { const c = S.all.find(x => x.id === S.selected); if (c) add(c, "sel"); }
  if (S.here) { const e = document.createElement("div"); e.className = "mk"; e.innerHTML = '<div class="here" style="left:-8px;top:-8px"></div>';
    hereOverlay = new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(S.here.lat, S.here.lng), content: e, yAnchor: 0, zIndex: 2 }); }
}
function fitResults() {
  if (!map) return;
  const pts = S.results.filter(r => r.lat != null);
  if (!pts.length) return;
  const b = new kakao.maps.LatLngBounds();
  pts.forEach(p => b.extend(new kakao.maps.LatLng(p.lat, p.lng)));
  if (S.here) b.extend(new kakao.maps.LatLng(S.here.lat, S.here.lng));
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
   동작: 검색 · 주소 검색 · 질문 · 정보 수정
   ===================================================================== */
async function search(q) {
  q = (q || "").trim();
  if (!q) return;
  const my = ++S.token;
  S.query = q; S.selected = null; S.here = null; qEl.blur();
  S.stack = [{ view: "home" }]; S.cur = { view: "loading", arg: q };
  qEl.value = q; draw(); snapTo("mid");
  try {
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json().catch(() => ({}));
    if (my !== S.token) return;                         // 그 사이 처음으로/다른 검색을 눌렀으면 무시
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    S.results = j.results || []; S.understood = j.understood || []; S.notice = j.notice || "";
    if (!S.results.length) { drawMarkers(); S.cur = { view: "error", arg: S.notice || "조건에 맞는 카페를 찾지 못했어요. 다르게 물어봐 주세요." }; draw(); return; }
    pushHist(q, S.understood); logSearch(q);
    showResults(true);
  } catch (e) {
    if (my !== S.token) return;
    S.results = []; drawMarkers();
    S.cur = { view: "error", arg: e.message || "검색에 실패했어요. 잠시 후 다시 시도해 주세요." }; draw();
  }
}

const rad = d => d * Math.PI / 180;
const meters = (a, b, c, d) => { const x = rad(c - a), y = rad(d - b), h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
const fmtM = m => m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
function geocode(text) {                // 카카오 주소 → 키워드 순서로 좌표 찾기 (없으면 null)
  return new Promise(ok => {
    const sv = window.kakao && kakao.maps && kakao.maps.services;
    if (!sv) return ok(null);
    const pick = r => r && r[0] ? ok({ lat: +r[0].y, lng: +r[0].x }) : null;
    try {
      new sv.Geocoder().addressSearch(text, (r, st) => {
        if (st === sv.Status.OK && pick(r) !== null) return;
        new sv.Places().keywordSearch(text.includes("안암") || text.includes("성북") ? text : "안암 " + text, (r2, st2) => { if (st2 === sv.Status.OK && r2 && r2[0]) ok({ lat: +r2[0].y, lng: +r2[0].x }); else ok(null); });
      });
    } catch (e) { ok(null); }
  });
}
async function searchAddress(text) {    // 홈 아래 검색창: 주소로 찾기 → 그 주변 카페 5곳
  text = (text || "").trim();
  if (!text) return;
  const my = ++S.token;
  S.query = text; S.selected = null; S.stack = [{ view: "home" }]; S.cur = { view: "loading", arg: text };
  qEl.value = ""; draw(); snapTo("mid");
  const pt = await geocode(text);
  if (my !== S.token) return;
  let list = [];
  if (pt) {
    S.here = pt;
    list = S.all.filter(c => c.lat != null).map(c => ({ ...c, _d: meters(pt.lat, pt.lng, c.lat, c.lng) })).sort((a, b) => a._d - b._d).slice(0, 5)
      .map((c, i) => ({ ...c, rank: i + 1, matched: [fmtM(c._d)], reason: "" }));
  } else {                              // 지도 검색을 못 쓰면 우리 카페 주소·이름에서 글자 찾기
    S.here = null;
    list = S.all.filter(c => (c.address + " " + c.name).replace(/\s/g, "").includes(text.replace(/\s/g, ""))).slice(0, 5).map((c, i) => ({ ...c, rank: i + 1, matched: ["주소 일치"], reason: "" }));
  }
  S.results = list; S.understood = [`📍 ${text}`]; S.notice = "";
  if (!list.length) { drawMarkers(); S.cur = { view: "error", arg: "그 주소 근처에서 카페를 찾지 못했어요. 예: 안암로 25, 안암동 5가" }; draw(); return; }
  S.query = `${text} 근처`;
  showResults(true);
}

async function ask(q) {                 // 카페 상세에서 이어서 질문
  const id = S.selected, list = (S.qa[id] = S.qa[id] || []), item = { q, a: null };
  list.push(item); qEl.value = ""; setPh(); renderQA();
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafe_id: id, question: q }) });
    const j = await r.json().catch(() => ({}));
    item.a = r.ok ? j.answer : (j.error || `오류 (${r.status})`);
  } catch (e) { item.a = "답을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요."; }
  renderQA();
}
function renderQA() {
  const el = $("#qa");
  if (!el || S.cur.view !== "detail") return;
  el.innerHTML = V.qa(S.selected);
  const last = el.lastElementChild; if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

const FB = { field: "", value: "", url: "", err: "" };
function openFeedback() {
  Object.assign(FB, { field: "", value: "", url: "", err: "" });
  go("feedback", FB);
}
/* 정보 수정 제보를 DB 에 저장 (로그인 필요). 같은 카페·항목은 내 제보 1건을 덮어써요. 실패해도 제보 자체(서버 전송)는 이미 됐으니 화면은 막지 않아요. */
async function saveReport(f) {
  const k = cafeKey(cafeById(S.selected));
  if (!A.user || !k) return;
  const { error } = await A.sb.from("attr_report").upsert(
    { cafe_id: k, field: f.field, reported_value: f.value || "(내용 없음)", note: f.url || null, user_id: A.user.id },
    { onConflict: "cafe_id,field,user_id" });
  if (error) console.warn("제보 DB 저장 실패:", error.message);
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
    await saveReport(FB);                                // 로그인했으면 내 계정 DB(attr_report)에도 저장
    S.cur = { view: "feedback-done" }; draw();          // 완료 화면에서 '돌아가기'는 상세로 (쌓인 화면 그대로)
  } catch (e) {
    btn.disabled = false; err.textContent = e.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

/* ---------- 이벤트 (위임) ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#sign")) return;                       // 표지판은 아래 전용 처리
  const open = t.closest("[data-open]");
  if (open) return openDetail(+open.dataset.open);
  const q = t.closest("[data-q]");
  if (q) return search(q.dataset.q);
  const tip = t.closest("[data-tip]");
  if (tip) { qEl.value = tips()[+tip.dataset.tip].ex; setPh(); return qEl.focus(); }
  if (t.closest("[data-login]")) { welcome.hidden = false; return; }
  if (t.closest("[data-logout]")) { A.sb.auth.signOut(); return; }
  if (t.closest("[data-fav]")) return toggleFav();
  if (t.closest("[data-home]")) return goHome();
  if (t.closest("[data-back]")) return back();
  if (t.closest("[data-showmap]")) return showOnMap();
  if (t.closest("[data-history]")) return go("history");
  if (t.closest("[data-clear]")) { S.hist = []; store.set("hist", []); return draw(); }
  if (t.closest("[data-feedback]")) return openFeedback();
  if (t.closest("[data-sources]")) return go("sources");
  const f = t.closest("[data-field]");
  if (f) { FB.field = f.dataset.field; document.querySelectorAll("#fbField button").forEach(b => b.classList.toggle("on", b === f)); return; }
  if (t.closest("#fbSend")) return sendFeedback();
  const nv = t.closest("[data-nav]");
  if (nv) {
    const id = nv.dataset.nav;
    if (id === "home") return goHome();
    if (id === "chat") return openChat();
    if (id === "saved") return go("saved");
    if (id === "history") return go("history");
    if (id === "info") return go("sources");
  }
});
document.addEventListener("submit", e => {
  if (e.target.id === "addrForm") { e.preventDefault(); const v = $("#addr").value; $("#addr").blur(); searchAddress(v); }
});
sign.addEventListener("click", e => { if (S.cur.view === "home") { e.preventDefault(); openChat(); } });
sign.addEventListener("submit", e => {
  e.preventDefault();
  const v = qEl.value.trim(), view = S.cur.view;
  if (view === "home") return openChat();
  if (!v) return;
  if (view === "detail") return ask(v);
  search(v);
});
qEl.addEventListener("input", () => sign.classList.toggle("has-value", !!qEl.value));

/* 사진 로드 실패 → 그 사진만 숨김/대체 (캡처 단계에서 이미지 error 를 잡아요) */
document.addEventListener("error", e => {
  const t = e.target;
  if (!t || t.tagName !== "IMG") return;
  const box = t.closest(".thumb, .ph, .rcard");
  if (!box) return;
  box.classList.add("broken");
  if (box.classList.contains("ph")) { t.remove(); box.insertAdjacentHTML("afterbegin", `${ico("photo")}사진을 불러오지 못했어요`); }
}, true);

/* 사진 스와이프 → 아래 점 표시 */
document.addEventListener("scroll", e => {
  const t = e.target;
  if (!t || t.id !== "photos") return;
  const dots = $("#dots"); if (!dots) return;
  const i = Math.round(t.scrollLeft / (t.firstElementChild.offsetWidth + 10));
  [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
}, true);

/* ---------- 시작 ---------- */
navEl.innerHTML = NAV.map(n => `<button type="button" data-nav="${n.id}" aria-label="${esc(n.label)}">${ico(n.icon, "")}</button>`).join("");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
(async function init() {
  fitViewport();
  draw(); setH(SN.home, false); app.dataset.snap = "home";
  try {
    const [cfg, cafes] = await Promise.all([fetch("/api/config").then(r => r.json()), fetch("/api/cafes").then(r => r.json())]);
    S.all = cafes.cafes || [];
    if (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) {
      A.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      A.sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => setUser(session && session.user), 0); });   // 콜백 안에서 바로 DB 호출하면 멈출 수 있어 한 박자 뒤에
      const { data } = await A.sb.auth.getSession();
      await setUser(data.session && data.session.user);
      if (!A.user && !sessionStorage.getItem("guest")) welcome.hidden = false;
      $("#gLogin").addEventListener("click", googleLogin);
      $("#guest").addEventListener("click", () => { sessionStorage.setItem("guest", "1"); welcome.hidden = true; });
    }
    if (S.cur.view === "home") draw();                  // 데이터가 오면 추천 카드를 채워요
    await loadKakao(cfg.kakaoKey);
    map = new kakao.maps.Map($("#map"), { center: new kakao.maps.LatLng(STATION.lat, STATION.lng), level: STATION.level });
    drawMarkers();
  } catch (e) {
    $("#map").innerHTML = `<div class="mapmsg">${esc(e.message)}</div>`;
  }
})();
