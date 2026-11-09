# 안암 카페 챗 (MVP)

문장으로 물어보면 → 후보 최대 5곳(영업시간·좌석·메뉴·분위기 키워드 포함) → 하나 고르면 지도에 핀으로 표시.
Python 표준 라이브러리만 사용 (`pip install` 없음), 지도는 카카오맵 (JavaScript 키 필요).

## 1. 실행

```bat
:: Windows (cmd)
copy .env.example .env
set CAFES_PATH=data/cafes.sample.json
python server.py
```
```bash
# 맥/리눅스
cp .env.example .env
CAFES_PATH=data/cafes.sample.json python3 server.py
```
→ http://127.0.0.1:8000  (Windows에서 `python`이 안 되면 `py server.py`)
- 폰에서 보려면: `HOST=0.0.0.0 python3 server.py` 후 같은 와이파이에서 `http://<내 PC IP>:8000`
- 인터넷이 필요해요: 카카오맵 SDK와 폰트를 불러와요. 시연 장소 와이파이를 미리 확인하세요.

## 2. 해야 할 일 (★ 표시)

| 할 일 | 위치 |
|---|---|
| ★ 카페 10곳 데이터 채우기 | `data/cafes.json` (지금은 빈 칸 10개) |
| ★ 카카오 JavaScript 키 입력 (필수, 없으면 지도가 안 떠요) | `.env` 의 `KAKAO_JS_KEY` |
| ★ 카카오 REST API 키 입력 (상호명 → 좌표 자동 조회, 공란이면 좌표를 직접 적어야 해요) | `.env` 의 `KAKAO_REST_KEY` |
| ★ LLM API 키 입력 (비워도 동작: 키워드 매칭 모드) | `.env` 의 `GEMINI_API_KEY` |
| ★ 무료로 쓸 수 있는 모델명 확인 | `.env` 의 `GEMINI_MODEL` (무료 한도·모델명은 바뀌어요) |
| 안암역 좌표/지도 중심 | `public/app.js` 맨 위 `STATION` |

데이터를 다 채우면 `CAFES_PATH` 없이 `python3 server.py` 만 실행하면 돼요.
`cafes.json`은 수정하면 서버 재시작 없이 바로 반영돼요. 내용이 비어 있는 칸은 검색 대상에서 자동으로 빠져요.

## 3. 팀 시트(TSV/CSV)로 채우기 — 변환기

팀이 만든 75열 시트를 그대로 변환해요. (구글시트 → 파일 → 다운로드 → TSV 또는 CSV)
```bat
python tools/import_sheet.py 시트.tsv
```
- `data/cafes.json` 이 만들어져요. 기존 파일은 `cafes.backup.json` 으로 백업돼요.
- 시트의 '예시' 행은 자동으로 건너뛰어요.
- 같은 항목이 일반 열과 `(리뷰)` 열에 둘 다 있으면 값이 있는 쪽을 써요. 리뷰 열을 우선해요 (`PREFER_REVIEW` 로 바꿀 수 있어요).
- 서버가 쓰지 않는 열(건축물대장 면적, 수집자 등)은 버려요. 가격·주차·예약·단점 등은 `extra` 로 들어가서 AI 추천 근거로만 쓰여요.
- **좌표는 시트에 안 적어도 돼요.** `.env` 에 `KAKAO_REST_KEY=` (카카오 개발자 콘솔의 **REST API 키**, JavaScript 키와 다른 키)를 넣으면
  서버가 상호명으로 카카오 로컬 API를 검색해서 좌표를 채우고, 결과는 `data/geocode_cache.json` 에 저장해요(다음부터는 조회 안 함).
  - 안암역 반경 2km 안에서만 검색하고, 같은 이름이 여러 곳이면 시트의 주소와 맞는 지점을 골라요. 이름으로 못 찾으면 주소로 다시 찾아요.
  - 엉뚱한 곳에 찍히면 시트에 `위도`,`경도` 열을 직접 적으세요. 그 값이 항상 우선이에요.
  - 키가 없으면 좌표가 빈 카페는 목록에는 나와도 지도에 핀이 안 찍혀요.

## 3-1. 데이터 칸 (카페 1곳, JSON 직접 작성할 때)

```json
{
  "id": 1, "name": "카페 이름", "address": "서울 성북구 안암로 ...",
  "lat": 37.58, "lng": 127.02,
  "hours":      { "open": "09:00", "close": "23:00", "closed_days": ["일"], "note": "" },
  "seating":    { "tables": [{"type": "4인 테이블", "count": 5}, {"type": "1인 바석", "count": 6}],
                  "total_seats": 28, "size": "중형", "outlets": "많음", "outlet_note": "", "note": "" },
  "menu":       { "desserts": ["티라미수", "스콘"], "drinks": ["아메리카노", "라떼"], "signature": ["대표 메뉴"] },
  "atmosphere": { "noise": "조용", "tags": ["우드톤", "아늑함"], "note": "" },
  "extra":      { "아메리카노 가격": "4,500원", "주차": "불가" }
}
```
키워드 매칭 모드가 인식하는 값 (LLM 모드에서는 자유롭게 써도 돼요):
- `size`: 소형 / 중형 / 대형
- `outlets`: 많음 / 보통 / 적음 / 없음
- `noise`: 조용 / 보통 / 활기 / 시끌 (`조용함`처럼 뒤에 글자가 붙어도 인식해요)
- 자정 넘어 영업은 `close`에 `"02:00"` 또는 `"24:00"`처럼 적어요.
- 좌표(`lat`,`lng`)는 카카오맵/구글맵에서 장소 우클릭으로 복사하면 돼요. 좌표가 비면 지도에 핀이 안 찍혀요.

## 4. 동작 방식 (LLM은 '번역기', 찾기는 코드가)

```
질문 ──(LLM이 번역, 카페 데이터는 안 보냄)──> 검색 조건  {quiet, outlets, late, dessert, words:[티라미수] ...}
     ──(코드가 cafes.json과 매칭·점수)──────> 상위 5곳 + 근거 키워드
     LLM 실패 / 키 없음 / 한도 초과 → 규칙(키워드)이 같은 조건으로 번역해서 같은 방식으로 찾음
```
- 예: "사람 없는 카페" → `quiet` → 소음이 "조용"인 카페가 위로 와요.
- 화면에는 LLM이 해석한 조건이 "이렇게 이해했어요" 칩으로 나와요 (`understood`).
- LLM에는 질문 한 줄만 보내서 호출이 짧고 빨라요. 이전 방식(데이터 전체를 보고 순위 결정)은 `.env` 에 `LLM_MODE=rank` 로 쓸 수 있어요.
- 조건 종류는 `cafe_core.py` 의 `FLAG_LABELS` (지금 영업 중, 늦게까지, 아침 일찍, 작업·공부, 콘센트, 단체, 혼자, 넓은 좌석, 조용함, 활기참, 디저트, 디카페인 + 메뉴·분위기 단어). 새 조건을 늘리려면 `FLAG_LABELS`, `rule_parse`, `llm_parse`의 설명, `rank_by_flags`의 점수 규칙 4곳을 같이 고쳐요.
- 같은 질문은 캐싱돼요. 시연용 질문 몇 개는 미리 한 번씩 눌러 두세요.
- LLM을 바꾸려면 `cafe_core.py` 의 `call_llm()` 함수만 교체하면 돼요.
- 화면 상단의 "키워드 매칭 모드예요" 안내는 개발용이에요. 발표 전에 `notice`를 숨기면 돼요.

## 5. 구조

```
server.py            # 로컬 실행용 (python server.py)
cafe_core.py         # 검색 로직 전부 (AI 호출, 키워드 매칭, 좌표 조회)
public/index.html    # 화면 뼈대(지도·시트·검색창·출처 줄)
public/styles.css    # ★ 디자인 값(:root 토큰)과 화면별 스타일
public/app.js        # 문구·출처·화면(V.*)·동작
api/*.py, vercel.json  # Vercel 배포용 (로컬 실행에는 안 써요)
tools/import_sheet.py  # 팀 시트 → data/cafes.json 변환기
data/cafes.json      # ★ 채울 데이터 (빈 칸)
data/cafes.sample.json  # 동작 확인용 샘플 10곳
```

## 6. 알려둘 점
- 검증한 것: 서버 API, LLM 응답 파싱과 오류 시 대체(모킹), 바텀시트 스와이프·카드·핀·뒤로가기(브라우저 자동 테스트).
- 아직 안 해본 것: 실제 Gemini 호출, 실제 카카오맵 렌더링 (제 작업 환경에서 외부 접속이 막혀 있어서 카카오 SDK는 가짜로 대체해 시험했어요). 첫 실행 때 지도가 안 뜨면 키·도메인 등록·인터넷을 확인해 주세요.
- 카카오 개발자 콘솔에서 꼭 설정할 것 (안 하면 지도가 빈 화면):
  1. 제품 설정 → 카카오맵 → **사용 설정 ON**
  2. 플랫폼의 **JavaScript SDK 도메인**에 `http://127.0.0.1:8000`, `http://localhost:8000` 등록 (폰이나 배포 주소로 접속하면 그 주소도 등록)
- 마커 모양은 `public/app.js` 의 `markerEl()` 과 `styles.css`(`.dot`, `.pin`, `.pin.sel`)에서 바꿔요.

## 7. Vercel로 배포 (링크로 접속)

로컬 서버(`server.py`)는 Vercel에서 쓰지 않아요. 대신 `api/` 폴더의 함수 3개가 같은 로직(`cafe_core.py`)을 실행해요.

**배포 전 준비**
1. `data/cafes.json` 을 채웠는지 확인해요.
2. 좌표를 배포 전에 만들어 둬요. Vercel에서는 파일을 저장할 수 없어서, 로컬에서 `KAKAO_REST_KEY` 를 넣고 서버를 한 번 켜서 `data/geocode_cache.json` 이 생기게 해 두거나, 시트에 `위도`,`경도` 를 직접 적어요.
3. `.env` 는 올라가지 않아요 (`.vercelignore`). 키는 아래처럼 Vercel에 따로 넣어요.

**배포 (Windows cmd, Node.js 설치 필요)**
```bat
npm i -g vercel
vercel login
vercel
```
처음 `vercel` 실행 때 질문은 기본값(엔터)으로 답하고, 프로젝트 이름만 정해요. 그 다음 키를 넣고 운영 배포를 해요.
```bat
vercel env add GEMINI_API_KEY production
vercel env add KAKAO_JS_KEY production
vercel env add GEMINI_MODEL production      (선택: 예 gemini-3.1-flash-lite)
vercel --prod
```
`vercel env add` 를 하면 값을 붙여 넣으라고 물어봐요. 환경변수를 바꾼 뒤에는 `vercel --prod` 를 다시 해야 반영돼요.

**카카오 도메인 등록 (필수, 안 하면 지도가 빈 화면)**
`vercel --prod` 가 알려 주는 주소(`https://프로젝트이름.vercel.app`)를 카카오 개발자 콘솔의 JavaScript SDK 도메인에 추가해요. 프리뷰 주소(`vercel` 만 실행했을 때)는 매번 달라서, 시연은 항상 `--prod` 주소로 해요.

**알아둘 점**
- 링크를 아는 누구나 접속해서 무료 AI 한도를 쓸 수 있어요. IP당 분당 30회 제한이 있지만(`RATE_LIMIT_PER_MIN`), 서버가 여러 개로 나뉘면 정확하지 않아요. 링크는 필요한 사람에게만 알려요.
- 카페 데이터(`data/cafes.json`)를 고치면 다시 `vercel --prod` 해야 반영돼요.
- 함수는 한 번 안 쓰면 잠들어서 첫 검색이 조금 느릴 수 있어요. 발표 전에 한 번 눌러 두세요.
- 검색 결과 캐시는 서버 메모리라서 배포 환경에서는 가끔 사라질 수 있어요.

## 8. 디자인 시안 교체 가이드 (Figma → 코드)

| 화면 | `app.js` 함수 | `styles.css` 구역 |
|---|---|---|
| 홈 | `V.home` | 화면 1 |
| 검색 중 / 결과 목록 / 카드 | `V.loading` `V.results` `V.card` | 화면 2·3 |
| 결과 없음·오류 | `V.error` | 화면 2·3 |
| 카페 상세 (사진·출처 포함) | `V.detail` `V.photos` | 화면 5 |
| 정보 수정 제안 / 완료 | `V.feedback` `V.feedbackDone` | 화면 6 |
| 데이터·출처 안내 | `V.sources` (내용은 `SOURCES`) | 화면 7 |
| 하단 출처 줄 | `TEXT.footLine` | `.foot` |

- 색·글자 크기·둥글기·여백은 `styles.css` 맨 위 `:root` 한 곳만 바꾸면 전체에 적용돼요.
- 문구, 예시 질문 칩, 출처 설명은 `app.js` 맨 위 `TEXT` `EXAMPLES` `SOURCES` `DATA_UPDATED`.
- 화면 구조를 바꿀 때는 `data-` 속성(`data-back`, `data-home`, `data-feedback`, `data-id`, `data-chip` …)만 유지하면 동작이 그대로 연결돼요.

## 9. 사진·정보 수정(피드백)

- **사진**: 시트에 `사진1 URL`, `사진1 출처`(원문 링크), `사진1 표기`(예: 직접 촬영), `사진2 …` 열을 추가하고 변환기를 다시 실행해요. **출처 또는 표기가 없는 사진은 화면에 안 나와요.** 팀이 직접 찍은 사진은 `public/photos/x.jpg` 에 두고 URL을 `/photos/x.jpg` 로 적어요.
- **정보 수정 제안**은 `/api/feedback` 으로 들어와요. 저장 위치:
  - `FEEDBACK_WEBHOOK_URL` 을 설정하면 그 주소로 POST (구글 시트 연결: Apps Script `doPost(e)` 에서 `JSON.parse(e.postData.contents)` 를 `appendRow`, 웹 앱으로 배포).
  - 설정이 없으면 로컬은 `data/feedback.jsonl`, Vercel은 함수 로그(Logs)에만 남아요.
