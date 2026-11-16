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
const EXAMPLES = [                   // 홈에 항상 나오는 추천 키워드 (최근 대화가 생겨도 유지돼요)
  "분위기 좋은 카페", "지금 영업 중인 카페", "콘센트 많고 작업하기 좋은 카페", "디저트 맛있는 카페", "조용한 카페", "단체로 가기 좋은 넓은 카페",
];
const TIP_POOL = ["지금 영업 중", "콘센트", "디저트", "조용한", "늦게까지", "단체", "작업하기 좋은", "분위기 좋은", "프랜차이즈 말고"];   // 검색 Tip 추천에 쓰는 조건
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
const NAV = [                        // 하단 메뉴 (아이콘은 ICON 참고). 현재 화면의 아이콘은 채워져요
  { id: "home",  icon: "home",     label: "홈" },
  { id: "chat",  icon: "chat",     label: "대화" },
  { id: "swipe", icon: "swipe",    label: "스와이프" },
  { id: "saved", icon: "bookmark", label: "저장됨" },
  { id: "info",  icon: "info",     label: "출처" },
];
const NAV_OF = { home: "home", loading: "home", results: "home", error: "home", peek: "home", history: "chat", swipe: "swipe", saved: "saved", sources: "info" };   // 화면 → 켜질 메뉴
const NAV_HIDDEN = ["chat", "detail", "ask", "feedback", "feedback-done", "taste"];     // 대화 중·장소 상세 등에서는 메뉴를 숨겨요
const SIGN_OFF = ["detail", "history", "swipe", "saved"];                              // 아래 검색 표지판을 숨기는 화면
const ASK_PRESETS = ["영업시간이 어떻게 돼요?", "콘센트 있어요?", "대표 메뉴가 뭐예요?", "분위기가 어때요?"];   // '이 카페에 대해' 물어볼 추천 질문

/* ---------- 아이콘 (선 아이콘) ---------- */
const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path class="cut" d="M12 7.5V12l3 2"/>',
  seat:  '<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M4 11h16v4H4zM6 15v4M18 15v4"/>',
  cup:   '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  mood:  '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="m4 17 5-4 3 2.5 3-3 5 4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  home:  '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  chat:  '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path class="cut" d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  swipe: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path class="cut" d="M9 12h6M13 9l3 3-3 3"/>',
  thumbUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  bookmark: '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  info:  '<circle cx="12" cy="12" r="9"/><path class="cut" d="M12 11v5M12 8v.5"/>',
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
const S = { all: [], results: [], understood: [], notice: "", guide: "", suggest: [], votes: store.get("votes", {}), query: "", selected: null, token: 0, here: null, sort: null,   // sort: 결과가 실제로 어떤 정렬인지(서버가 알려줌). 주소 검색은 null
  cur: { view: "home" }, stack: [], qa: store.get("qa", {}), hist: store.get("hist", []), rooms: store.get("rooms", []), room: null };   // rooms: 대화방(질문·답이 이어지는 세션), room: 지금 열린 대화방
let map = null, overlays = [], hereOverlay = null;

/* ---------- 회원 (Supabase Auth · Google 로그인) ----------
   키가 없으면(A.sb 없음) 로그인 기능은 숨기고 예전처럼 동작해요. 회원별 데이터는 RLS 로 본인 것만 읽고 써요:
   user_profile(로그인 시 자동 생성) · user_favorite(저장한 카페) · user_search_log(검색 기록) */
const A = { sb: null, user: null, favs: new Set(), taste: null, tasteAsked: false };   // favs: 저장한 카페의 src_id 모음, taste: { choices, skipped } (없으면 null)
const welcome = $("#welcome");
const cafeKey = c => c && c.src_id;                       // Supabase cafe.id (공공 매장 ID)
const userName = () => (A.user && ((A.user.user_metadata && (A.user.user_metadata.full_name || A.user.user_metadata.name)) || A.user.email)) || "";
const acctHtml = () => !A.sb ? "" : A.user
  ? `<div class="acct"><span><b>${esc(userName())}</b> 님</span><span><button class="link" data-taste>내 취향</button> <button class="link gray" data-logout>로그아웃</button></span></div>`
  : `<div class="acct"><span>로그인하지 않았어요</span><button class="link" data-login>로그인</button></div>`;
async function loadFavs() {             // 로그인 계정에 저장한 카페 목록
  A.favs = new Set();
  if (!A.user) return;
  const { data } = await A.sb.from("user_favorite").select("cafe_id");
  (data || []).forEach(r => A.favs.add(r.cafe_id));
}
async function loadHist() {             // 로그인 계정에 저장된 이전 검색을 기록에 합침
  if (!A.user) return;
  const { data } = await A.sb.from("user_search_log").select("query,created_at").order("created_at", { ascending: false }).limit(30);
  const seen = new Set(S.hist.map(h => h.q));
  const more = (data || []).filter(r => !seen.has(r.query) && seen.add(r.query)).map(r => ({ q: r.query, und: [], t: Date.parse(r.created_at) }));
  S.hist = [...S.hist, ...more].sort((a, b) => b.t - a.t).slice(0, 30);
  store.set("hist", S.hist);
}
/* ---------- 취향 분석: 가입 직후 한 번 고르고(건너뛰기 가능), 검색할 때 추천에 반영해요 ----------
   질문은 실제로 데이터가 있는 항목만 넣었어요(눈치·데이트처럼 데이터가 없는 항목은 데이터가 쌓이면 추가). id 는 서버 cafe_core.TASTE_FLAGS 와 같아야 해요. */
const TASTE = [
  { id: "why", title: "카페에 가는 이유", multi: true, opts: [["work", "과제·작업", "💻"], ["study", "스터디·모임", "📚"], ["alone", "혼자 쉬기", "☕"], ["dessert", "디저트", "🍰"]] },
  { id: "must", title: "꼭 필요한 것", multi: true, opts: [["plug", "콘센트", "🔌"], ["wifi", "와이파이", "📶"], ["group", "단체석", "👥"], ["pet", "반려동물 동반", "🐶"], ["park", "주차", "🚗"]] },
  { id: "noise", title: "소음 취향", multi: false, opts: [["quiet", "조용한 곳", "🤫"], ["talk", "적당한 대화 소리", "🗣️"]] },
  { id: "price", title: "아메리카노 가격대", multi: true, opts: [["p1", "3,000원 이하", "🏷️"], ["p2", "3,000~4,500원", "💵"], ["p3", "4,500원 이상", "💎"]] },
  { id: "pain", title: "가장 불편했던 점", multi: true, opts: [["p_plug", "콘센트 찾기", "🔋"], ["p_noise", "시끄러움", "🔊"], ["p_full", "자리 없음", "💺"]] },
];
const TS = { sel: {}, step: "survey", first: false };       // 고르는 중인 값(섹션 → Set), 화면 단계, 가입 직후인지
const tasteCount = () => TASTE.reduce((n, s) => n + TS.sel[s.id].size, 0);
async function loadTaste() {
  A.taste = null;
  if (!A.user) return;
  const { data, error } = await A.sb.from("user_taste").select("choices,skipped").maybeSingle();
  if (error) { A.tasteAsked = true; return; }                // 읽지 못했으면 가입 직후 화면으로 착각해 띄우지 않아요
  if (data) A.taste = { choices: data.choices || {}, skipped: !!data.skipped };
}
function openTaste(first) {
  const have = (A.taste && A.taste.choices) || {};
  TS.sel = Object.fromEntries(TASTE.map(s => [s.id, new Set((have[s.id] || []).filter(v => s.opts.some(o => o[0] === v)))]));
  Object.assign(TS, { step: "survey", first: !!first });
  go("taste");
}
function tasteToggle(b) {
  const s = TASTE.find(x => x.id === b.dataset.ts), set = TS.sel[s.id], v = b.dataset.tv;
  if (set.has(v)) set.delete(v); else { if (!s.multi) set.clear(); set.add(v); }
  document.querySelectorAll(`[data-ts="${s.id}"]`).forEach(x => { const on = set.has(x.dataset.tv); x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
  const n = tasteCount(); $("#tCount").textContent = n ? `${n}개 선택` : "선택해 주세요"; $("[data-tgo]").disabled = !n;
}
async function saveTaste(skipped) {
  const choices = skipped ? {} : Object.fromEntries(TASTE.map(s => [s.id, [...TS.sel[s.id]]]).filter(x => x[1].length));
  if (A.user) {
    const { error } = await A.sb.from("user_taste").upsert({ user_id: A.user.id, choices, skipped, updated_at: new Date().toISOString() });
    if (error) return toast("저장하지 못했어요. 잠시 후 다시 해 주세요");
  }
  A.taste = { choices, skipped };
  toast(skipped ? "나중에 '내 취향'에서 고를 수 있어요" : "취향을 저장했어요. 추천에 반영할게요");
  goHome();
}
async function setUser(u) {
  A.user = u || null;
  if (A.user) { if (!welcome.classList.contains("loading")) welcome.hidden = true; } else A.tasteAsked = false;   // 로딩 중이면 startDone 이 시간 맞춰 닫아요
  await Promise.all([loadFavs(), loadHist(), loadTaste()]);
  if (A.user && !A.taste && !A.tasteAsked && S.cur.view === "home") { A.tasteAsked = true; return openTaste(true); }   // 가입 직후(저장된 취향 없음) 한 번만
  if (["home", "history", "saved", "detail"].includes(S.cur.view)) draw();     // 저장 상태가 바뀌었을 수 있는 화면
}
async function toggleFav() {            // 카페 상세의 '저장' 버튼
  const c = cafeById(S.selected), k = cafeKey(c);
  if (!k) return;
  if (!A.user) { welcome.hidden = false; return; }                 // 로그인이 필요해요
  const on = A.favs.has(k);
  const { error } = on ? await A.sb.from("user_favorite").delete().eq("cafe_id", k) : await A.sb.from("user_favorite").insert({ cafe_id: k });
  if (error) return toast("저장하지 못했어요");
  on ? A.favs.delete(k) : A.favs.add(k);
  const b = $("[data-save]"); if (b) b.outerHTML = V.save(c);
  toast(on ? "저장을 해제했어요" : "저장했어요");
}
async function googleLogin() {
  const { error } = await A.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) $("#wErr").textContent = "로그인을 시작하지 못했어요: " + error.message;
}
function logSearch(q) {
  if (!A.user) return;
  A.sb.from("user_search_log").insert({ query: q.slice(0, 200) }).then(({ error }) => { if (error) console.warn("검색 기록 저장 실패:", error.message); });
}

/* ---------- 기록·취향 (이 기기에만 저장) ---------- */
function pushHist(q, und, snap, room) {
  S.hist = [{ q, und: und || [], t: Date.now(), snap, room }, ...S.hist.filter(h => h.q !== q)].slice(0, 30);
  store.set("hist", S.hist);
}
function snapResults() {                // 결과 카드(카페 id·순위·이유)만 저장해 두면, 다시 열 때 서버·AI를 안 거치고 그대로 복원해요
  return { r: S.results.map(x => ({ id: x.id, rank: x.rank, reason: x.reason, matched: x.matched })), notice: S.notice, guide: S.guide, suggest: S.suggest, sort: S.sort };
}
function resumeChat(i) {                // 최근 대화 하나를 다시 열기: 저장된 결과가 있으면 그대로, 없으면(다른 기기 기록 등) 다시 검색
  const h = S.hist[i];
  if (!h) return;
  const res = h.snap && Array.isArray(h.snap.r) ? h.snap.r.map(x => { const c = S.all.find(a => a.id === x.id); return c && { ...c, rank: x.rank, reason: x.reason, matched: x.matched }; }).filter(Boolean) : [];
  if (!res.length) return search(h.q);
  ++S.token;
  S.hist = [{ ...h, t: Date.now() }, ...S.hist.filter(x => x !== h)]; store.set("hist", S.hist);     // 다시 연 대화는 맨 위로
  Object.assign(S, { query: h.q, selected: null, here: null, pick: null, noTaste: false, results: res, understood: h.und || [],
    notice: h.snap.notice || "", guide: h.snap.guide || "", suggest: h.snap.suggest || [], sort: h.snap.sort || "recommend", stack: [{ view: "home" }] });
  showResults(true);
}
function saveQA() {                     // 장소별 AI 대화를 이 기기에 저장 (답이 온 것만, 카페당 최근 20개·카페 20곳까지)
  const keep = {};
  Object.keys(S.qa).map(id => [id, S.qa[id].filter(x => x.a != null && !x.err).slice(-20)]).filter(([, l]) => l.length)
    .sort((a, b) => b[1][b[1].length - 1].t - a[1][a[1].length - 1].t).slice(0, 20).forEach(([id, l]) => { keep[id] = l; });
  store.set("qa", keep);
}
function qaChats() {                    // 최근 대화 화면에 보여줄 장소별 대화 (최근 질문 순)
  return Object.keys(S.qa).map(id => ({ id: +id, c: cafeById(+id), l: S.qa[id] })).filter(x => x.c && x.l.length)
    .sort((a, b) => b.l[b.l.length - 1].t - a.l[a.l.length - 1].t);
}
function scrollQA() {
  const bs = document.querySelectorAll("#qa .bubble");
  if (bs.length) bs[bs.length - 1].scrollIntoView({ block: "end" });
}
function openAsk(id) {                  // 최근 대화의 '장소에 물어본 대화'를 열어 이어서 묻기
  if (!cafeById(id)) return;
  S.selected = id; qEl.value = "";
  go("ask", id); scrollQA();
}
/* ---------- 대화방: 질문과 답(결과 카드)이 한 방에 이어져요 ---------- */
const msgCards = m => (m.ids || []).map(x => { const c = S.all.find(a => a.id === x.id); return c && { ...c, ...x }; }).filter(Boolean);   // 저장해 둔 id·순위·이유로 카드 복원
function saveRooms() {                  // 이 기기에 저장: 방 20개·방마다 메시지 40개까지 (답을 기다리는 중인 것은 빼요)
  S.rooms = S.rooms.slice(0, 20);
  store.set("rooms", S.rooms.map(r => ({ ...r, msgs: r.msgs.filter(m => !m.wait).slice(-40) })));
}
function renderRoom(toEnd = true) {
  const el = $("#room");
  if (S.cur.view !== "chat") return;
  if (!el) draw(); else el.innerHTML = V.roomMsgs();
  if (toEnd) pbody.scrollTop = pbody.scrollHeight;
}
function openRoom(id) {                 // 최근 대화에서 방을 다시 열기: 이어서 물어볼 수 있어요
  const r = S.rooms.find(x => x.id === id);
  if (!r) return;
  S.room = r; S.rooms = [r, ...S.rooms.filter(x => x !== r)]; saveRooms();
  qEl.value = ""; go("chat"); pbody.scrollTop = pbody.scrollHeight;
}
async function roomSend(q, pick = null, label = "") {
  q = (q || "").trim();
  if (!q) return;
  if (!S.room) { S.room = { id: Date.now(), t: Date.now(), title: q, msgs: [] }; S.rooms.unshift(S.room); }
  const room = S.room, w = { r: "a", wait: true };
  room.msgs.push({ r: "u", text: label || q }, w); room.t = Date.now();
  S.rooms = [room, ...S.rooms.filter(x => x !== room)];
  qEl.value = ""; qEl.blur(); setPh(); renderRoom();
  try {
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, ...(pick ? { sort: pick } : {}), ...(A.taste && !A.taste.skipped ? { taste: A.taste.choices } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    const ids = (j.results || []).map(x => ({ id: x.id, rank: x.rank, reason: x.reason, matched: x.matched, info: x.info, dist_m: x.dist_m }));
    Object.assign(w, { wait: false, k: "res", q, ids, und: j.understood || [], notice: j.notice || "", guide: j.guide || "", suggest: j.suggest || [], sort: j.sort || "recommend" });
    if (!pick && ids.length) {          // 처음 묻는 질문만 기록에 남겨요 (정렬만 바꾼 재검색은 제외)
      pushHist(q, w.und, { r: ids.map(({ id, rank, reason, matched }) => ({ id, rank, reason, matched })), notice: w.notice, guide: w.guide, suggest: w.suggest, sort: w.sort }, room.id);
      logSearch(q);
    }
  } catch (e) { Object.assign(w, { wait: false, k: "err", text: e.message || "검색에 실패했어요. 잠시 후 다시 시도해 주세요." }); }
  saveRooms(); renderRoom();
}
function roomMap(i) {                   // 대화 속 결과를 지도 화면으로 열기 (뒤로 가면 대화방으로 돌아와요)
  const m = S.room && S.room.msgs[i]; if (!m || m.k !== "res") return;
  S.stack.push(S.cur); ++S.token;
  Object.assign(S, { query: m.q, selected: null, here: null, pick: null, noTaste: false, results: msgCards(m), understood: m.und || [],
    notice: m.notice || "", guide: m.guide || "", suggest: m.suggest || [], sort: m.sort || "recommend" });
  showResults(true);
}
function roomsList() {
  return `<div class="sec"><b>대화</b></div><ul class="hist">${S.rooms.map(r => `<li><button data-room="${r.id}">${esc(r.title)}<small>${ago(r.t)} · 질문 ${r.msgs.filter(m => m.r === "u").length}개</small></button></li>`).join("")}</ul>`;
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
  out.push({ pre: "분위기도 물어보세요 · ", em: "분위기 좋은 개인 카페", post: "", ex: "분위기 좋은 프랜차이즈 아닌 카페" });
  out.push({ pre: "메뉴 이름도 좋아요 · ", em: "티라미수 있는 카페", post: "", ex: "티라미수 있는 카페" });
  return out.slice(0, 4);
}
const dayHash = (day, id) => { let x = 0; for (const ch of day + id) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
const closeHour = c => { const m = ((c.summary || {}).hours || "").match(/[–-]\s*(\d{1,2}):/); return m ? +m[1] : null; };
function recSets() {                    // 홈 아래 추천 묶음: 최대 3개, 카페는 묶음끼리 겹치지 않아요
  const day = new Date().toDateString(), withPhoto = S.all.filter(c => (c.photos || []).length);
  const shuffle = l => [...l].sort((a, b) => dayHash(day, a.id) % 997 - dayHash(day, b.id) % 997);
  const keys = prefs().slice(0, 3).flatMap(p => p.split(/\s+/)).filter(w => w.length >= 2);
  const used = new Set(), take = (l, n) => { const out = l.filter(c => !used.has(c.id)).slice(0, n); out.forEach(c => used.add(c.id)); return out; };
  const sets = [];
  if (keys.length) {
    const scored = withPhoto.map(c => ({ c, s: keys.reduce((n, k) => n + (Object.values(c.summary || {}).join(" ").includes(k) ? 1 : 0), 0) })).filter(x => x.s).sort((a, b) => b.s - a.s).map(x => x.c);
    sets.push(["취향에 맞는 카페", take(scored, 6)]);
  }
  sets.push(["분위기 좋은 카페", take(shuffle(withPhoto.filter(c => (c.vibe || []).length >= 2)), 6)]);
  sets.push(["오늘의 카페", take(shuffle(withPhoto), 6)]);
  return sets.filter(s => s[1].length >= 2).slice(0, 3);
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("on"), 1800); }

/* =====================================================================
   화면들 — 각 함수는 HTML 문자열을 돌려줘요. (data-screen = 화면 이름)
   ===================================================================== */
const V = {
  /* 홈 (지도 위 시트): 주소 검색 · 최근 대화 · 추천 카드 */
  home: () => {
    const rec = S.hist.slice(0, 6), has = rec.length > 0;
    return `<div data-screen="home">
      <form class="addr-search" id="addrForm" role="search">${ico("search")}<input id="addr" type="search" enterkeyhint="search" placeholder="${esc(TEXT.addrPlaceholder)}" aria-label="주소 검색"></form>
      ${has ? `<div class="sec"><b>최근 대화</b><button class="link" data-history>전체보기</button></div>
      <div class="rchips">${rec.map((h, i) => `<button class="rchip" data-hq="${i}">${esc(h.q)}</button>`).join("")}</div>` : ""}
      <div class="sec"><b>이런 건 어때요</b></div>
      <div class="rchips">${EXAMPLES.map(q => `<button class="rchip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      ${recSets().map(([t, l]) => `<div class="sec"><b>${esc(t)}</b></div><div class="swipe">${l.map(V.rcard).join("")}</div>`).join("")}
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
  chat: () => S.room && S.room.msgs.length ? `<div class="page" data-screen="chat">
    <div class="toprow">${(S.stack[S.stack.length - 1] || {}).view === "history" ? '<button class="back" data-back>← 최근 대화</button>' : '<button class="back" data-home>← 처음으로</button>'}<button class="newchat" data-newchat>＋ 새 대화</button></div>
    <div class="room" id="room">${V.roomMsgs()}</div>
  </div>` : `<div class="page" data-screen="chat">
    <div class="toprow"><button class="back" data-home>← 처음으로</button></div>
    <div class="tipbox">
      <h2>검색 Tip.</h2><p class="sub">이렇게 물어보면 더 정확해요</p>
      <ul class="tips">${tips().map((t, i) => `<li><button type="button" data-tip="${i}">${esc(t.pre)}<em>${esc(t.em)}</em>${esc(t.post)}</button></li>`).join("")}</ul>
    </div>
  </div>`,

  /* 대화방 메시지: 내 질문은 오른쪽 말풍선, 답(조건·정렬·결과 카드)은 왼쪽 */
  roomMsgs: () => S.room.msgs.map((m, i) => {
    if (m.r === "u") return `<div class="bubble q">${esc(m.text)}</div>`;
    if (m.wait) return `<div class="bubble a wait"><span class="dots"><i></i><i></i><i></i></span></div>`;
    if (m.k === "err") return `<div class="bubble a">${esc(m.text)}</div>`;
    const cs = msgCards(m);
    return `<div class="abox">
      <div class="bubble a">${cs.length ? `“${esc(m.q)}” 조건으로 찾아봤어요.` : "조건에 맞는 카페를 찾지 못했어요. 다르게 물어봐 주세요."}</div>
      ${m.und && m.und.length ? `<div class="und">이렇게 이해했어요 ${m.und.map(u => `<span class="c">${esc(u)}</span>`).join("")}</div>` : ""}
      ${cs.length && m.sort ? `<div class="sortbar"><button type="button" data-rsort="recommend" data-ri="${i}"${m.sort === "recommend" ? ' class="on"' : ""}>추천순</button><button type="button" data-rsort="distance" data-ri="${i}"${m.sort === "distance" ? ' class="on"' : ""}>거리순</button><span class="hint">거리는 안암역 기준</span></div>` : ""}
      ${m.guide ? `<p class="guide">${esc(m.guide).replace(/\n/g, "<br>")}</p>` : ""}${m.notice ? `<span class="notice">${esc(m.notice)}</span>` : ""}
      ${cs.length ? `<ol class="cards">${cs.map(V.card).join("")}</ol><button type="button" class="link rmap" data-rmap="${i}">지도에서 한꺼번에 보기</button>` : ""}
      ${cs.length < 5 && (m.suggest || []).length ? `<div class="rchips wrap">${m.suggest.map(q => `<button class="rchip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
    </div>`;
  }).join(""),

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
      ${S.sort ? `<div class="sortbar"><button type="button" data-sort="recommend"${S.sort === "recommend" ? ' class="on"' : ""}>추천순</button><button type="button" data-sort="distance"${S.sort === "distance" ? ' class="on"' : ""}>거리순</button><span class="hint">거리는 안암역 기준</span></div>` : ""}
      ${S.guide ? `<p class="guide">${esc(S.guide).replace(/\n/g, "<br>")}</p>` : ""}
      ${S.notice ? `<span class="notice">${esc(S.notice)}</span>` : ""}
      ${S.sort && A.taste && !A.taste.skipped && Object.keys(A.taste.choices || {}).length ? `<button type="button" class="link gray" data-notaste>${S.noTaste ? "내 취향 다시 적용하기" : "이번엔 내 취향 빼고 찾기"}</button>` : ""}
    </div>
    <ol class="cards">${S.results.map(V.card).join("")}</ol>
    ${S.results.length < 5 && S.suggest.length ? `<div class="suggest"><b>이렇게 검색해 보면 어때요?</b><div class="rchips">${S.suggest.map(q => `<button class="rchip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>` : ""}
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
        <div class="meta">${V.badge(c)}${V.info(c)}${c.dist_m != null ? `<span class="dist">${fmtM(c.dist_m)}</span>` : ""}${c.summary && c.summary.hours ? `<span>${esc(c.summary.hours)}</span>` : ""}</div>
        ${reason ? `<div class="reason">${esc(reason)}</div>` : ""}
        ${chips.length ? `<div class="kw">${chips.map(k => `<span>${esc(k)}</span>`).join("")}</div>` : ""}
      </div>
      ${ph ? `<div class="thumb"><img src="${esc(safeUrl(ph.url))}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : ""}
    </li>`;
  },
  vote: c => `<div class="vote">
    <button type="button" class="vbtn up${S.votes[c.id] === "up" ? " on" : ""}" data-vote="up" data-vid="${c.id}" aria-label="좋아요">${ico("thumbUp", "")}</button>
    <button type="button" class="vbtn down${S.votes[c.id] === "down" ? " on" : ""}" data-vote="down" data-vid="${c.id}" aria-label="별로예요">${ico("thumbDown", "")}</button></div>`,
  info: c => c.info ? `<span class="badge lv ${{ "확인됨": "ok", "일부 추정": "mid", "정보 부족": "low" }[c.info] || ""}" title="질문한 조건의 정보가 얼마나 확실한지">${esc(c.info)}</span>` : "",   // 서버가 정한 정보 수준
  badge: c => (c.open_now === true ? '<span class="badge open">영업 중</span>' : c.open_now === false ? '<span class="badge closed">영업 종료</span>' : "")
    + (c.franchise ? '<span class="badge fr">프랜차이즈</span>' : ""),

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
      <div class="dname"><div class="dtxt"><h2>${esc(c.name)} ${V.badge(c)}</h2>${c.address ? `<p class="addr">${esc(c.address)}</p>` : ""}</div><div class="dbtns">${A.sb ? V.save(c) : ""}<button type="button" class="askbtn" data-ask>AI에게 묻기</button></div></div>
      <div class="info">
        ${n.mood ? `<p class="summary">${esc(n.mood.length > 110 ? n.mood.slice(0, 108) + "…" : n.mood)}</p>` : ""}
        <div class="rows">${row("cup", "구분", c.franchise ? "프랜차이즈" : "개인 카페")}${row("clock", "시간", s.hours)}${row("seat", "좌석", s.seating)}${row("cup", "메뉴", s.menu)}${row("mood", "분위기", s.atmosphere)}</div>
        ${more.length ? `<details class="more"><summary>자세히</summary>${more.map(m => `<p><b>${m[0]}</b> ${esc(m[1])}</p>`).join("")}</details>` : ""}
        ${c.basis ? `<div class="basis">근거: ${esc(c.basis)}</div>` : ""}
      </div>
      ${V.photos(c)}
      <div class="votebar"><span>카페 정보가 정확한가요?</span>${V.vote(c)}</div>
      <div class="actions">
        <a class="go blue" href="${esc(nav)}" target="_blank" rel="noopener">카카오맵에서 길찾기</a>
      </div>
      <div class="foot"><span>${esc(TEXT.footLine)}</span><button type="button" data-sources>${esc(TEXT.footMore)}</button></div>
    </div>`;
  },
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
    return l.length ? `<h3>이 카페에 물어본 내용</h3>` + l.map(x => `<div class="bubble q">${esc(x.q)}</div><div class="bubble a${x.a == null ? " wait" : ""}">${x.a == null ? '<span class="dots"><i></i><i></i><i></i></span>' : esc(x.a)}</div>`).join("") + `<button class="link gray clr" data-qaclear>이 대화 지우기</button>` : "";
  },

  /* 장소에 대해 AI에게 묻기: 이 카페 정보만 가지고 답해요 (아래 표지판으로 질문) */
  ask: id => {
    const c = cafeById(id); if (!c) return V.error("카페를 찾을 수 없어요");
    return `<div class="page" data-screen="ask">
      <div class="toprow"><button class="back" data-back>← ${(S.stack[S.stack.length - 1] || {}).view === "history" ? "최근 대화" : esc(c.name)}</button></div>
      <h2 class="pagetitle">${esc(c.name)}<br><span class="blue">에 대해 물어보세요</span></h2>
      <p class="lead">이 카페의 정리된 정보만 보고 답해요. 없는 내용은 '확인되지 않았어요'라고 답해요. 앞에서 물어본 내용은 기억하고 이어서 답해요.</p>
      <div class="rchips wrap">${ASK_PRESETS.map(q => `<button class="rchip" data-askq="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <div class="qa" id="qa">${V.qa(c.id)}</div>
    </div>`;
  },

  /* 스와이프: 카드로 카페 요약을 보고 왼쪽(싫어요)/오른쪽(좋아요)으로 밀어요. MVP 라서 동작은 모션만 있고 저장·학습은 아직 없어요 */
  swipe: () => `<div class="page swipepage" data-screen="swipe">
    <div class="toprow"><h2 class="pagetitle">스와이프</h2></div>
    <p class="lead">왼쪽으로 밀면 싫어요, 오른쪽으로 밀면 좋아요</p>
    <div class="deck" id="deck">${V.deck()}</div>
    <div class="swbtns"><button type="button" class="swb no" data-sw="L" aria-label="싫어요">✕</button><button type="button" class="swb yes" data-sw="R" aria-label="좋아요">${ico("heart", "")}</button></div>
  </div>`,
  deck: () => {
    const left = SW.deck.slice(SW.i, SW.i + 3);
    if (!left.length) return `<div class="deckend"><b>오늘 카드는 다 봤어요</b><p>다시 보면 처음부터 보여드려요</p><button class="go blue" data-swreset>다시 보기</button></div>`;
    return left.map((c, d) => ({ c, d })).reverse().map(({ c, d }) => {
      const s = c.summary || {}, p = (c.photos || [])[0];
      return `<div class="scard${d ? "" : " top"}" style="--d:${d}" data-sid="${c.id}">
        ${p ? `<img src="${esc(safeUrl(p.url))}" alt="" draggable="false" referrerpolicy="no-referrer">` : ""}
        <div class="shade"></div>
        <span class="stamp yes">좋아요</span><span class="stamp no">싫어요</span>
        <div class="scap"><div class="sbadges">${V.badge(c)}</div><b>${esc(c.name)}</b>
          <ul>${[["시간", s.hours], ["좌석", s.seating], ["분위기", s.atmosphere]].filter(x => x[1]).map(x => `<li><i>${x[0]}</i>${esc(x[1])}</li>`).join("")}</ul></div>
      </div>`;
    }).join("");
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

  /* 취향 분석 (가입 직후 · 내 취향) */
  taste: () => {
    if (TS.step === "result") {
      const pick = (id, f) => [...TS.sel[id]].map(v => { const o = TASTE.find(s => s.id === id).opts.find(x => x[0] === v); return `<span>${o[2]} ${esc(f ? f(o[1]) : o[1])}</span>`; }).join("");
      const must = pick("must"), prefer = pick("why") + pick("noise") + pick("price", t => "아메리카노 " + t), pain = pick("pain");
      const block = (t, h, cls) => h ? `<section class="tsec"><h3>${t}</h3><div class="ttags ${cls}">${h}</div></section>` : "";
      return `<div class="page" data-screen="taste">
        <div class="toprow"><span></span></div>
        <h2 class="pagetitle">이런 기준으로<br>찾아드릴게요</h2>
        <p class="lead">검색할 때마다 이 기준이 같이 반영돼요. 질문에 직접 쓴 조건도 그대로 지켜요.</p>
        ${block("꼭 필요한 조건", must, "must")}${block("가능하면 맞는 곳", prefer, "")}${block("불편했던 점은 더 신경 써요", pain, "")}
        <p class="fine">“꼭 필요”는 없다고 확인된 카페만 빼요. 정보가 아직 없는 카페는 그대로 보여주고 점수만 달라져요.</p>
        <div class="tbar"><button class="btn2" data-tredo>다시 고르기</button><button class="go blue" data-tsave>이 기준으로 찾기</button></div>
      </div>`;
    }
    const n = tasteCount();
    return `<div class="page" data-screen="taste">
      <div class="toprow"><span></span>${TS.first ? '<button class="link gray" data-tskip>건너뛰기</button>' : '<button class="link gray" data-back>닫기</button>'}</div>
      <h2 class="pagetitle">당신의 카페 취향,<br>먼저 찾아볼까요?</h2>
      <p class="lead">고른 만큼 추천이 정확해져요. 아직 모르겠으면 넘어가도 돼요.</p>
      ${TASTE.map(s => `<section class="tsec"><h3>${esc(s.title)}<small>${s.multi ? "복수 선택" : "하나만"}</small></h3><div class="seg" role="group">${s.opts.map(o => {
        const on = TS.sel[s.id].has(o[0]); return `<button type="button" data-ts="${s.id}" data-tv="${o[0]}" aria-pressed="${on}" class="${on ? "on" : ""}">${o[2]} ${esc(o[1])}</button>`; }).join("")}</div></section>`).join("")}
      <div class="tbar"><span class="tcount" id="tCount">${n ? `${n}개 선택` : "선택해 주세요"}</span><button class="go blue" data-tgo${n ? "" : " disabled"}>내 기준 보기</button></div>
    </div>`;
  },

  /* 저장 버튼 (카페 상세, 'AI에게 묻기' 옆): 저장하면 파란색으로 채워져요 */
  save: c => { const on = A.favs.has(cafeKey(c));
    return `<button type="button" class="savebtn${on ? " on" : ""}" data-save aria-pressed="${on}">${ico("bookmark", "")}<span>${on ? "저장됨" : "저장"}</span></button>`; },

  /* 저장됨: 내가 저장한 카페 (로그인 필요) */
  saved: () => {
    const list = S.all.filter(c => A.favs.has(cafeKey(c)));
    return `<div class="page" data-screen="saved">
      <div class="toprow"><h2 class="pagetitle">저장됨</h2></div>
      ${!A.sb ? `<div class="soon">${ico("bookmark")}<b>로그인 기능을 쓸 수 없어요</b></div>`
        : !A.user ? `<div class="soon">${ico("bookmark")}<b>로그인하면 저장할 수 있어요</b><p>마음에 든 카페를 모아 볼 수 있어요.</p><button class="go blue" data-login>Google로 로그인</button></div>`
        : list.length ? `<ol class="cards">${list.map(V.card).join("")}</ol>`
        : `<div class="soon">${ico("bookmark")}<b>아직 저장한 카페가 없어요</b><p>카페 상세에서 '저장'을 눌러 보세요.</p></div>`}
    </div>`;
  },

  /* 최근 대화 전체보기 */
  history: () => { const chats = qaChats(); return `<div class="page" data-screen="history">
    <div class="toprow"><h2 class="pagetitle">최근 대화</h2><button class="newchat" data-newchat>＋ 새 대화</button></div>
    ${acctHtml()}
    ${S.hist.length || chats.length || S.rooms.length ? `${S.rooms.length ? roomsList() : ""}${S.hist.length ? `<ul class="hist">${S.hist.map((h, i) => h.room && S.rooms.some(r => r.id === h.room) ? "" : `<li><button data-hq="${i}">${esc(h.q)}<small>${ago(h.t)}${h.und && h.und.length ? " · " + h.und.map(esc).join(" · ") : ""}${h.snap ? " · 이어서 보기" : ""}</small></button></li>`).join("")}</ul>` : ""}${chats.length ? `<div class="sec"><b>장소에 물어본 대화</b></div><ul class="hist">${chats.map(x => { const last = x.l[x.l.length - 1]; return `<li><button data-aid="${x.id}">${esc(x.c.name)}<small>${ago(last.t)} · 질문 ${x.l.length}개 · ${esc(last.q)}</small></button></li>`; }).join("")}</ul>` : ""}<button class="link gray clr" data-clear>기록 지우기</button>`
      : '<p class="lead">아직 대화 기록이 없어요. 오른쪽 위 \'새 대화\'를 눌러 물어보세요.</p>'}
  </div>`; },
};
const MODE = { home: "home", loading: "map", results: "map", error: "map", peek: "map", chat: "page", detail: "page", ask: "page", history: "page", saved: "page", swipe: "page",
  feedback: "plain", "feedback-done": "plain", sources: "plain", taste: "plain" };
const SW = { deck: [], i: 0, seed: "" };           // 스와이프 카드 묶음과 현재 위치
const cafeById = id => S.results.find(r => r.id === id) || S.all.find(r => r.id === id);

/* ---------- 화면 그리기 / 이동 ---------- */
function setPh() {
  const v = S.cur.view, key = v === "home" ? "home" : v === "chat" ? "chat" : (v === "detail" || v === "ask") ? "detail" : "results";
  const [b, t] = PLACEHOLDER[key];
  phEl.innerHTML = `<b>${esc(b)}</b><span>${esc(t)}</span>`;
  sign.classList.toggle("has-value", !!qEl.value);
}
function draw() {
  const { view, arg } = S.cur, mode = MODE[view];
  app.dataset.mode = mode;
  app.dataset.menu = NAV_HIDDEN.includes(view) ? "0" : "1";          // 메뉴: 대화·장소 상세에서만 숨김
  app.dataset.sign = SIGN_OFF.includes(view) ? "off" : "on";
  navEl.querySelectorAll("button").forEach(b => { const on = b.dataset.nav === NAV_OF[view]; b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  const inPage = mode === "page" || mode === "plain";
  page.hidden = !inPage;
  const html = V[view](arg);
  if (inPage) { pbody.innerHTML = html; pbody.scrollTop = 0; } else { body.innerHTML = html; body.scrollTop = 0; sheet.dataset.view = view; }
  setPh();
  setH(curH, false);                   // 메뉴가 나타나거나 사라지면 시트·버튼 높이를 다시 맞춰요
  ensureSentinel();
}
function newChat() {                    // '새 대화': 검색 Tip 화면 + 키보드 (새 대화방)
  S.room = null; S.stack = [{ view: "home" }]; S.cur = { view: "chat" };
  qEl.value = ""; draw(); qEl.focus();
}
function navTo(id) {                    // 하단 메뉴로 이동: 쌓인 화면을 비우고 해당 화면으로
  if (id === "home") return goHome();
  const view = { chat: "history", swipe: "swipe", saved: "saved", info: "sources" }[id];
  if (!view) return;
  S.token++;
  if (view === "swipe") { const pool = S.all.filter(c => (c.photos || []).length), day = new Date().toDateString();
    SW.deck = pool.sort((x, y) => dayHash(day + SW.seed, x.id) % 9973 - dayHash(day + SW.seed, y.id) % 9973).slice(0, 20); SW.i = 0; }
  Object.assign(S, { results: [], understood: [], notice: "", guide: "", suggest: [], query: "", selected: null, here: null, sort: null, stack: [{ view: "home" }], cur: { view } });
  qEl.value = ""; qEl.blur(); drawMarkers(); draw();
}
function swipeEnd(dir, card) {          // 카드를 밀어 보내는 모션 (결과 저장·학습은 없음)
  if (!card || card.dataset.out) return;
  card.dataset.out = "1";
  card.classList.add("fly"); card.style.transform = `translate(${dir * 520}px, 40px) rotate(${dir * 28}deg)`; card.style.opacity = "0";
  setTimeout(() => { SW.i++; const d = $("#deck"); if (d) d.innerHTML = V.deck(); }, 260);
}
(function swipeDrag() {
  let d = null;
  document.addEventListener("pointerdown", e => {
    const c = e.target.closest(".scard.top"); if (!c) return;
    d = { c, x: e.clientX, y: e.clientY, dx: 0, moved: false };
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
    c.classList.remove("fly"); c.style.transition = "none";
  });
  document.addEventListener("pointermove", e => {
    if (!d) return;
    d.dx = e.clientX - d.x; const dy = e.clientY - d.y;
    if (Math.abs(d.dx) > 6 || Math.abs(dy) > 6) d.moved = true;
    d.c.style.transform = `translate(${d.dx}px, ${dy * 0.35}px) rotate(${d.dx / 18}deg)`;
    d.c.style.setProperty("--yes", Math.max(0, Math.min(1, d.dx / 90)));
    d.c.style.setProperty("--no", Math.max(0, Math.min(1, -d.dx / 90)));
  });
  const up = () => {
    if (!d) return; const { c, dx, moved } = d; d = null;
    c.style.transition = "";
    if (Math.abs(dx) > 90) return swipeEnd(dx > 0 ? 1 : -1, c);
    c.style.transform = ""; c.style.setProperty("--yes", 0); c.style.setProperty("--no", 0);
    if (!moved) openDetail(+c.dataset.sid);
  };
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
})();
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
  if (p.view === "chat") pbody.scrollTop = pbody.scrollHeight;       // 대화방으로 돌아오면 마지막 대화가 보이게
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
  Object.assign(S, { results: [], understood: [], notice: "", guide: "", suggest: [], query: "", selected: null, here: null, sort: null, room: null, stack: [], cur: { view: "home" } });
  qEl.value = ""; qEl.blur();
  drawMarkers(); resetMap();
  draw(); snapTo("home");
}
let chatOpening = false;
function openChat() {                   // 표지판을 눌렀을 때: 키보드를 먼저 올리고, 잠깐 뒤에 표지판이 아래로 내려오는 화면으로 넘어가요
  if (S.cur.view !== "home" || chatOpening) return;
  chatOpening = true;
  qEl.focus();                          // 누른 순간(사용자 동작 안)에 포커스를 줘야 폰에서 키보드가 떠요. 입력창이 움직이는 중에 포커스를 주면 키보드가 안 뜨는 폰이 있어요
  setTimeout(() => {
    chatOpening = false;
    if (S.cur.view !== "home") return;
    go("chat");
    qEl.value = ""; setPh();
    qEl.focus();
  }, 120);
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
const navH = () => app.dataset.menu === "1" ? navEl.offsetHeight : 0;       // 하단 메뉴 높이 (숨겨졌으면 0)
const SN = {
  get peek() { return 320; },
  get mini() { return 96; },                                                    // 아래로 내려둔 상태 (주소 검색만 보임)
  get home() { return Math.max(200, Math.round(H() * 0.38) - navH()); },       // 기본: 메뉴바를 포함해 화면의 약 38%
  get mid() { return Math.round(H() * 0.56); },
  get full() { return Math.round(H() - navH() - 22); },
};
let curH = 0;
function allowed() { const v = S.cur.view; return v === "home" ? ["mini", "home", "full"] : v === "peek" ? ["peek", "mid"] : ["peek", "mid", "full"]; }
function setH(h, animate = true) {
  curH = Math.max(60, Math.min(SN.full, h));
  sheet.classList.toggle("dragging", !animate);
  sheet.style.height = curH + "px";
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
    if (!moved) {
      if (S.cur.view === "home") return snapTo({ mini: "home", home: "full", full: "home" }[app.dataset.snap] || "home");
      const a = allowed(); return snapTo(curH >= SN[a[a.length - 1]] - 20 ? a[0] : a[a.length - 1]);
    }
    snapTo(nearest(curH));
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
})();

/* 홈 시트: 맨 위에서 아래로 당기면 한 단계 내려가요 (전체화면 → 기본 → 아래로 접힘). 접힌 상태에서 위로 밀면 기본 높이로 돌아와요 */
(function pullDown() {
  let x0 = null, y0 = null;
  const home = () => S.cur.view === "home";
  const lower = () => { const s = app.dataset.snap; if (s === "full") snapTo("home"); else if (s === "home") snapTo("mini"); };
  body.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  body.addEventListener("touchmove", e => {
    if (y0 == null || !home()) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (dy > 48 && dy > dx && body.scrollTop <= 0 && app.dataset.snap !== "mini") { y0 = null; lower(); }
    else if (dy < -36 && -dy > dx && app.dataset.snap === "mini") { y0 = null; snapTo("home"); }
  }, { passive: true });
  body.addEventListener("wheel", e => {
    if (!home()) return;
    if (e.deltaY < -20 && body.scrollTop <= 0) lower();
    else if (e.deltaY > 20 && app.dataset.snap === "mini") snapTo("home");
  }, { passive: true });
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
async function search(q, pick = null, noTaste = false) {      // pick: 이용자가 정렬 버튼으로 고른 값("recommend" | "distance"), noTaste: 이번만 취향 빼고. 새 검색이면 둘 다 기본값
  q = (q || "").trim();
  if (!q) return;
  const my = ++S.token;
  S.query = q; S.selected = null; S.here = null; S.pick = pick; S.noTaste = noTaste; qEl.blur();
  S.stack = [{ view: "home" }]; S.cur = { view: "loading", arg: q };
  qEl.value = q; draw(); snapTo("mid");
  try {
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, ...(pick ? { sort: pick } : {}), ...(A.taste && !A.taste.skipped && !noTaste ? { taste: A.taste.choices } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (my !== S.token) return;                         // 그 사이 처음으로/다른 검색을 눌렀으면 무시
    if (!r.ok) throw new Error(j.error || `오류 (${r.status})`);
    S.results = j.results || []; S.understood = j.understood || []; S.notice = j.notice || ""; S.guide = j.guide || ""; S.suggest = j.suggest || []; S.sort = j.sort || "recommend";
    if (!S.results.length) { drawMarkers(); S.cur = { view: "error", arg: S.guide || S.notice || "조건에 맞는 카페를 찾지 못했어요. 다르게 물어봐 주세요." }; draw(); return; }
    if (!pick && !noTaste) { pushHist(q, S.understood, snapResults()); logSearch(q); }   // 정렬·취향만 바꾼 재검색은 기록에 또 남기지 않아요
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
  S.query = text; S.selected = null; S.sort = null; S.stack = [{ view: "home" }]; S.cur = { view: "loading", arg: text };
  qEl.value = ""; draw(); snapTo("mid");
  const pt = await geocode(text);
  if (my !== S.token) return;
  let list = [];
  if (pt) {
    S.here = pt;
    list = S.all.filter(c => c.lat != null && c.open_now !== false)     // 지금 영업이 끝난 곳은 빼요
      .map(c => ({ ...c, _d: meters(pt.lat, pt.lng, c.lat, c.lng) })).sort((a, b) => a._d - b._d).slice(0, 5)
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
  const id = S.selected, list = (S.qa[id] = S.qa[id] || []), item = { q, a: null, t: Date.now() };
  const prev = list.filter(x => x.a != null && !x.err).slice(-4).map(x => ({ q: x.q.slice(0, 200), a: String(x.a).slice(0, 200) }));   // 앞 대화를 같이 보내 한 대화처럼 이어가요
  list.push(item); qEl.value = ""; setPh(); renderQA();
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafe_id: id, question: q, history: prev }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) item.a = j.answer; else { item.a = j.error || `오류 (${r.status})`; item.err = true; }
  } catch (e) { item.a = "답을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요."; item.err = true; }
  saveQA(); renderQA();
}
function renderQA() {
  const el = $("#qa");
  if (!el || S.cur.view !== "ask") return;
  el.innerHTML = V.qa(S.selected);
  const bs = el.querySelectorAll(".bubble"), last = bs[bs.length - 1]; if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

/* ---------- 👍/👎 의견 (추천 개선용 기록일 뿐, 다음 검색 결과에는 영향을 주지 않아요) ---------- */
const VM = { id: null, reasons: [], text: "" };
const vmEl = document.createElement("div"); vmEl.id = "vmodal"; vmEl.hidden = true; app.appendChild(vmEl);
function refreshVotes() {
  document.querySelectorAll("[data-vote]").forEach(b => b.classList.toggle("on", S.votes[b.dataset.vid] === b.dataset.vote));
}
function postVote(id, vote, reasons = [], text = "") {
  return fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cafe_id: id, vote, reasons, text, query: S.query || "" }) }).then(r => r.ok).catch(() => false);
}
async function saveVoteReports(id, reasons, text) {
  const k = cafeKey(cafeById(id));
  if (!A.user || !k || !reasons.length) return;
  const rows = reasons.map(f => ({ cafe_id: k, field: f, reported_value: text || "(내용 없음)", note: null, user_id: A.user.id }));
  const { error } = await A.sb.from("attr_report").upsert(rows, { onConflict: "cafe_id,field,user_id" });
  if (error) console.warn("제보 DB 저장 실패:", error.message);
}
function onVote(id, kind) {
  if (kind === "up") {
    if (S.votes[id] === "up") delete S.votes[id];
    else { S.votes[id] = "up"; postVote(id, "up"); toast("의견 고마워요"); }
    store.set("votes", S.votes); return refreshVotes();
  }
  if (S.votes[id] === "down") { delete S.votes[id]; store.set("votes", S.votes); return refreshVotes(); }   // 다시 누르면 취소
  Object.assign(VM, { id, reasons: [], text: "" }); drawVM();
}
function drawVM() {
  const c = cafeById(VM.id); if (!c) { vmEl.hidden = true; return; }
  const keep = vmEl.querySelector("#vmText"); if (keep) VM.text = keep.value;
  vmEl.hidden = false;
  vmEl.innerHTML = `<div class="vm-back" data-vclose></div><div class="vm" role="dialog" aria-label="무엇이 달랐나요?">
    <b class="vm-t">무엇이 달랐나요?</b><p>${esc(c.name)} · 해당하는 걸 모두 골라 주세요</p>
    <div class="vm-chips">${FIELDS.map(f => `<button type="button" data-vreason="${f.key}" class="${VM.reasons.includes(f.key) ? "on" : ""}">${f.label}</button>`).join("")}</div>
    <textarea id="vmText" maxlength="300" placeholder="${VM.reasons.includes("etc") ? "기타 의견을 자유롭게 적어 주세요" : "다른 점을 적어 주시면 돼요 (선택)"}">${esc(VM.text)}</textarea>
    <button class="go blue" data-vsend>보내기</button><button class="link gray" data-vclose>닫기</button>
    <p>이 의견은 추천을 더 좋게 만드는 데만 쓰여요. 다음 검색에서 이 카페를 빼지는 않아요.</p></div>`;
  if (VM.reasons.includes("etc") && !keep) setTimeout(() => { const t = vmEl.querySelector("#vmText"); if (t) t.focus(); }, 50);
}
async function sendDown() {
  const t = vmEl.querySelector("#vmText"), text = t ? t.value.trim() : "", id = VM.id;
  vmEl.hidden = true;
  S.votes[id] = "down"; store.set("votes", S.votes); refreshVotes();
  saveVoteReports(id, VM.reasons, text);                 // 로그인했으면 내 계정 DB(attr_report)에도 남겨요
  const ok = await postVote(id, "down", VM.reasons, text);
  toast(ok ? "알려 주셔서 고마워요" : "의견을 보내지 못했어요. 잠시 후 다시 시도해 주세요");
}

/* ---------- 이벤트 (위임) ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#sign")) return;                       // 표지판은 아래 전용 처리
  const vb = t.closest("[data-vote]");
  if (vb) return onVote(+vb.dataset.vid, vb.dataset.vote);   // 카드 안 버튼이라 카드 열기보다 먼저 처리
  const vr = t.closest("[data-vreason]");
  if (vr) { const k = vr.dataset.vreason, i = VM.reasons.indexOf(k); i < 0 ? VM.reasons.push(k) : VM.reasons.splice(i, 1); return drawVM(); }
  if (t.closest("[data-vsend]")) return sendDown();
  if (t.closest("[data-vclose]")) { vmEl.hidden = true; return; }
  const open = t.closest("[data-open]");
  if (open) return openDetail(+open.dataset.open);
  const hq = t.closest("[data-hq]");
  if (hq) return resumeChat(+hq.dataset.hq);
  const ac = t.closest("[data-aid]");
  if (ac) return openAsk(+ac.dataset.aid);
  if (t.closest("[data-qaclear]")) { delete S.qa[S.selected]; saveQA(); return renderQA(); }
  const q = t.closest("[data-q]");
  if (q) return S.cur.view === "chat" ? roomSend(q.dataset.q) : search(q.dataset.q);
  const rs = t.closest("[data-rsort]");
  if (rs) { const m = S.room && S.room.msgs[+rs.dataset.ri]; return m && m.sort !== rs.dataset.rsort ? roomSend(m.q, rs.dataset.rsort, rs.dataset.rsort === "distance" ? "거리순으로 보여줘" : "추천순으로 보여줘") : undefined; }
  if (t.closest("[data-rmap]")) return roomMap(+t.closest("[data-rmap]").dataset.rmap);
  const rm = t.closest("[data-room]");
  if (rm) return openRoom(+rm.dataset.room);
  const tip = t.closest("[data-tip]");
  if (tip) { qEl.value = tips()[+tip.dataset.tip].ex; setPh(); return qEl.focus(); }
  const ts = t.closest("[data-ts]");
  if (ts) return tasteToggle(ts);
  if (t.closest("[data-tgo]")) { TS.step = "result"; return draw(); }
  if (t.closest("[data-tredo]")) { TS.step = "survey"; return draw(); }
  if (t.closest("[data-tsave]")) return saveTaste(false);
  if (t.closest("[data-tskip]")) return saveTaste(true);
  if (t.closest("[data-taste]")) return openTaste(false);
  if (t.closest("[data-login]")) { welcome.hidden = false; return; }
  if (t.closest("[data-logout]")) { A.sb.auth.signOut(); return; }
  const so = t.closest("[data-sort]");
  if (so) return search(S.query, so.dataset.sort, S.noTaste);     // 같은 질문을 고른 정렬로 다시
  if (t.closest("[data-notaste]")) return search(S.query, S.pick, !S.noTaste);   // 이번만 취향 끄기/켜기
  if (t.closest("[data-home]")) return goHome();
  if (t.closest("[data-back]")) return back();
  if (t.closest("[data-showmap]")) return showOnMap();
  if (t.closest("[data-history]")) return go("history");
  if (t.closest("[data-clear]")) {
    S.hist = []; store.set("hist", []); S.qa = {}; store.set("qa", {}); S.rooms = []; S.room = null; store.set("rooms", []);
    if (A.user) A.sb.from("user_search_log").delete().eq("user_id", A.user.id).then(() => {});
    return draw();
  }
  if (t.closest("[data-feedback]")) return openFeedback();
  if (t.closest("[data-sources]")) return go("sources");
  const f = t.closest("[data-field]");
  if (f) { FB.field = f.dataset.field; document.querySelectorAll("#fbField button").forEach(b => b.classList.toggle("on", b === f)); return; }
  if (t.closest("#fbSend")) return sendFeedback();
  const nv = t.closest("[data-nav]");
  if (nv) return navTo(nv.dataset.nav);
  if (t.closest("[data-newchat]")) return newChat();
  if (t.closest("[data-save]")) return toggleFav();
  if (t.closest("[data-ask]")) { go("ask", S.selected); scrollQA(); return qEl.focus(); }
  const aq = t.closest("[data-askq]");
  if (aq) return ask(aq.dataset.askq);
  const sw = t.closest("[data-sw]");
  if (sw) return swipeEnd(sw.dataset.sw === "R" ? 1 : -1, document.querySelector(".scard.top"));
  if (t.closest("[data-swreset]")) { SW.i = 0; $("#deck").innerHTML = V.deck(); return; }
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
  if (view === "ask") return ask(v);
  if (view === "chat") return roomSend(v);
  search(v);
});
qEl.addEventListener("input", () => sign.classList.toggle("has-value", !!qEl.value));
/* 홈에서 입력창을 누르면 바로 대화 화면으로. 입력창은 항상 입력 가능한 상태라서(읽기전용이 아님) 모바일에서 누르는 순간 키보드가 같이 올라와요 */
qEl.addEventListener("focus", () => { if (S.cur.view === "home") openChat(); });

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
navEl.innerHTML = NAV.map(n => `<button type="button" data-nav="${n.id}" aria-label="${esc(n.label)}">${ico(n.icon, "")}<span>${esc(n.label)}</span></button>`).join("");
SW.seed = String(Date.now() % 1000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
/* 시작 화면 로딩 끝: 로그인돼 있거나 둘러보기를 골랐거나 로그인 기능이 없으면 바로 메인으로, 아니면 로그인 버튼을 보여줘요 */
const SPLASH_MS = 1500;     // 로딩이 아무리 빨라도 페이지가 열린 뒤 이 시간까지는 시작 화면을 보여줘요
function startDone() {
  setTimeout(() => {
    welcome.classList.remove("loading");
    welcome.hidden = !!(A.user || !A.sb || sessionStorage.getItem("guest"));
  }, Math.max(0, SPLASH_MS - performance.now()));       // performance.now() = 페이지가 열린 뒤 지난 ms
}
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
      $("#gLogin").addEventListener("click", googleLogin);
      $("#guest").addEventListener("click", () => { sessionStorage.setItem("guest", "1"); welcome.hidden = true; });
    }
    if (S.cur.view === "home") draw();                  // 데이터가 오면 추천 카드를 채워요
    startDone();
    await loadKakao(cfg.kakaoKey);
    map = new kakao.maps.Map($("#map"), { center: new kakao.maps.LatLng(STATION.lat, STATION.lng), level: STATION.level });
    drawMarkers();
  } catch (e) {
    startDone();
    $("#map").innerHTML = `<div class="mapmsg">${esc(e.message)}</div>`;
  }
})();
