# ㅇㄷ로 (MVP)

문장으로 물어보면 → 후보 최대 5곳(영업시간·좌석·메뉴·분위기 키워드 포함) → 하나 고르면 지도에 핀으로 표시.
Python 표준 라이브러리만 사용 (`pip install` 없음), 지도는 카카오맵 (JavaScript 키 필요).



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
public/index.html    # 화면 뼈대(지도·시트·표지판 입력창)
public/styles.css    # ★ 디자인 값(:root 토큰)과 화면별 스타일
public/app.js        # 문구·출처·화면(V.*)·동작
public/manifest.webmanifest, sw.js, icons/, fonts/  # 앱(PWA) 설정·아이콘·폰트
api/*.py, vercel.json  # Vercel 배포용 (search, cafes, config, feedback, ask) (로컬 실행에는 안 써요)
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

## 8. 화면 구성과 디자인 교체 가이드

컨셉: **도로 위 요소**. 파란 화살표 표지판 = 입력창, 노란-검정 유도봉 = 바텀시트 상단.

| 화면 | `app.js` 함수 | 설명 |
|---|---|---|
| 홈 (지도 + 시트) | `V.home`, `V.rcard` | 표지판은 위. 주소 검색 · 최근 대화 · 추천 사진 카드 · 하단 둥근 메뉴 |
| 검색 Tip (채팅) | `V.chat`, `tips()` | 표지판을 누르면 **아래로 내려오고** 키보드가 올라와요. 자주 쓴 조건으로 Tip 개인화 |
| 검색 중 / 결과 / 오류 | `V.loading` `V.results` `V.card` `V.error` | 지도 위 시트에 후보 5곳 (한 줄 요약 + 근거 칩) |
| 지도 미리보기 | `V.peek` | 핀을 누르면 시트 아래쪽에 작게 (상세 보기 / 길찾기) |
| 카페 상세 | `V.detail` `V.photos` `V.qa` | 이름 / 간단 정보 / 사진 스와이프(최대 4장, 출처 표시) / 이 카페에 질문하기 |
| 정보 수정 제안 | `V.feedback` | 틀린 정보 알리기 |
| 출처 안내 · 최근 대화 | `V.sources` `V.history` | 하단 "정보 출처 [자세히]"에서 열려요 |

- 색·글자 크기·둥글기·여백: `public/styles.css` 맨 위 `:root`
- 문구·추천 키워드·출처·하단 메뉴: `public/app.js` 맨 위 `TEXT` `PLACEHOLDER` `EXAMPLES` `SOURCES` `NAV`
- 표지판 모양은 `styles.css` 의 `.sign` 구역, 유도봉은 `.hazard`

**폰트 (Pretendard)**: ttf 파일을 `public/fonts/` 에 `Pretendard-Regular.ttf`, `-Medium.ttf`, `-SemiBold.ttf`, `-Bold.ttf` 이름으로 넣으면 그 파일을 써요. 없으면 인터넷 Pretendard로 대신 나와요.

## 9. 앱처럼 쓰기 (PWA)
- 폰 브라우저에서 사이트를 열고 **홈 화면에 추가**(iPhone: 공유 → 홈 화면에 추가 / Android: 메뉴 → 앱 설치)하면 주소창 없는 앱처럼 실행돼요. (`manifest.webmanifest`, `icons/`)
- 스토어에 올리는 진짜 앱이 필요하면 지금 Vercel 주소를 그대로 감싸는 방식(Capacitor 등)으로 이어갈 수 있어요. 오늘은 Vercel 모바일 웹이 기준이에요.
- 최근 대화·취향 추천은 **그 기기의 브라우저에만** 저장돼요 (`localStorage`, 서버로 안 보내요).

## 10. 새로 추가된 기능
- **주소로 검색**: 홈 아래 검색창에 주소를 넣으면 카카오 지도로 위치를 찾고 가까운 카페 5곳을 보여 줘요 (카카오 `services` 라이브러리 사용, 도메인 등록은 기존과 동일). 지도 검색이 안 되면 카페 주소 글자 일치로 대신해요.
- **카페에 질문하기** (`/api/ask`): 상세 화면 표지판에 "여기 말차라떼도 팔아?"처럼 물으면 **그 카페 데이터만** 보고 답해요. 데이터에 없으면 "확인되지 않았어요". AI 키가 없으면 규칙 답변.
- **사진**: 카페당 최대 4장 (`import_supabase.py` 가 슬롯 1~4를 넣어요).

## 11. Supabase 데이터 변환
```bat
python tools/import_supabase.py cafe_detail.json cafe_photo_rows.csv
```
SQL 에디터에서 `select json_agg(t) from (select * from cafe_detail) t;` 결과를 UTF-8 JSON으로 저장해서 쓰세요 (엑셀로 열지 마세요).

## 12. 변경 기록
무엇을 보완하고 고쳤는지는 [CHANGELOG.md](CHANGELOG.md)에 있어요 (확률 채우기, 프랜차이즈, 정렬, 취향 화면, 시작 화면 등).
