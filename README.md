# 지도 검색 앱 (안암동 한정) (MVP)
https://trialsession.vercel.app/

문장으로 물어보면 → 후보 최대 5곳(영업시간·좌석·메뉴·분위기 키워드 포함) → 하나 고르면 지도에 핀으로 표시.
Python 표준 라이브러리만 사용 (`pip install` 없음), 지도는 카카오맵 (JavaScript, Rest 키 필요).




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


## 7. Vercel로 배포 (링크로 접속)

로컬 서버(`server.py`)는 Vercel에서 쓰지 않아요. 대신 `api/` 폴더의 함수 3개가 같은 로직(`cafe_core.py`)을 실행해요.

**배포 전 준비**
1. `data/cafes.json` 을 채웠는지 확인해요.
2. 좌표를 배포 전에 만들어 둬요. Vercel에서는 파일을 저장할 수 없어서, 로컬에서 `KAKAO_REST_KEY` 를 넣고 서버를 한 번 켜서 `data/geocode_cache.json` 이 생기게 해 두거나, 시트에 `위도`,`경도` 를 직접 적어요.
3. `.env` 는 올라가지 않아요 (`.vercelignore`). 키는 아래처럼 Vercel에 따로 넣어요.


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
