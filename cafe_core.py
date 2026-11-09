#!/usr/bin/env python3
"""
안암동 카페 대화형 검색 서버 (파이썬 표준 라이브러리만 사용 → pip install 불필요)

  python3 server.py                       # http://127.0.0.1:8000
  HOST=0.0.0.0 python3 server.py          # 같은 와이파이의 폰에서 접속할 때
  CAFES_PATH=data/cafes.sample.json python3 server.py   # 샘플 데이터로 먼저 체험

API
  GET  /api/cafes            전체 카페 (지도 점 표시용)
  POST /api/search           {"query": "..."} -> 후보 최대 5곳
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONT = ROOT / "public"


def load_env():
    """.env 파일을 읽어 환경변수로 등록 (python-dotenv 대체)."""
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

# ============================ ★ 채워야 하는 설정 ============================
# .env 파일에 적으세요 (.env.example 참고). 비워 두면 '키워드 매칭 모드'로 동작해요.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()      # ★ LLM API 키 (공란 OK)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")  # ★ 현재 무료로 쓸 수 있는 모델명 확인 후 교체
KAKAO_JS_KEY = os.environ.get("KAKAO_JS_KEY", "").strip()                # ★ 카카오 JavaScript 키 (지도 표시에 필수)
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "").strip()            # ★ 카카오 REST API 키 (상호명→좌표 자동 조회용, 공란 OK)
# ==========================================================================

_cp = os.environ.get("CAFES_PATH") or "data/cafes.json"
CAFES_PATH = Path(_cp) if Path(_cp).is_absolute() else ROOT / _cp
MAX_RESULTS = 5


# ------------------------------------------------------------------ 데이터
def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ 상호명 → 좌표 (카카오 로컬 API)
GEO_CACHE = ROOT / "data" / "geocode_cache.json"
CENTER = (127.0292, 37.5861)   # 안암역 (x=경도, y=위도) — 같은 이름의 다른 지점이 섞이지 않게 이 근처(2km)만 검색
_geo_failed = set()


def _kakao_get(kind, **params):
    url = f"https://dapi.kakao.com/v2/local/search/{kind}.json?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r).get("documents") or []


def _norm(s):
    return re.sub(r"[\s()\[\]·&,.-]", "", str(s or "")).lower()


def geocode(name, address=""):
    """상호명으로 좌표 조회 → (lat, lng) 또는 (None, None). 1) 이름 검색(안암역 반경 2km) 2) 주소 검색."""
    if not KAKAO_REST_KEY or not name:
        return None, None
    try:
        docs = _kakao_get("keyword", query=name, x=CENTER[0], y=CENTER[1], radius=2000, size=10)
        hits = [d for d in docs if _norm(name) in _norm(d.get("place_name")) or _norm(d.get("place_name")) in _norm(name)]
        if hits and address:   # 주소가 같이 있으면 주소가 맞는 지점을 우선
            same = [d for d in hits if _norm(address) in _norm(d.get("road_address_name")) + _norm(d.get("address_name"))]
            hits = same or hits
        if hits:
            return float(hits[0]["y"]), float(hits[0]["x"])
        if address:
            docs = _kakao_get("address", query=address)
            if docs:
                return float(docs[0]["y"]), float(docs[0]["x"])
    except Exception as e:
        print(f"[geocode] {name}: {type(e).__name__} {e}", file=sys.stderr)
    return None, None


def fill_coords(cafes):
    """좌표가 비어 있는 카페는 상호명으로 조회해서 채우고, 결과를 data/geocode_cache.json 에 저장."""
    if not KAKAO_REST_KEY:
        return
    cache = json.loads(GEO_CACHE.read_text(encoding="utf-8")) if GEO_CACHE.exists() else {}
    dirty = False
    for c in cafes:
        if c["lat"] is not None and c["lng"] is not None:
            continue
        name = str(c.get("name") or "").strip()
        if not name or name.upper().startswith("TODO"):
            continue
        key = f"{name}|{c.get('address') or ''}"
        if key in cache:
            c["lat"], c["lng"] = cache[key]
        elif key not in _geo_failed:
            lat, lng = geocode(name, c.get("address") or "")
            if lat is None:
                _geo_failed.add(key)          # 같은 실행 중에는 재시도하지 않음 (서버 재시작하면 다시 시도)
            else:
                cache[key] = [lat, lng]
                c["lat"], c["lng"] = lat, lng
                dirty = True
    if dirty:
        try:
            GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError:
            pass   # Vercel 처럼 파일을 쓸 수 없는 환경: 배포 전에 로컬에서 캐시를 만들어 두면 돼요


def load_cafes():
    """매 요청마다 읽어서 JSON을 고치면 서버 재시작 없이 반영돼요."""
    raw = json.loads(CAFES_PATH.read_text(encoding="utf-8"))
    cafes = []
    for i, c in enumerate(raw):
        c = dict(c)
        c["id"] = c.get("id", i + 1)
        c["lat"], c["lng"] = _num(c.get("lat")), _num(c.get("lng"))
        cafes.append(c)
    fill_coords(cafes)
    return cafes


def _list(v):
    return [str(x) for x in (v or []) if str(x).strip()]


def _short(lst, n=4):
    """카드에 너무 길게 나오지 않게 n개까지만 + '외 k'."""
    return "·".join(lst[:n]) + (f" 외 {len(lst) - n}" if len(lst) > n else "")


def _label(v):
    """칩/이유에 쓸 짧은 이름: 괄호 설명은 떼고 12자까지."""
    return re.sub(r"[（(].*$", "", str(v)).strip()[:12] or str(v)[:12]


def summarize(c):
    """4개 분류(영업시간/좌석/메뉴/분위기)의 '한 줄' 요약. 긴 설명은 notes() 로 따로."""
    h, s = c.get("hours") or {}, c.get("seating") or {}
    m, a = c.get("menu") or {}, c.get("atmosphere") or {}
    out = {}

    if h.get("open") and h.get("close"):
        t = f"{h['open']}–{h['close']}"
        if _list(h.get("closed_days")):
            t += f" · {'·'.join(_list(h['closed_days']))} 휴무"
        out["hours"] = t

    parts = []
    types = [str(t["type"]) for t in (s.get("tables") or []) if t.get("type")]
    if types:
        parts.append("·".join(types[:3]))
    if s.get("size"):
        parts.append(str(s["size"]))
    if s.get("total_seats"):
        parts.append(f"{s['total_seats']}석")
    if s.get("outlets"):
        parts.append(f"콘센트 {s['outlets']}")
    if parts:
        out["seating"] = " · ".join(parts)

    menu = []
    if _list(m.get("signature")):
        menu.append("대표 " + "·".join(_label(x) for x in _list(m["signature"])[:2]))
    if _list(m.get("desserts")):
        menu.append("디저트 " + "·".join(_label(x) for x in _list(m["desserts"])[:3]))
    if _list(m.get("drinks")):
        menu.append("음료 " + "·".join(_label(x) for x in _list(m["drinks"])[:3]))
    if menu:
        out["menu"] = " / ".join(menu)

    atm = []
    if a.get("noise"):
        atm.append(f"소음 {a['noise']}")
    atm += [_label(x) for x in _list(a.get("tags"))[:3]]
    if atm:
        out["atmosphere"] = " · ".join(atm)
    return out


def notes(c):
    """상세 화면의 '자세히'에만 보여줄 긴 메모."""
    h, s, a = c.get("hours") or {}, c.get("seating") or {}, c.get("atmosphere") or {}
    out = {}
    if h.get("note"):
        out["hours"] = str(h["note"])
    sn = " / ".join(x for x in (str(s.get("outlet_note") or ""), str(s.get("note") or "")) if x)
    if sn:
        out["seating"] = sn
    if a.get("note"):
        out["mood"] = str(a["note"])
    return out


def _photos(c):
    """사진은 '출처'가 있어야 보여줌: 출처 링크(source) 또는 직접 촬영 표기(credit). 최대 2장."""
    out = []
    for p in c.get("photos") or []:
        p = {"url": p} if isinstance(p, str) else (p or {})
        url, src, credit = str(p.get("url", "")).strip(), str(p.get("source", "")).strip(), str(p.get("credit", "")).strip()
        if not url.startswith(("http://", "https://", "/")):
            continue
        src = src if src.startswith(("http://", "https://")) else ""
        if src or credit:
            out.append({"url": url, "source": src, "credit": credit[:40]})
    return out[:2]


def basis(c):
    e = c.get("extra") or {}
    return " · ".join(x for x in (str(e.get("리뷰 수") or ""), f"신뢰도 {e['신뢰도']}" if e.get("신뢰도") else "") if x)


def public(c, rank=None, reason="", matched=None):
    d = {
        "id": c["id"], "name": c.get("name", ""), "address": c.get("address", ""),
        "lat": c["lat"], "lng": c["lng"], "summary": summarize(c), "notes": notes(c),
        "photos": _photos(c), "basis": basis(c), "open_now": is_open_now(c.get("hours") or {}),
    }
    if rank is not None:
        d.update(rank=rank, reason=reason, matched=matched or [])
    return d


# ------------------------------------------------------- 질문 → 검색 조건(flags) → 데이터 매칭
# 흐름: 질문 --(LLM 번역 또는 규칙)--> flags --(코드가 데이터와 매칭)--> 후보 5곳
FLAG_LABELS = {
    "open_now": "지금 영업 중", "late": "늦게까지 영업", "early": "아침 일찍 오픈",
    "work": "작업·공부", "outlets": "콘센트", "group": "단체·여럿", "solo": "혼자",
    "large": "넓은 좌석", "quiet": "조용함", "lively": "활기찬 분위기",
    "dessert": "디저트", "decaf": "디카페인",
}
FLAG_KEYS = tuple(FLAG_LABELS)
STOPWORDS = {"카페", "안암", "안암동", "추천", "알려줘", "있는", "곳", "좋은", "해줘", "같은", "어디", "근처", "하는", "찾아줘", "보여줘", "가고", "싶어"}
KST = timezone(timedelta(hours=9))


def _hour(s):
    m = re.match(r"^\s*(\d{1,2}):?(\d{2})?", str(s or ""))
    return int(m.group(1)) + int(m.group(2) or 0) / 60 if m else None


def is_open_now(h, now=None):
    """지금(한국 시간) 영업 중인지. 정보가 없으면 None."""
    o, cl = _hour(h.get("open")), _hour(h.get("close"))
    if o is None or cl is None:
        return None
    now = now or datetime.now(KST)
    if "월화수목금토일"[now.weekday()] in _list(h.get("closed_days")):
        return False
    tm = now.hour + now.minute / 60
    if cl <= o:
        cl += 24
    return o <= tm < cl or o <= tm + 24 < cl


def describe_flags(f):
    """화면에 '이렇게 이해했어요' 칩으로 보여줄 조건 이름들."""
    return [FLAG_LABELS[k] for k in FLAG_KEYS if f.get(k)] + list(f.get("words") or [])


def rule_parse(query):
    """LLM 없이 규칙으로 질문을 조건으로 바꿈 (키가 없을 때 / LLM 실패 시)."""
    q = query.lower()
    has = lambda *ws: any(w in q for w in ws)
    tokens = [w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", q) if w not in STOPWORDS]
    f = {
        "work": has("작업", "공부", "노트북", "과제", "레포트", "리포트", "팀플", "코딩", "카공"),
        "outlets": has("콘센트"),
        "quiet": has("조용", "고요", "집중", "한적", "사람 없", "사람없", "붐비지", "차분"),
        "lively": has("시끌", "활기", "수다", "떠들"),
        "late": has("늦게", "야간", "밤", "심야", "24시", "새벽"),
        "early": has("일찍", "아침", "모닝", "브런치"),
        "open_now": has("지금", "현재", "영업 중", "영업중"),
        "solo": has("혼자", "1인", "혼공", "혼밥"),
        "group": has("단체", "여럿", "팀플", "모임", "스터디", "친구들"),
        "large": has("넓", "대형"),
        "dessert": has("디저트", "빵", "베이커리", "케이크", "쿠키", "마카롱", "스콘"),
        "decaf": has("디카페인"),
    }
    f = {k: (True if v else None) for k, v in f.items()}
    f["words"] = []              # 화면 칩에는 규칙이 확신한 조건만 보여줌
    f["_match"] = tokens + [q]   # 메뉴·분위기 단어 매칭용
    return f


def rank_by_flags(f, cafes):
    words = [w.lower() for w in (f.get("words") or []) + (f.get("_match") or []) if len(w) >= 2]
    now = datetime.now(KST)
    scored = []
    for c in cafes:
        h, s = c.get("hours") or {}, c.get("seating") or {}
        m, a = c.get("menu") or {}, c.get("atmosphere") or {}
        score, why = 0.0, []

        def hit(pts, label):
            nonlocal score
            score += pts
            if label not in why:
                why.append(label)

        noise = str(a.get("noise") or "")
        quiet, loud = noise.startswith("조용"), noise.startswith(("활기", "시끌", "북적"))
        if f.get("work") or f.get("outlets"):
            o = s.get("outlets")
            if o == "많음":
                hit(3, "콘센트 많음")
            elif o == "보통":
                hit(1.5, "콘센트 보통")
            elif o == "없음" and f.get("outlets"):
                score -= 2
        if f.get("work") and quiet:
            hit(1, "조용")
        if f.get("quiet"):
            if quiet:
                hit(3, "조용")
            elif loud:
                score -= 2
        if f.get("lively") and loud:
            hit(3, f"소음 {noise}")

        o_, cl = _hour(h.get("open")), _hour(h.get("close"))
        if cl is not None and (cl <= 6 or (o_ is not None and cl <= o_)):
            cl += 24
        if f.get("late") and cl is not None and cl >= 22:
            hit(3, f"{h.get('close')}까지 영업")
        if f.get("early") and o_ is not None and o_ <= 8:
            hit(3, f"{h.get('open')} 오픈")
        if f.get("open_now"):
            st = is_open_now(h, now)
            if st is True:
                hit(3, "지금 영업 중")
            elif st is False:
                score -= 5

        types = [str(t.get("type", "")) for t in (s.get("tables") or [])]
        if f.get("solo") and any("1인" in t for t in types):
            hit(2, "1인석")
        if f.get("group") or f.get("large"):
            if f.get("group") and any("단체" in t for t in types):
                hit(2, "단체석")
            if s.get("size") == "대형":
                hit(2, "대형 좌석")
            elif s.get("size") == "중형":
                hit(1, "중형 좌석")
            try:
                if int(s.get("total_seats") or 0) >= 30:
                    hit(1, f"총 {s['total_seats']}석")
            except ValueError:
                pass

        desserts, drinks = _list(m.get("desserts")), _list(m.get("drinks"))
        if f.get("dessert") and desserts:
            score += min(len(desserts), 5) * 0.4
            why.append("디저트 " + "·".join(_label(d) for d in desserts[:2]))
        if f.get("decaf") and str((c.get("extra") or {}).get("디카페인", "")).strip().upper().startswith(("Y", "가능")):
            hit(2, "디카페인")
        for v in desserts + drinks + _list(m.get("signature")) + types + _list(a.get("tags")):
            vl = v.lower()
            if len(vl) >= 2 and any(vl in w or w in vl for w in words):
                hit(2, _label(v))

        scored.append((score, c["id"], c, why))

    scored.sort(key=lambda x: (-x[0], x[1]))
    out = []
    for i, (score, _, c, why) in enumerate(scored[:MAX_RESULTS], 1):
        reason = " · ".join(why[:3]) if why else "요청과 정확히 맞는 정보가 아직 없어요"
        out.append(public(c, i, reason, why[:4]))
    return out


def keyword_rank(query, cafes):
    return rank_by_flags(rule_parse(query), cafes)


def clean_flags(d):
    """LLM 출력을 믿지 않고 형식만 통과시킴: 정해진 키의 true 값과 짧은 단어 몇 개만 사용."""
    if not isinstance(d, dict):
        raise ValueError("LLM 번역 결과가 JSON 객체가 아님")
    f = {k: (True if d.get(k) is True else None) for k in FLAG_KEYS}
    words = []
    for w in d.get("words") or []:
        w = str(w).strip()
        if 2 <= len(w) <= 12 and w not in words:
            words.append(w)
    f["words"] = words[:4]
    return f


def llm_parse(query):
    """LLM은 '번역기' 역할만: 질문 → 검색 조건. 카페 데이터는 보내지 않아서 짧고 빠름."""
    now = datetime.now(KST)
    prompt = (
        "너는 카페 검색 질문을 '검색 조건'으로 바꾸는 번역기야. 설명 없이 JSON 객체 하나만 출력해.\n"
        "각 조건은 질문에 근거가 있을 때만 true, 아니면 null.\n"
        "- open_now: 지금 영업 중인 곳\n"
        "- late: 늦은 시간(22시 이후)까지 하는 곳 (밤늦게/야간/심야/새벽)\n"
        "- early: 아침 일찍(8시 이전) 여는 곳\n"
        "- work: 작업·공부·과제·카공·노트북 (콘센트가 필요하다는 뜻이면 outlets도 true)\n"
        "- outlets: 콘센트가 필요함\n"
        "- group: 여럿이/단체/팀플/모임\n"
        "- solo: 혼자 가는 곳\n"
        "- large: 넓거나 좌석이 많은 곳\n"
        "- quiet: 조용한 곳 (\"사람 없는\", \"한적한\", \"붐비지 않는\", \"차분한\"도 quiet)\n"
        "- lively: 활기차고 시끌벅적한 곳\n"
        "- dessert: 디저트·빵·케이크를 원함\n"
        "- decaf: 디카페인\n"
        "- words: 질문에 나온 구체적인 메뉴·분위기 단어(예: 티라미수, 아인슈페너, 감성, 테라스), 최대 4개, 없으면 []\n"
        f"현재: {'월화수목금토일'[now.weekday()]}요일 {now:%H:%M}\n"
        f"질문: {json.dumps(query, ensure_ascii=False)}\n"
        '출력 형식: {"open_now":null,"late":null,"early":null,"work":null,"outlets":null,"group":null,'
        '"solo":null,"large":null,"quiet":null,"lively":null,"dessert":null,"decaf":null,"words":[]}'
    )
    text = call_llm(prompt).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    return clean_flags(json.loads(text))


# ------------------------------------------------------- 2) LLM 랭킹
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
# 모델 자동 선택 우선순위 (내 키로 쓸 수 있는 것 중 앞에서부터). 무료 한도·모델명은 자주 바뀌어서 404면 자동으로 찾아 써요.
MODEL_PREFERENCE = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite",
                    "gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
_model = {"name": GEMINI_MODEL, "switched": False}
LLM_MODE = os.environ.get("LLM_MODE", "translate").strip()   # translate: LLM은 질문을 조건으로 번역만(빠름, 기본) / rank: LLM이 카페 데이터 전체를 보고 순위 결정(느림)
_cfg = {"think": True}     # 최신 모델은 '생각' 때문에 느려서 thinkingLevel=low 로 요청 (모델이 거부하면 자동으로 끔)
LLM_TIMEOUT = 30           # 초


def _gemini(prompt, model):
    gen = {"temperature": 0.2, "responseMimeType": "application/json"}
    if _cfg["think"]:
        gen["thinkingConfig"] = {"thinkingLevel": "low"}
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": gen}).encode()
    req = urllib.request.Request(f"{GEMINI_BASE}/models/{model}:generateContent", data=body, headers={
        "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as r:
        data = json.load(r)
    print(f"[LLM] {model} 응답 {time.time() - t0:.1f}초", file=sys.stderr)
    return data["candidates"][0]["content"]["parts"][0]["text"]


def list_models():
    """이 API 키로 텍스트 생성(generateContent)이 가능한 모델 이름 목록."""
    req = urllib.request.Request(f"{GEMINI_BASE}/models?pageSize=200", headers={"x-goog-api-key": GEMINI_API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        models = json.load(r).get("models", [])
    return [m["name"].split("/")[-1] for m in models if "generateContent" in m.get("supportedGenerationMethods", [])]


def pick_model():
    names = list_models()
    print("[LLM] 이 키로 쓸 수 있는 모델:", ", ".join(names[:30]), file=sys.stderr)
    for p in MODEL_PREFERENCE:
        if p in names:
            return p
    flash = [n for n in names if "flash" in n and not any(x in n for x in ("tts", "image", "live", "audio", "native", "preview-0"))]
    return flash[0] if flash else None


def call_llm(prompt):
    """★ 다른 LLM으로 바꾸려면 이 함수만 교체하세요. (문자열 prompt -> JSON 문자열)"""
    for _ in range(3):
        try:
            return _gemini(prompt, _model["name"])
        except urllib.error.HTTPError as e:
            if e.code == 400 and _cfg["think"]:       # 이 모델이 thinkingLevel 설정을 모르면 빼고 다시
                print("[LLM] 400 → thinking 설정 없이 다시 시도", file=sys.stderr)
                _cfg["think"] = False
                continue
            if e.code == 404 and not _model["switched"]:   # 모델 이름이 없거나 이 키로는 못 씀 → 쓸 수 있는 모델로 전환
                new = pick_model()
                if not new or new == _model["name"]:
                    raise
                print(f"[LLM] 모델 '{_model['name']}' 사용 불가(404) → '{new}' 로 전환 (.env 의 GEMINI_MODEL 을 이걸로 바꿔 두면 다음부터 바로 써요)", file=sys.stderr)
                _model["name"], _model["switched"] = new, True
                continue
            raise
    raise RuntimeError("LLM 호출 재시도 초과")


def llm_rank(query, cafes):
    compact = [{
        "id": c["id"], "name": c.get("name"), "hours": c.get("hours"),
        "seating": c.get("seating"), "menu": c.get("menu"), "atmosphere": c.get("atmosphere"),
        "extra": c.get("extra"),
    } for c in cafes]
    prompt = (
        "너는 안암동 카페 추천 도우미야. 아래 [카페 데이터]에 있는 정보만 근거로, "
        f"[사용자 요청]에 가장 어울리는 카페를 최대 {MAX_RESULTS}곳, 적합한 순서대로 골라.\n"
        "규칙:\n"
        "- 데이터에 없거나 비어 있는 항목은 '정보 없음'이야. 절대 추측하지 마.\n"
        "- reason: 한국어 한 문장(40자 안팎), 데이터 근거를 담아서.\n"
        "- matched: 요청과 맞아떨어진 데이터 키워드 1~4개 (예: \"콘센트 많음\", \"조용\", \"22:00까지\", \"티라미수\").\n"
        "- 아래 JSON만 출력: {\"results\":[{\"id\":숫자,\"reason\":\"...\",\"matched\":[\"...\"]}]}\n\n"
        f"[사용자 요청]\n{query}\n\n[카페 데이터]\n{json.dumps(compact, ensure_ascii=False)}"
    )
    text = call_llm(prompt).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    items = json.loads(text)["results"]

    by_id = {c["id"]: c for c in cafes}
    out, seen = [], set()
    for it in items:
        cid = it.get("id")
        if cid in by_id and cid not in seen:
            seen.add(cid)
            out.append(public(by_id[cid], len(out) + 1,
                              str(it.get("reason", ""))[:120],
                              [str(x) for x in (it.get("matched") or [])][:4]))
        if len(out) >= MAX_RESULTS:
            break
    if not out:
        raise ValueError("LLM이 유효한 후보를 반환하지 않음")
    return out


# ------------------------------------------------------------------ 검색 진입점
_cache = {}


def has_info(c):
    """영업시간/좌석/메뉴/분위기 중 하나라도 채워진 카페만 검색 대상 (빈 TODO 칸은 제외)."""
    h, s = c.get("hours") or {}, c.get("seating") or {}
    m, a = c.get("menu") or {}, c.get("atmosphere") or {}
    return bool(
        h.get("open") or s.get("total_seats") or s.get("size") or s.get("outlets")
        or any(t.get("type") for t in (s.get("tables") or []))
        or _list(m.get("desserts")) or _list(m.get("drinks")) or _list(m.get("signature"))
        or a.get("noise") or _list(a.get("tags"))
    )


def search(query):
    cafes = [c for c in load_cafes() if has_info(c)]
    if not cafes:
        return {"results": [], "source": "keyword",
                "notice": "카페 데이터가 비어 있어요. data/cafes.json을 채워 주세요."}
    key = (query.strip().lower(), CAFES_PATH.stat().st_mtime)
    if key in _cache:
        return _cache[key]

    results, source, notice, understood = None, "keyword", "", []
    if GEMINI_API_KEY:
        try:
            if LLM_MODE == "rank":
                results, source = llm_rank(query, cafes), "llm"
            else:
                flags = llm_parse(query)
                if any(flags.get(k) for k in FLAG_KEYS) or flags["words"]:
                    source = "llm"
                else:
                    flags = rule_parse(query)   # LLM이 아무 조건도 못 뽑았으면 규칙으로
                results, understood = rank_by_flags(flags, cafes), describe_flags(flags)
        except urllib.error.HTTPError as e:
            hint = {429: " · 한도 초과", 404: " · 모델 확인 필요", 400: " · 키/요청 확인", 403: " · 키 권한 확인"}.get(e.code, "")
            notice = f"AI 호출 실패(HTTP {e.code}{hint}) → 키워드 매칭으로 대체"
            try:
                print("[LLM] Google 응답:", e.read().decode("utf-8", "ignore")[:400], file=sys.stderr)
            except Exception:
                pass
        except Exception as e:  # 네트워크/파싱 오류 등
            notice = f"AI 호출 실패({type(e).__name__}{' · 응답이 너무 느려요' if isinstance(e, TimeoutError) else ''}) → 키워드 매칭으로 대체"
        if notice:
            print("[search]", notice, file=sys.stderr)
    else:
        notice = "GEMINI_API_KEY가 비어 있어 키워드 매칭 모드예요"

    if results is None:
        flags = rule_parse(query)
        results, understood = rank_by_flags(flags, cafes), describe_flags(flags)
    payload = {"results": results, "source": source, "notice": notice, "understood": understood}

    if source == "llm" or not GEMINI_API_KEY:  # 실패 결과는 캐싱하지 않음
        if len(_cache) > 200:
            _cache.clear()
        _cache[key] = payload
    return payload


# ------------------------------------------------------------------ API (로컬 서버 / Vercel 공용)
_rate = {}
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MIN", "30"))   # IP당 분당 검색 횟수 (공개 배포 시 무료 AI 한도 보호용)


def rate_limited(ip, bucket="search", limit=None):
    limit, key, now = limit or RATE_LIMIT, (bucket, ip), time.time()
    hits = [x for x in _rate.get(key, []) if now - x < 60]
    if len(hits) >= limit:
        _rate[key] = hits
        return True
    hits.append(now)
    _rate[key] = hits
    if len(_rate) > 2000:
        _rate.clear()
    return False


def api_cafes():
    try:
        return 200, {"cafes": [public(c) for c in load_cafes()]}
    except Exception as e:
        return 500, {"error": f"cafes.json 읽기 실패: {e}"}


def api_config():
    return 200, {"kakaoKey": KAKAO_JS_KEY}   # JS 키는 원래 브라우저에 공개되는 키 (도메인 등록으로 보호)


def api_search(raw, length, ip="local"):
    if length > 4000:
        return 413, {"error": "요청이 너무 커요"}
    try:
        query = str(json.loads(raw or b"{}").get("query", "")).strip()
    except Exception:
        return 400, {"error": "잘못된 요청"}
    if not query:
        return 400, {"error": "검색어를 입력해주세요"}
    if rate_limited(ip):
        return 429, {"error": "요청이 너무 많아요. 잠시 후 다시 시도해주세요"}
    try:
        return 200, search(query[:200])
    except Exception as e:
        print("[search error]", repr(e), file=sys.stderr)
        return 500, {"error": f"검색 중 오류: {e}"}


# ------------------------------------------------------------------ 정보 수정 제안 (사용자 피드백)
FEEDBACK_WEBHOOK_URL = os.environ.get("FEEDBACK_WEBHOOK_URL", "").strip()   # ★ (선택) 구글 Apps Script 웹앱 주소 → 구글시트에 쌓임 (README 참고)
FEEDBACK_LOG = ROOT / "data" / "feedback.jsonl"                              # 로컬 실행 시 여기에도 저장
FEEDBACK_FIELDS = {"hours": "영업시간", "seating": "좌석·콘센트", "menu": "메뉴", "mood": "분위기·소음",
                   "closed": "폐업·이전", "photo": "사진", "etc": "기타"}


def store_feedback(rec):
    line = json.dumps(rec, ensure_ascii=False)
    print("[feedback]", line, file=sys.stderr)          # Vercel 에서는 Logs 에서 볼 수 있어요
    stored = False
    if FEEDBACK_WEBHOOK_URL:
        try:
            req = urllib.request.Request(FEEDBACK_WEBHOOK_URL, data=line.encode(), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10).read()
            stored = True
        except Exception as e:
            print("[feedback] webhook 실패:", repr(e), file=sys.stderr)
    try:
        with open(FEEDBACK_LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        stored = True
    except OSError:
        pass                                              # Vercel 처럼 파일을 쓸 수 없는 환경
    return stored


def api_feedback(raw, length, ip="local"):
    if length > 4000:
        return 413, {"error": "내용이 너무 길어요"}
    try:
        d = json.loads(raw or b"{}")
        assert isinstance(d, dict)
    except Exception:
        return 400, {"error": "잘못된 요청"}
    field = str(d.get("field", ""))
    if field not in FEEDBACK_FIELDS:
        return 400, {"error": "어떤 정보가 틀렸는지 골라주세요"}
    value = str(d.get("value", "")).strip()[:500]
    if not value and field != "closed":
        return 400, {"error": "올바른 정보를 적어주세요"}
    url = str(d.get("url", "")).strip()[:300]
    url = url if url.startswith(("http://", "https://")) else ""
    cafe = next((c for c in load_cafes() if str(c["id"]) == str(d.get("cafe_id"))), None)
    if not cafe:
        return 400, {"error": "카페를 찾을 수 없어요"}
    if rate_limited(ip, "feedback", 10):
        return 429, {"error": "요청이 너무 많아요. 잠시 후 다시 시도해주세요"}
    rec = {"ts": datetime.now(KST).isoformat(timespec="seconds"), "cafe_id": cafe["id"], "cafe_name": cafe.get("name", ""),
           "field": field, "field_label": FEEDBACK_FIELDS[field], "value": value, "url": url}
    return 200, {"ok": True, "stored": store_feedback(rec)}


# ------------------------------------------------------------------ 로컬 HTTP 서버 (python server.py)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(FRONT), **kw)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/cafes":
            status, obj = api_cafes()
            return self._json(obj, status)
        if path == "/api/config":
            status, obj = api_config()
            return self._json(obj, status)
        return super().do_GET()

    def do_POST(self):
        route = {"/api/search": api_search, "/api/feedback": api_feedback}.get(self.path.split("?")[0])
        if not route:
            return self._json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        status, obj = route(self.rfile.read(min(n, 4001)), n, self.client_address[0])
        return self._json(obj, status)


def main():
    host, port = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8000"))
    cafes = load_cafes()
    placed = sum(1 for c in cafes if c["lat"] is not None and c["lng"] is not None)
    print(f"카페 {len(cafes)}곳 로드 ({CAFES_PATH.relative_to(ROOT) if CAFES_PATH.is_relative_to(ROOT) else CAFES_PATH}), 좌표 있는 곳 {placed}곳")
    if placed == 0:
        print("  ! 좌표가 비어 있어요. data/cafes.json을 채우거나 CAFES_PATH=data/cafes.sample.json 으로 실행해보세요.")
    print("좌표 자동 조회:", "켜짐 (KAKAO_REST_KEY)" if KAKAO_REST_KEY else "꺼짐 — 좌표가 없는 카페는 지도에 핀이 안 찍혀요 (.env 에 KAKAO_REST_KEY)")
    print("지도:", "카카오맵 (키 있음)" if KAKAO_JS_KEY else "! KAKAO_JS_KEY 가 비어 있어요 → .env 에 넣어주세요 (지도가 안 떠요)")
    print("LLM:", f"Gemini ({_model['name']})" if GEMINI_API_KEY else "키 없음 → 키워드 매칭 모드")
    print(f"→ http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
