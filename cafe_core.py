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
import math
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
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")  # ★ 현재 무료로 쓸 수 있는 모델명 확인 후 교체
KAKAO_JS_KEY = os.environ.get("KAKAO_JS_KEY", "").strip()                # ★ 카카오 JavaScript 키 (지도 표시에 필수)
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY", "").strip()            # ★ 카카오 REST API 키 (상호명→좌표 자동 조회용, 공란 OK)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()                # ★ 구글 로그인·회원별 DB용 (공란이면 로그인 없이 '둘러보기'만)
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()      # 공개 키(anon/publishable). service_role 키는 절대 넣지 마세요
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
    """사진은 '출처'가 있어야 보여줌: 출처 링크(source) 또는 직접 촬영 표기(credit). 최대 4장."""
    out = []
    for p in c.get("photos") or []:
        p = {"url": p} if isinstance(p, str) else (p or {})
        url, src, credit = str(p.get("url", "")).strip(), str(p.get("source", "")).strip(), str(p.get("credit", "")).strip()
        if not url.startswith(("http://", "https://", "/")):
            continue
        src = src if src.startswith(("http://", "https://")) else ""
        if src or credit:
            out.append({"url": url, "source": src, "credit": credit[:40]})
    return out[:4]


def basis(c):
    e = c.get("extra") or {}
    return " · ".join(x for x in (str(e.get("리뷰 수") or ""), f"신뢰도 {e['신뢰도']}" if e.get("신뢰도") else "") if x)


def public(c, rank=None, reason="", matched=None):
    d = {
        "id": c["id"], "src_id": c.get("src_id", ""), "name": c.get("name", ""), "address": c.get("address", ""),
        "lat": c["lat"], "lng": c["lng"], "summary": summarize(c), "notes": notes(c),
        "photos": _photos(c), "basis": basis(c), "open_now": is_open_now(c.get("hours") or {}),
        "franchise": is_franchise(c), "vibe": vibe_hits(c),
    }
    if rank is not None:
        d.update(rank=rank, reason=reason, matched=matched or [])
    return d


# ------------------------------------------------------- 질문 → 검색 조건(flags) → 데이터 매칭
# 흐름: 질문 --(LLM 번역 또는 규칙)--> flags --(코드가 데이터와 매칭)--> 후보 5곳
FLAG_LABELS = {
    "open_now": "지금 영업 중", "late": "늦게까지 영업", "early": "아침 일찍 오픈",
    "work": "작업·공부", "outlets": "콘센트", "wifi": "와이파이", "group": "단체·여럿", "solo": "혼자",
    "large": "넓은 좌석", "quiet": "조용함", "lively": "활기찬 분위기",
    "dessert": "디저트", "decaf": "디카페인",
    "vibe": "분위기 좋은", "franchise": "프랜차이즈", "indie": "개인 카페",
}
FLAG_KEYS = tuple(FLAG_LABELS)
STOPWORDS = {"카페", "안암", "안암동", "추천", "알려줘", "있는", "곳", "좋은", "해줘", "같은", "어디", "근처", "하는", "찾아줘", "보여줘", "가고", "싶어",
             "높은", "많은", "순으로", "가까운", "별점", "평점", "리뷰", "후기", "인기", "유명", "거리"}   # 정렬 선호 단어는 메뉴·분위기 매칭에서 제외
KST = timezone(timedelta(hours=9))

# ------------------------------------------------------- 확률 점수 (사전값 + 증거 → 확신도)
# 거리 기준 위치: 현재 행정구역(안암동)의 중심인 안암역(6호선). 앱이 위치를 보내면 그걸 쓰고, 없으면 이걸 써요.
HERE = (37.5861, 127.0292)     # (위도, 경도)
SORTS = {"reviews": "리뷰 많은 순", "distance": "가까운 순", "rating": "별점 높은 순"}
DIST_POOL = 15                 # 거리순: 조건 점수 상위 이 수만큼을 후보로 두고 가까운 순으로 줄세워요
BAND = 0.85                    # 조건 점수가 1등의 85% 이상인 후보끼리만 정렬 선호(리뷰·거리·별점)로 다시 줄세워요
# 속성 값이 '조건을 만족하는 정도'(0~1)와, 아무 정보가 없을 때의 기본 기대치(사전값)
LEVEL = {
    "outlet": ({"많음": 1, "있음": .8, "보통": .6, "적음": .3, "없음": 0}, .3),
    "wifi": ({"1": 1, "0": 0}, .4),
    "laptop": ({"1": 1, "0": 0}, .6),
    "noise": ({"조용": 1, "보통": .35, "활기": .05, "시끌": .05, "북적": .05}, .3),    # 조용함 기준
}
NAME = {"outlet": "콘센트", "wifi": "와이파이", "laptop": "노트북", "noise": "소음"}
_LEGACY_EXTRA = {"있음": "1", "없음": "0", "가능": "1", "제한": "0"}


# 대형 프랜차이즈는 좌석이 넓고 콘센트·와이파이가 거의 항상 있어요 → 리뷰 근거가 없어도 높은 확신도를 줘요.
# (컴포즈·빽다방·메가커피 같은 테이크아웃형 저가 매장은 제외. 늘리려면 이름만 추가)
CHAINS = ("스타벅스", "투썸", "탐앤탐스", "커피빈", "할리스", "엔제리너스", "폴바셋")
CHAIN_RULE = {"outlet": ("있음", .75), "wifi": ("1", .8)}      # 속성 → (값, 확신도)
CHAIN_MIN_CONF = .5      # 이미 이 이상의 확신도로 값이 있으면(리뷰·직접 확인) 규칙으로 덮지 않아요


def is_chain(c):
    return any(n in (c.get("name") or "") for n in CHAINS)


# 프랜차이즈 구분 (검색 조건 '프랜차이즈'/'개인 카페'와 카드·상세의 배지에 써요). CHAINS 는 '콘센트·와이파이가 있을 것'으로 보는 대형 체인이고,
# 여기는 테이크아웃형 저가 체인까지 포함한 전체 목록이에요. 늘리려면 이름만 추가하세요.
FRANCHISE_BRANDS = ("스타벅스", "투썸", "탐앤탐스", "커피빈", "할리스", "엔제리너스", "폴바셋", "파스쿠찌", "카페베네",
                    "이디야", "메가커피", "메가MGC", "컴포즈", "빽다방", "더벤티", "매머드", "바나프레소", "백억커피", "파운드커피", "파란만잔", "베브릿지",
                    "공차", "버블티킹", "설빙", "베스킨라빈스", "배스킨", "던킨", "뚜레쥬르", "파리바게뜨", "파리바게트", "요거프레소")


def is_franchise(c):
    """데이터에 franchise(true/false)가 있으면 그대로, 없으면 분위기 태그 '프랜차이즈' → 브랜드 이름 순서로 판단."""
    v = c.get("franchise")
    if isinstance(v, bool):
        return v
    if isinstance(v, str) and v.strip().lower() in ("1", "true", "y", "yes", "프랜차이즈"):
        return True
    if isinstance(v, str) and v.strip().lower() in ("0", "false", "n", "no", "개인", "개인 카페"):
        return False
    if "프랜차이즈" in _list((c.get("atmosphere") or {}).get("tags")):
        return True
    name = (c.get("name") or "").replace(" ", "")
    return any(n in name for n in FRANCHISE_BRANDS)


# '분위기 좋은' 검색: 이 태그 중 하나라도 있는 카페 (Supabase cafe_attr 의 field='vibe_tags' → cafes.json atmosphere.tags)
VIBE_TAGS = ("감성카페", "아늑함", "우드톤", "빈티지", "유럽풍", "한옥감성", "채광좋음", "음악좋음")
# 정리되기 전의 원본 태그를 위 8개로 읽는 별칭. Supabase vibe_tag_map 을 내려받아 data/vibe_tag_map.json ({"원본": "정리된 태그"}) 로 두면 그게 우선해요.
VIBE_ALIAS = {"아늑": "아늑함", "감성": "감성카페", "앤틱": "빈티지", "채광": "채광좋음", "햇살": "채광좋음", "통창": "채광좋음", "유럽": "유럽풍", "한옥": "한옥감성"}
_vibe_map = {"mtime": None, "map": {}}


def _vibe_alias():
    p = ROOT / "data" / "vibe_tag_map.json"
    try:
        m = p.stat().st_mtime
        if _vibe_map["mtime"] != m:
            raw = json.loads(p.read_text(encoding="utf-8"))
            _vibe_map.update(mtime=m, map={str(k).replace(" ", ""): str(v).replace(" ", "") for k, v in raw.items()} if isinstance(raw, dict) else {})
    except (OSError, ValueError):
        _vibe_map.update(mtime=None, map={})
    return {**VIBE_ALIAS, **_vibe_map["map"]}


def vibe_hits(c):
    """이 카페가 가진 '분위기 좋은' 태그들 (VIBE_TAGS 중, 순서 유지·중복 없음)."""
    alias, out = _vibe_alias(), []
    for t in _list((c.get("atmosphere") or {}).get("tags")):
        t = alias.get(t.replace(" ", ""), t.replace(" ", ""))
        if t in VIBE_TAGS and t not in out:
            out.append(t)
    return out


def _belief_src(c, key):
    """(값, 확신도 0~1, 출처). 정보가 없으면 ('', 0, ''). 예전 형식 cafes.json(belief 없음)도 읽어요."""
    b = (c.get("belief") or {}).get(key)
    if b:
        v, p = str(b.get("v") or ""), float(b.get("p") or 0)
    elif "belief" in c:
        v, p = "", 0.0
    else:
        e = c.get("extra") or {}
        v = {"outlet": (c.get("seating") or {}).get("outlets"), "noise": (c.get("atmosphere") or {}).get("noise"),
             "wifi": _LEGACY_EXTRA.get(e.get("와이파이")), "laptop": _LEGACY_EXTRA.get(e.get("노트북 작업"))}.get(key)
        v, p = (str(v), 0.6) if v else ("", 0.0)
    if key in CHAIN_RULE and is_chain(c) and not (v and p >= CHAIN_MIN_CONF):
        return CHAIN_RULE[key] + ("프랜차이즈",)
    return v, p, ""


def _belief(c, key):
    return _belief_src(c, key)[:2]


def belief_p(c, key):
    """조건을 만족할 확률 = 확신도×(값이 말하는 정도) + (1-확신도)×사전값. 정보 없으면 사전값 그대로. → (확률, 확신도)"""
    levels, prior = LEVEL[key]
    v, conf = _belief(c, key)
    lvl = next((x for k, x in levels.items() if v.startswith(k)), None)
    if lvl is None:
        return prior, 0.0
    return conf * lvl + (1 - conf) * prior, conf


def _belief_label(key, v):
    return {"outlet": f"콘센트 {v}", "wifi": "와이파이 " + ("있음" if v == "1" else "없음"),
            "laptop": "노트북 " + ("가능" if v == "1" else "제한"), "noise": "조용" if v.startswith("조용") else f"소음 {v}"}[key]


def _dist_m(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return float("inf")
    a = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 12742000 * math.asin(math.sqrt(a))


def _rating(c):
    """카카오 별점을 리뷰 수로 보정(리뷰 1~3개짜리 5.0점이 위로 오지 않게): 평균 3.5점 10개를 섞어서 계산."""
    st = c.get("stats") or {}
    r, n = st.get("rating"), st.get("rating_n") or 0
    return (n * r + 10 * 3.5) / (n + 10) if r else 3.5


def _reviews(c):
    return (c.get("stats") or {}).get("reviews") or 0


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
    return [FLAG_LABELS[k] for k in FLAG_KEYS if f.get(k)] + list(f.get("words") or []) + ([SORTS[f["sort"]]] if f.get("sort") else [])


def rule_sort(q):
    """'가까운 / 별점 높은 / 리뷰 많은' 같은 정렬 선호. 없으면 None."""
    if any(w in q for w in ("가까", "가깝", "거리")):
        return "distance"
    if any(w in q for w in ("별점", "평점", "평가 좋")):
        return "rating"
    if any(w in q for w in ("리뷰", "후기", "인기", "유명")):
        return "reviews"
    return None


def rule_parse(query):
    """LLM 없이 규칙으로 질문을 조건으로 바꿈 (키가 없을 때 / LLM 실패 시)."""
    q = query.lower()
    has = lambda *ws: any(w in q for w in ws)
    qm = re.sub(r"와이\s*파이|wifi|와파", " ", q)     # '와이파이' 속 '파이'가 디저트 파이로 맞는 걸 막아요
    tokens = [w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", qm) if w not in STOPWORDS]
    f = {
        "work": has("작업", "공부", "노트북", "과제", "레포트", "리포트", "팀플", "코딩", "카공"),
        "outlets": has("콘센트"),
        "wifi": has("와이파이", "wifi", "와이 파이", "와파"),
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
        "vibe": has("분위기 좋", "분위기좋", "분위기 있", "분위기있", "분위기 맛집", "분위기 예쁜", "분위기 이쁜", "무드", "감성"),
    }
    # 프랜차이즈: '프랜차이즈 아닌/말고/빼고'는 개인 카페, 그 외 '프랜차이즈/체인/프차'는 프랜차이즈
    neg = re.search(r"(프랜차이즈|체인|프차)\s*(이?\s*아닌|가\s*아닌|말고|빼고|제외|없는|아니)", q) or has("개인 카페", "개인카페", "개인 운영", "개인운영", "동네 카페", "동네카페", "독립 카페")
    f["indie"] = bool(neg)
    f["franchise"] = has("프랜차이즈", "체인", "프차") and not neg
    f = {k: (True if v else None) for k, v in f.items()}
    f["sort"] = rule_sort(q)
    f["words"] = []              # 화면 칩에는 규칙이 확신한 조건만 보여줌
    f["_match"] = tokens + [" ".join(qm.split())]   # 메뉴·분위기 단어 매칭용
    return f


# ------------------------------------------------------- 회원 취향 (가입 직후 고른 값 → 검색 조건에 합침)
# (섹션, 항목 id) → 조건 이름. 데이터가 없는 항목(눈치 안 보임·데이트 등)은 화면에서 뺐어요. app.js 의 TASTE 와 id 가 같아야 해요.
TASTE_FLAGS = {
    ("why", "work"): "work", ("why", "study"): "group", ("why", "alone"): "solo", ("why", "dessert"): "dessert",
    ("must", "plug"): "outlets", ("must", "wifi"): "wifi", ("must", "group"): "group", ("must", "pet"): "pet", ("must", "park"): "park",
    ("noise", "quiet"): "quiet", ("noise", "talk"): "talk",
    ("pain", "p_plug"): "outlets", ("pain", "p_noise"): "quiet", ("pain", "p_full"): "large",
}
TASTE_PRICE = {"p1": (0, 3001, "3,000원 이하"), "p2": (3001, 4501, "3,000~4,500원"), "p3": (4501, 10 ** 6, "4,500원 이상")}   # 아메리카노 가격 구간 [lo, hi)
EXTRA_LABELS = {"pet": "반려동물 동반", "park": "주차", "talk": "적당한 대화 소리"}
TASTE_SECTIONS = {}
for _s, _i in list(TASTE_FLAGS) + [("price", p) for p in TASTE_PRICE]:
    TASTE_SECTIONS.setdefault(_s, set()).add(_i)


def clean_taste(d):
    """앱이 보낸 취향 선택값을 믿지 않고, 정해진 항목 id 만 통과시켜요."""
    if not isinstance(d, dict):
        return {}
    out = {}
    for sec, ids in d.items():
        if sec in TASTE_SECTIONS and isinstance(ids, list):
            ok = [i for i in ids if isinstance(i, str) and i in TASTE_SECTIONS[sec]][:6]
            if ok:
                out[sec] = ok
    return out


def apply_taste(f, taste):
    """회원 취향 → 보조 점수용 조건. 질문이 우선이라서, 질문에 이미 있는 조건은 빼고(중복), 질문과 부딪히는 소음 취향은 버려요.
    → (취향 조건, 화면에 보일 칩 또는 None, 부딪혀서 뺀 취향 이름들)"""
    qnoise = f.get("quiet") or f.get("lively")      # 질문이 소음 분위기를 직접 말했으면 취향의 소음 항목은 이번엔 안 써요
    tf, labels, dropped = {}, [], []
    for sec, ids in taste.items():
        for i in ids:
            if sec == "price":
                lo, hi, name = TASTE_PRICE[i]
                tf["price"] = (tf.get("price") or []) + [(lo, hi)]
                lab = "아메리카노 " + name
            else:
                k = TASTE_FLAGS[(sec, i)]
                lab = FLAG_LABELS.get(k) or EXTRA_LABELS[k]
                if f.get(k):
                    continue
                if k in ("quiet", "talk") and qnoise:
                    if lab not in dropped:
                        dropped.append(lab)
                    continue
                tf[k] = True
            if lab not in labels:
                labels.append(lab)
    chip = ("내 취향 · " + ", ".join(labels[:3]) + (f" 외 {len(labels) - 3}" if len(labels) > 3 else "")) if labels else None
    return tf, chip, dropped


def _lacks(c, item):
    """'꼭 필요한 것'이 없다고 확인된 곳인지. 정보를 모르는 곳은 False → 제외하지 않고 점수만 낮아져요."""
    ex = c.get("extra") or {}
    if item == "plug":
        v, p, _ = _belief_src(c, "outlet")
        return v.startswith("없음") and p >= .5
    if item == "wifi":
        v, p, _ = _belief_src(c, "wifi")
        return v == "0" and p >= .5
    if item == "pet":
        return str(ex.get("반려동물")) == "0"
    if item == "park":
        return str(ex.get("주차", "")).startswith("불가")
    return False


def _price(c):
    m = re.search(r"\d[\d,]*", str((c.get("extra") or {}).get("아메리카노 가격", "")))
    return int(m.group().replace(",", "")) if m else None


RELIABLE = .6      # 확신도가 이 이상이면 '확인된 정보', 미만이면 '추정', 0이면 '정보 없음'
MAX_UNSURE = 3     # 거리순 한 화면에 섞어 보여줄 '정보 부족' 카페 수 상한
OPT_P = .8         # 거리순에서 '정보 없는' 속성을 이 확률로 가정해 후보를 넓혀요
TASTE_W = .2       # 회원 취향은 질문으로 정해진 후보 '안에서' 순서만 가르는 보조 (별점·리뷰 점수에 더하는 비중)


def _score_all(f, cafes):
    """조건 f 로 카페마다 점수를 매겨요. → [{q: 점수, opt: 낙관 점수, id, c: 카페, why, unknown, levels: {항목: 확신도}, t: 취향 점수}]
    levels 는 점수 비중이 큰(3점) 확률 속성만 담아요: 이게 추천순에서 '확실한 곳'을 가르는 기준이에요."""
    words = [w.lower() for w in (f.get("words") or []) + (f.get("_match") or []) if len(w) >= 2]
    now = datetime.now(KST)
    scored = []
    for c in cafes:
        h, s = c.get("hours") or {}, c.get("seating") or {}
        m, a = c.get("menu") or {}, c.get("atmosphere") or {}
        score, why, unknown, levels, opt = 0.0, [], [], {}, 0.0

        def hit(pts, label):
            nonlocal score
            score += pts
            if label not in why:
                why.append(label)

        noise = str(a.get("noise") or "")
        loud = noise.startswith(("활기", "시끌", "북적"))
        # 콘센트·와이파이·노트북·조용함: 점수 = 가중치 × 조건을 만족할 확률 (확신도가 낮으면 사전값 쪽으로 끌려가요)
        weights = {}
        if f.get("work") or f.get("outlets"):
            weights["outlet"] = 3
        if f.get("wifi"):
            weights["wifi"] = 3
        if f.get("work"):
            weights["laptop"] = 1
        if f.get("quiet"):
            weights["noise"] = 3
        elif f.get("work"):
            weights["noise"] = 1
        for key, wt in weights.items():
            p, conf = belief_p(c, key)
            score += wt * p
            if wt >= 3:
                levels[key] = conf
            if not conf:
                opt += wt * (OPT_P - p)      # 거리순용 낙관 점수: 정보가 없는 속성은 '있다'고 가정했을 때의 점수
                unknown.append(f"{NAME[key]} 정보 없음")
            elif p >= 0.5:
                v, _, src = _belief_src(c, key)
                why.append(_belief_label(key, v) + (f" ({src})" if src else "" if conf >= RELIABLE else " (추정)"))
        if f.get("lively") and loud:
            hit(3, f"소음 {noise}")
        # 회원 취향에서만 오는 조건: 값을 아는 곳만 점수를 주고, 모르는 곳은 0점(감점 없음)
        ex = c.get("extra") or {}
        if f.get("talk") and noise.startswith(("보통", "활기")):
            hit(2, f"소음 {noise}")
        if f.get("pet") and str(ex.get("반려동물")) == "1":
            hit(3, "반려동물 동반")
        if f.get("park") and str(ex.get("주차", "")).startswith("가능"):
            hit(3, "주차 가능")
        if f.get("price") and (pr := _price(c)) and any(lo <= pr < hi for lo, hi in f["price"]):
            hit(2, f"아메리카노 {pr:,}원")

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

        if f.get("vibe"):
            vh = vibe_hits(c)
            if vh:
                hit(3 + 0.5 * (len(vh) - 1), "·".join(vh[:3]))
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

        scored.append({"q": score, "opt": score + opt, "id": c["id"], "c": c, "why": why, "unknown": unknown, "levels": levels, "t": 0.0})
    return scored


def _info(levels):
    """카드에 붙일 정보 수준. 질문이 확률 속성(콘센트·와이파이·조용함)을 묻지 않았으면 None."""
    if not levels:
        return None
    if all(v >= RELIABLE for v in levels.values()):
        return "확인됨"
    return "일부 추정" if all(v > 0 for v in levels.values()) else "정보 부족"


def rank_by_flags(f, cafes, here=None, tf=None):
    """f: 질문에서 읽은 조건, tf: 회원 취향 조건(보조). → (결과 카드들, 안내 문구)
    추천순은 질문이 묻는 속성의 정보가 '확인된' 곳만, 거리순은 정보가 부족한 곳도 함께(정보 수준을 표시)."""
    here = here or HERE
    rows = _score_all(f, cafes)
    if tf:      # 회원 취향은 보조: 질문 점수는 그대로 두고, 취향 점수만 따로 계산해 순서를 가를 때 써요
        for r, rt in zip(rows, _score_all(tf, cafes)):
            r["t"] = rt["q"]
            r["why"] += [x for x in rt["why"] if x not in r["why"]]
    sort, note = f.get("sort"), ""
    far = sort == "distance"
    sc = "opt" if far else "q"          # 거리순은 정보 없는 곳도 후보에 넣으려고 '낙관 점수'를 써요
    if not far and any(r["levels"] for r in rows):     # 추천순: 질문이 묻는 속성이 '확인된' 곳만
        sure = [r for r in rows if all(v >= RELIABLE for v in r["levels"].values())]
        if not sure:
            note = "확실한 정보가 있는 곳이 없어서 정보가 부족한 곳도 함께 보여드려요"
        else:
            if len(sure) < min(MAX_RESULTS, len(rows)):
                note = f"확실한 정보가 있는 곳이 {len(sure)}곳뿐이에요. '거리순'에서는 정보가 부족한 곳도 볼 수 있어요"
            rows = sure

    # 1순위: 질문 점수. 점수가 비슷한(1등의 BAND 이상) 후보끼리만 정렬 선호로 다시 줄세워요 (조건이 안 맞는 곳이 인기 때문에 올라오지 않게).
    rows.sort(key=lambda r: (-(r[sc] + TASTE_W * r["t"]), r["id"]))
    top = max((r[sc] for r in rows), default=0)
    band = rows[:DIST_POOL] if far else [r for r in rows if top <= 0 or r[sc] >= top * BAND]   # 거리순: 1등 점수가 튀어도 상위 DIST_POOL곳을 가까운 순으로
    dist = lambda c: _dist_m(here[0], here[1], c.get("lat"), c.get("lng"))
    key = {"distance": lambda r: (dist(r["c"]), r["id"]),
           "rating": lambda r: (-_rating(r["c"]), -_reviews(r["c"]), r["id"]),
           "reviews": lambda r: (-_reviews(r["c"]), -_rating(r["c"]), r["id"])}.get(
        sort, lambda r: (-(_rating(r["c"]) + 0.5 * math.log10(1 + _reviews(r["c"])) + TASTE_W * r["t"]), r["id"]))   # 선호가 없으면 별점+리뷰 수(+취향)를 섞은 기본값
    in_band = {r["id"] for r in band}
    ordered = sorted(band, key=key) + [r for r in rows if r["id"] not in in_band]
    if far:     # 거리순: '정보 부족'은 MAX_UNSURE곳까지만, 나머지는 가까운 확인된 곳으로 채워요 (모자라면 뒤에서 다시 채움)
        unsure = lambda r: any(v < RELIABLE for v in r["levels"].values())
        pick, n = [], 0
        for r in ordered:
            if unsure(r):
                n += 1
                if n > MAX_UNSURE:
                    continue
            pick.append(r)
        ordered = pick + [r for r in ordered if r not in pick]
    if any(r["why"] or r["unknown"] for r in ordered):       # 요청과 맞는 정보가 하나도 없는 카페는 빼요 (맞는 곳이 있을 때만)
        ordered = [r for r in ordered if r["why"] or r["unknown"]]
    out = []
    for i, r in enumerate(ordered[:MAX_RESULTS], 1):
        c, unknown = r["c"], r["unknown"]
        extra = {"rating": lambda: f"별점 {_rating(c):.1f}", "reviews": lambda: f"리뷰 {_reviews(c)}건"}.get(sort, lambda: None)()
        parts = ([extra] if extra else []) + r["why"]        # 정렬 기준(별점·리뷰 수)은 이유 맨 앞에. 거리는 카드에 항상 따로 표시해요(dist_m)
        shown = parts[:3 - min(len(unknown), 1)] + unknown[:1]       # '정보 없음'은 잘리지 않게 한 자리를 비워 둬요
        reason = " · ".join(shown) if shown else "요청과 정확히 맞는 정보가 아직 없어요"
        item = public(c, i, reason, (parts + unknown)[:4])
        item["info"] = _info(r["levels"])
        d = dist(c)
        if d != float("inf"):
            item["dist_m"] = round(d)
        out.append(item)
    return out, note


def fmt_m(m):
    return f"{round(m / 10) * 10}m" if m < 1000 else f"{m / 1000:.1f}km"


def keyword_rank(query, cafes, here=None):
    return rank_by_flags(rule_parse(query), cafes, here)[0]


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
    f["sort"] = d.get("sort") if d.get("sort") in SORTS else None
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
        "- wifi: 와이파이가 필요함\n"
        "- group: 여럿이/단체/팀플/모임\n"
        "- solo: 혼자 가는 곳\n"
        "- large: 넓거나 좌석이 많은 곳\n"
        "- quiet: 조용한 곳 (\"사람 없는\", \"한적한\", \"붐비지 않는\", \"차분한\"도 quiet)\n"
        "- lively: 활기차고 시끌벅적한 곳\n"
        "- dessert: 디저트·빵·케이크를 원함\n"
        "- decaf: 디카페인\n"
        "- vibe: 분위기 좋은/감성/무드 있는 카페를 원함 (\"분위기 좋은\", \"감성 카페\", \"분위기 있는\")\n"
        "- franchise: 프랜차이즈·체인 카페를 원함\n"
        "- indie: 프랜차이즈가 아닌 개인·동네 카페를 원함 (\"프랜차이즈 말고\", \"개인 카페\")\n"
        "- sort: 정렬 선호. 질문에 있을 때만 \"reviews\"(리뷰·후기 많은/인기), \"distance\"(가까운), \"rating\"(별점·평점 높은) 중 하나, 아니면 null\n"
        "- words: 질문에 나온 구체적인 메뉴·분위기 단어(예: 티라미수, 아인슈페너, 감성, 테라스), 최대 4개, 없으면 []\n"
        f"현재: {'월화수목금토일'[now.weekday()]}요일 {now:%H:%M}\n"
        f"질문: {json.dumps(query, ensure_ascii=False)}\n"
        '출력 형식: {"open_now":null,"late":null,"early":null,"work":null,"outlets":null,"wifi":null,"group":null,'
        '"solo":null,"large":null,"quiet":null,"lively":null,"dessert":null,"decaf":null,"vibe":null,"franchise":null,"indie":null,"sort":null,"words":[]}'
    )
    text = call_llm(prompt).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    return clean_flags(json.loads(text))


# ------------------------------------------------------- 2) LLM 랭킹
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
# 모델 자동 선택 우선순위 (내 키로 쓸 수 있는 것 중 앞에서부터). 무료 한도·모델명은 자주 바뀌어서 404면 자동으로 찾아 써요.
MODEL_PREFERENCE = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash",
                    "gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
_model = {"name": GEMINI_MODEL, "switched": False}
LLM_MODE = os.environ.get("LLM_MODE", "translate").strip()   # translate: LLM은 질문을 조건으로 번역만(빠름, 기본) / rank: LLM이 카페 데이터 전체를 보고 순위 결정(느림)
THINK_LEVELS = ["minimal", "low", None]   # 번역만 하면 되니 '생각'을 최소로. 모델이 거부(400)하면 한 단계씩 낮춰요 (마지막은 설정 없이)
_cfg = {"think": 0}
LLM_TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "12"))   # 초. 이 시간 안에 못 받으면 키워드 매칭으로 바로 대체해요


def _gemini(prompt, model):
    gen = {"temperature": 0, "responseMimeType": "application/json", "maxOutputTokens": 300}    # 조건 JSON 한 줄이면 충분해서 출력을 짧게 제한
    lvl = THINK_LEVELS[_cfg["think"]]
    if lvl:
        gen["thinkingConfig"] = {"thinkingLevel": lvl}
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
    for _ in range(4):
        try:
            return _gemini(prompt, _model["name"])
        except urllib.error.HTTPError as e:
            if e.code == 400 and _cfg["think"] < len(THINK_LEVELS) - 1:   # 이 모델이 그 thinkingLevel 을 모르면 한 단계 낮춰서 다시
                _cfg["think"] += 1
                print(f"[LLM] 400 → thinking 설정 {THINK_LEVELS[_cfg['think']]} 로 다시 시도", file=sys.stderr)
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



# ------------------------------------------------------- 실패·대체 안내 (CUBIG OT 제안: 못 찾았을 때 줄글 2~3줄로 알려주기)
_NOT_MENU = {"콘센트", "와이파이", "자리", "좌석", "단체석", "주차", "화장실", "공간", "카페", "곳", "장소", "분위기", "메뉴", "음료", "커피"}


def _eul(w):
    """받침이 있으면 '을', 없으면 '를'."""
    c = ord(w[-1]) if w else 0
    return "을" if 0xAC00 <= c <= 0xD7A3 and (c - 0xAC00) % 28 else "를"


def _corpus(cafes):
    parts = []
    for c in cafes:
        m, a, s = c.get("menu") or {}, c.get("atmosphere") or {}, c.get("seating") or {}
        parts += [" ".join(map(str, _list(m.get(k)))) for k in ("desserts", "drinks", "signature")]
        parts += [" ".join(map(str, _list(a.get("tags")))), str(a.get("note") or ""), str(s.get("note") or "")]
        parts += [str(v) for v in (c.get("extra") or {}).values()]
    return " ".join(parts).lower()


def asked_terms(query, flags):
    """질문에서 '이걸 파는 곳' 처럼 구체적으로 찾은 메뉴·분위기 단어 후보."""
    terms = [w for w in (flags.get("words") or []) if len(w) >= 2]
    for m in re.finditer(r"([가-힣A-Za-z0-9]{2,}?)\s*(?:을|를)?\s*(?:파는|팔고|판매|있는|먹을|마실)", query):
        w = m.group(1)
        if len(w) > 2 and w[-1] in "을를":        # '샌드위치를' → '샌드위치'
            w = w[:-1]
        if w not in STOPWORDS and w not in _NOT_MENU and w not in terms:
            terms.append(w)
    return terms


def suggest_queries(query, flags):
    """맞는 카페가 5곳보다 적을 때, 빈 자리 대신 보여줄 '이렇게 검색해 보세요' 추천."""
    pool = (["빵 파는 카페", "케이크 있는 카페", "디저트 있는 카페"] if flags.get("dessert") else []) + \
           ["분위기 좋은 카페", "콘센트 있는 조용한 카페", "지금 영업 중인 카페", "디저트 있는 카페", "늦게까지 하는 카페", "프랜차이즈 말고 개인 카페"]
    out = []
    for q in pool:
        if q != query.strip() and q not in out:
            out.append(q)
    return out[:3]


def build_guide(query, flags, understood, results, cafes):
    """정확히 맞는 곳이 없을 때 쉬운 말로 2~3줄 안내. 결과가 정상이면 빈 문자열."""
    q = query.lower()
    if not results:
        if flags.get("open_now") or flags.get("late") or flags.get("early"):
            return ("조건에 맞는 카페를 찾지 못했어요.\n지금은 영업 중인 곳이 적어서일 수 있어요.\n'지금'이나 시간 조건을 빼고 다시 물어봐 주세요.")
        return ("조건에 맞는 카페를 찾지 못했어요.\n조건이 많으면 맞는 곳이 없을 수 있어요.\n한두 가지만 남겨서 다시 물어봐 주세요. 예: ‘콘센트 있는 조용한 카페’")
    corpus, missing = _corpus(cafes), []
    for t in asked_terms(query, flags):
        if t.lower() not in corpus:
            missing.append(t)
    if not missing:
        return ""
    t = missing[0]
    line1 = f"정확히 ‘{t}’{_eul(t)} 파는 곳은 찾지 못했어요."
    chips = [u for u in understood if not u.startswith(("📍", "이번 질문과 달라"))]
    if flags.get("dessert"):
        line2 = "대신 디저트류를 판매하는 카페를 찾았어요."
    elif chips:
        line2 = f"대신 ‘{' · '.join(chips[:3])}’ 조건에 가까운 카페를 찾았어요."
    else:
        line2 = "대신 이 근처에서 평가가 좋은 카페를 보여드려요."
    return f"{line1}\n{line2}\n메뉴는 바뀔 수 있으니 가기 전에 카페에 확인해 보세요."


# ------------------------------------------------------- 빠른 길: 규칙만으로 질문이 다 설명되면 LLM 을 건너뛰어요 (응답 즉시)
RULE_TRIGGERS = ('1인', '24시', 'wifi', '가까', '가깝', '감성', '개인 운영', '개인 카페', '개인운영', '개인카페', '거리', '고요', '공부', '과제', '넓', '노트북', '늦게', '단체', '대형', '독립 카페', '동네 카페', '동네카페', '디저트', '디카페인', '떠들', '레포트', '리뷰', '리포트', '마카롱', '모닝', '모임', '무드', '밤', '베이커리', '별점', '분위기 맛집', '분위기 예쁜', '분위기 이쁜', '분위기 있', '분위기 좋', '분위기있', '분위기좋', '붐비지', '브런치', '빵', '사람 없', '사람없', '새벽', '수다', '스콘', '스터디', '시끌', '심야', '아침', '야간', '여럿', '영업 중', '영업중', '와이 파이', '와이파이', '와파', '유명', '인기', '일찍', '작업', '조용', '지금', '집중', '차분', '체인', '친구들', '카공', '케이크', '코딩', '콘센트', '쿠키', '팀플', '평가 좋', '평점', '프랜차이즈', '프차', '한적', '현재', '혼공', '혼밥', '혼자', '활기', '후기')
_FILLER = {"카페", "카페에서", "카페를", "카페가", "카페는", "곳", "곳이", "말고", "아닌", "빼고", "제외", "없는", "아니", "같은", "하는", "되는", "있고", "많고", "좋고", "중인", "으로", "에서", "정도", "위주", "쪽에", "하기", "까지", "추천해줘", "추천해", "추천해주세요", "알려주세요", "찾아줘요", "좋은데", "있나요", "있어요", "있을까", "있을까요", "싶은데", "갈만한", "가볼만한"}
_JOSA = re.compile(r"(이|가|을|를|은|는|에|도|만|의|로|으로|에서)$")


def rule_explains(query):
    """규칙(rule_parse)이 질문의 모든 단어를 이해했는지. 메뉴 이름 같은 낯선 단어가 남으면 False → LLM 에게 물어봐요."""
    q = query.lower()
    for w in sorted(RULE_TRIGGERS, key=len, reverse=True):
        q = q.replace(w, " ")
    for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", q):
        t2 = _JOSA.sub("", t) if len(t) > 2 else t
        if t in STOPWORDS or t2 in STOPWORDS or t in _FILLER or t2 in _FILLER:
            continue
        return False
    f = rule_parse(query)
    return any(f.get(k) for k in FLAG_KEYS) or bool(f.get("sort"))


def search(query, here=None, sort=None, taste=None):
    """sort: 이용자가 고른 정렬. 'distance'(거리순) / 'recommend'(추천순). None 이면 질문에서 읽은 선호를 따라요.
    taste: 로그인 회원이 가입 때 고른 취향 {섹션: [항목 id]} (LLM 이 순위를 정하는 rank 모드에서는 쓰지 않아요)."""
    now = datetime.now(KST)
    allc = [c for c in load_cafes() if has_info(c)]
    if not allc:
        return {"results": [], "source": "keyword",
                "notice": "카페 데이터가 비어 있어요. data/cafes.json을 채워 주세요."}
    # 지금(한국 시간) 영업이 끝났거나 쉬는 날인 곳은 추천에서 빼요. 영업시간을 모르는 곳은 남겨요.
    cafes = [c for c in allc if is_open_now(c.get("hours") or {}, now) is not False]
    q = query.strip().lower()
    base = (re.sub(r"\s+", " ", q), CAFES_PATH.stat().st_mtime)
    if LLM_MODE == "rank" and GEMINI_API_KEY:     # LLM 이 순위까지 정하는 모드: 영업 상황이 바뀌니 분 단위로만 캐시
        key = base + (now.strftime("%Y%m%d%H%M"),)
        if key in _cache:
            return _cache[key]
        try:
            payload = {"results": llm_rank(query, cafes), "source": "llm", "notice": "", "understood": [], "sort": "recommend"}
            _cache[key] = payload
            return payload
        except Exception as e:
            print("[search] LLM 랭킹 실패 → 키워드로:", repr(e), file=sys.stderr)

    # 질문 → 조건 (LLM 번역은 캐시, 순위는 매번 새로 계산: 영업 중인 곳이 시간에 따라 바뀌니까)
    if base in _cache:
        flags, source, notice = _cache[base]
        flags = dict(flags)
    else:
        flags, source, notice = None, "keyword", ""
        if GEMINI_API_KEY and rule_explains(query):         # 규칙으로 충분히 이해되는 질문은 LLM 없이 바로 (속도)
            flags, source = rule_parse(query), "rule"
        elif GEMINI_API_KEY:
            try:
                flags = llm_parse(query)
                flags["sort"] = flags["sort"] or rule_sort(q)   # LLM이 놓친 정렬 선호는 규칙이 보충
                if any(flags.get(k) for k in FLAG_KEYS) or flags["words"] or flags["sort"]:
                    source = "llm"
                else:
                    flags = None    # LLM이 아무 조건도 못 뽑았으면 규칙으로
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
        flags = flags or rule_parse(query)
        if source in ("llm", "rule") or not GEMINI_API_KEY:  # 실패 결과는 캐싱하지 않음
            if len(_cache) > 200:
                _cache.clear()
            _cache[base] = (dict(flags), source, notice)

    if sort == "distance":
        flags["sort"] = "distance"
    elif sort == "recommend":
        flags["sort"] = None
    if flags.get("franchise") and flags.get("indie"):      # 둘 다 오면 서로 모순이라 둘 다 무시
        flags["franchise"] = flags["indie"] = None
    understood = describe_flags(flags)
    safe = ""
    all_cafes = cafes
    if flags.get("vibe"):           # '분위기 좋은': 분위기 태그 8개 중 하나라도 있는 카페만 (하나도 없으면 필터 없이 보여줘요)
        v = [c for c in cafes if vibe_hits(c)]
        if v:
            cafes = v
        else:
            safe = "분위기 태그가 있는 카페를 찾지 못해 조건 없이 보여드려요"
    if flags.get("franchise") or flags.get("indie"):
        want = bool(flags.get("franchise"))
        fr = [c for c in cafes if is_franchise(c) == want]
        if fr:
            cafes = fr
        else:
            safe = (safe + " · " if safe else "") + ("프랜차이즈" if want else "개인 카페") + " 조건에 맞는 곳이 없어 조건을 풀었어요"
    taste, tf = clean_taste(taste), None
    if taste:       # 회원 취향(보조): 질문 조건과 따로 점수를 매겨 절반만 합치고, '꼭 필요'가 없다고 확인된 곳만 빼요
        kept = [c for c in cafes if not any(_lacks(c, i) for i in taste.get("must", []))]
        if len(kept) >= MAX_RESULTS:
            cafes = kept
        else:
            safe = (safe + " · " if safe else "") + "취향의 '꼭 필요' 조건에 맞는 곳이 적어서 이번에는 조건을 풀었어요"
        tf, chip, dropped = apply_taste(flags, taste)
        understood += ([chip] if chip else []) + ([f"이번 질문과 달라 뺀 취향 · {', '.join(dropped)}"] if dropped else [])
    results, note = rank_by_flags(flags, cafes, here, tf)
    notice = " · ".join(x for x in (notice, safe, note) if x) or ("" if results else "지금 영업 중이면서 조건에 맞는 카페를 찾지 못했어요")
    guide = build_guide(query, flags, understood, results, all_cafes)
    return {"results": results, "source": source, "notice": notice, "understood": understood, "guide": guide,
            "suggest": suggest_queries(query, flags) if (len(results) < MAX_RESULTS or guide) else [],
            "sort": "distance" if flags.get("sort") == "distance" else "recommend"}


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
    # JS 키·anon 키는 원래 브라우저에 공개되는 키 (도메인 등록·RLS 로 보호)
    return 200, {"kakaoKey": KAKAO_JS_KEY, "supabaseUrl": SUPABASE_URL, "supabaseKey": SUPABASE_ANON_KEY}


def api_search(raw, length, ip="local"):
    if length > 4000:
        return 413, {"error": "요청이 너무 커요"}
    try:
        body = json.loads(raw or b"{}")
        query = str(body.get("query", "")).strip()
    except Exception:
        return 400, {"error": "잘못된 요청"}
    here = None
    try:
        lat, lng = float(body["lat"]), float(body["lng"])          # 앱이 보낸 현재 위치 (선택)
        if _dist_m(CENTER[1], CENTER[0], lat, lng) < 30000:         # 안암 30km 밖이면 무시 (엉뚱한 값 방지)
            here = (lat, lng)
    except (KeyError, TypeError, ValueError):
        pass
    if not query:
        return 400, {"error": "검색어를 입력해주세요"}
    if rate_limited(ip):
        return 429, {"error": "요청이 너무 많아요. 잠시 후 다시 시도해주세요"}
    try:
        return 200, search(query[:200], here, body.get("sort") if body.get("sort") in ("distance", "recommend") else None, body.get("taste"))
    except Exception as e:
        print("[search error]", repr(e), file=sys.stderr)
        return 500, {"error": f"검색 중 오류: {e}"}


# ------------------------------------------------------------------ 카페 상세에서 이어서 질문하기 ("여기 말차라떼도 팔아?")
# 그 카페 1곳의 데이터만 보고 답해요. 데이터에 없으면 "확인되지 않았어요"라고 말해요 (지어내지 않음).
_ENDINGS = re.compile(r"(에서는|에서도|에서|이랑|이나|이면|으로|도|은|는|이|가|을|를|에|랑|나|야|요|까|니|도|만|좀)$")
_ASK_STOP = {"여기", "거기", "이곳", "있나", "있어", "있나요", "있어요", "팔아", "팔아요", "되나", "되나요", "되나요", "가능", "가능해",
             "가능한가요", "알려줘", "알려", "어때", "어떄", "카페", "혹시", "그리고", "또", "그럼", "하나요", "해요", "해", "돼", "돼요", "있니"}


def _cafe_text(c):
    m, a, s, e = c.get("menu") or {}, c.get("atmosphere") or {}, c.get("seating") or {}, c.get("extra") or {}
    parts = [*_list(m.get("signature")), *_list(m.get("desserts")), *_list(m.get("drinks")), *_list(a.get("tags")),
             str(a.get("note") or ""), str(s.get("note") or ""), str(s.get("outlet_note") or "")]
    parts += [f"{k} {v}" for k, v in e.items()]
    return [p for p in parts if p]


def rule_answer(c, q):
    """키워드 규칙으로 답하기 (AI 키가 없거나 실패했을 때)."""
    h, s, e, a = c.get("hours") or {}, c.get("seating") or {}, c.get("extra") or {}, c.get("atmosphere") or {}
    sm = summarize(c)
    name = c.get("name", "이 카페")
    if re.search(r"영업|열었|열어|닫|몇\s*시|언제까지|마감|오픈|휴무|쉬", q):
        op = is_open_now(h)
        now = "지금은 영업 중이에요. " if op is True else "지금은 영업 시간이 아니에요. " if op is False else ""
        return (now + (sm.get("hours") or "영업시간 정보가 아직 없어요") + (f" ({h['note']})" if h.get("note") else ""))[:220]
    for pat, key, label in ((r"콘센트|충전", "outlets", "콘센트"),):
        if re.search(pat, q):
            return f"{label}는 '{s['outlets']}'로 정리돼 있어요." + (f" {s['outlet_note']}" if s.get("outlet_note") else "") if s.get(key) else "콘센트 정보는 아직 확인되지 않았어요."
    if re.search(r"좌석|자리|단체|넓|인원|몇\s*명", q):
        return sm.get("seating") or "좌석 정보는 아직 확인되지 않았어요."
    if re.search(r"조용|시끄|소음|분위기", q):
        return (sm.get("atmosphere") or "분위기 정보는 아직 확인되지 않았어요.")
    for key, pat in (("주차", r"주차"), ("와이파이", r"와이파이|wifi|와이"), ("예약", r"예약"), ("반려동물", r"반려|강아지|고양이|동물"),
                     ("포장·배달", r"포장|배달|테이크"), ("디카페인", r"디카페인"), ("아메리카노 가격", r"가격|얼마|아메리카노")):
        if re.search(pat, q, re.I):
            return f"{key}: {e[key]}" if e.get(key) else f"{key} 정보는 아직 확인되지 않았어요."
    toks = []
    for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", q):
        t = _ENDINGS.sub("", t)
        if len(t) >= 2 and t not in _ASK_STOP:
            toks.append(t)
    text = _cafe_text(c)
    for t in toks:
        hit = [x for x in text if t in x]
        if hit:
            return f"'{t}' 관련해서 데이터에 이렇게 있어요: {_label(hit[0]) if len(hit[0]) > 30 else hit[0]}"[:220]
    if toks:
        return f"'{toks[0]}' 정보는 이 카페 데이터에서 확인되지 않았어요. 매장에 직접 문의해 보세요."
    return "무엇이 궁금하세요? 영업시간, 좌석, 메뉴처럼 물어봐 주세요."


def _clean_history(v):
    """앱이 보낸 이전 질문·답 (최대 4턴). 형식이 이상하면 버려요."""
    out = []
    if isinstance(v, list):
        for t in v[-4:]:
            if isinstance(t, dict):
                hq, ha = str(t.get("q", "")).strip()[:200], str(t.get("a", "")).strip()[:200]
                if hq and ha:
                    out.append((hq, ha))
    return out


def llm_answer(c, q, hist=()):
    data = {"이름": c.get("name"), "주소": c.get("address"), "영업시간": c.get("hours"), "좌석": c.get("seating"),
            "메뉴": c.get("menu"), "분위기": c.get("atmosphere"), "부가정보": c.get("extra")}
    ctx = ""
    if hist:      # 같은 카페에서 앞서 나눈 대화 → 한 번의 대화처럼 이어서 답해요
        ctx = ("[이전 대화] (맥락 파악용이에요. 사실 근거는 항상 [카페 데이터]만 써)\n"
               + "\n".join(f"손님: {hq}\n도우미: {ha}" for hq, ha in hist) + "\n")
    prompt = ("너는 카페 안내 도우미야. 아래 [카페 데이터]에 있는 내용만 근거로 질문에 한국어로 1~2문장, 친근한 존댓말로 답해.\n"
              "[이전 대화]가 있으면 이어서 답하고, '거기', '그럼', '그건'처럼 앞 대화를 가리키는 말은 그 맥락으로 이해해.\n"
              "데이터에 없으면 지어내지 말고 '데이터에서 확인되지 않았어요. 매장에 문의해 보세요'라고 답해. 현재 시각은 "
              f"{datetime.now(KST).strftime('%H:%M')}이야.\n[카페 데이터]\n{json.dumps(data, ensure_ascii=False)[:3500]}\n"
              f"{ctx}[질문]\n{q}\n\nJSON으로만 답해: {{\"answer\": \"...\"}}")
    out = json.loads(call_llm(prompt))
    ans = str(out.get("answer", "")).strip()
    if not ans:
        raise ValueError("빈 답변")
    return ans[:300]


def api_ask(raw, length, ip="local"):
    if length > 12000:       # 이전 대화(최대 4턴)가 같이 와서 다른 API보다 넉넉해요
        return 413, {"error": "질문이 너무 길어요"}
    try:
        d = json.loads(raw or b"{}")
        assert isinstance(d, dict)
    except Exception:
        return 400, {"error": "잘못된 요청"}
    q = str(d.get("question", "")).strip()[:200]
    if not q:
        return 400, {"error": "질문을 입력해주세요"}
    cafe = next((c for c in load_cafes() if str(c["id"]) == str(d.get("cafe_id"))), None)
    if not cafe:
        return 400, {"error": "카페를 찾을 수 없어요"}
    if rate_limited(ip, "ask", 20):
        return 429, {"error": "요청이 너무 많아요. 잠시 후 다시 시도해주세요"}
    source = "rule"
    hist = _clean_history(d.get("history"))
    try:
        if not GEMINI_API_KEY:
            raise RuntimeError("no key")
        ans, source = llm_answer(cafe, q, hist), "llm"
    except Exception as e:
        if GEMINI_API_KEY:
            print("[ask] AI 실패 → 규칙 답변:", repr(e), file=sys.stderr)
        ans = rule_answer(cafe, q)
    return 200, {"answer": ans, "source": source}


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
    if d.get("vote") in ("up", "down"):        # 👍/👎 의견: 기록만 하고 검색 결과에는 영향을 주지 않아요
        cafe = next((c for c in load_cafes() if str(c["id"]) == str(d.get("cafe_id"))), None)
        if not cafe:
            return 400, {"error": "카페를 찾을 수 없어요"}
        if rate_limited(ip, "feedback", 20):
            return 429, {"error": "요청이 너무 많아요. 잠시 후 다시 시도해주세요"}
        reasons = [r for r in (d.get("reasons") if isinstance(d.get("reasons"), list) else []) if r in FEEDBACK_FIELDS][:7]
        text = str(d.get("text", "")).strip()[:300] if "etc" in reasons else ""
        rec = {"ts": datetime.now(KST).isoformat(timespec="seconds"), "type": "vote", "vote": d["vote"], "cafe_id": cafe["id"], "cafe_name": cafe.get("name", ""),
               "reasons": reasons, "reason_labels": [FEEDBACK_FIELDS[r] for r in reasons], "text": text, "query": str(d.get("query", "")).strip()[:100]}
        return 200, {"ok": True, "stored": store_feedback(rec)}
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

    def end_headers(self):                  # 로컬 개발: 화면 파일을 브라우저가 기억하지 않게 (고치면 새로고침만으로 반영)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
        route = {"/api/search": api_search, "/api/feedback": api_feedback, "/api/ask": api_ask}.get(self.path.split("?")[0])
        if not route:
            return self._json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        status, obj = route(self.rfile.read(min(n, 12001)), n, self.client_address[0])
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
