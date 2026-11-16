#!/usr/bin/env python3
"""
팀 시트(TSV/CSV, 75열) → data/cafes.json 변환기. 표준 라이브러리만 사용.

  python tools/import_sheet.py 시트.tsv            # data/cafes.json 생성 (기존 파일은 cafes.backup.json 으로 백업)
  python tools/import_sheet.py 시트.tsv -o data/cafes.json

규칙
  - '예시' 행은 건너뜁니다 (ID 가 '예시' 이거나 상호명이 '(예시)'로 시작).
  - 같은 항목이 '(리뷰)' 열과 일반 열에 둘 다 있으면 → 값이 있는 쪽을 씁니다. 우선순위는 아래 PREFER_REVIEW.
  - 좌표: 시트에 '위도','경도' 열이 있으면 그 값을 사용 → 없으면 KAKAO_REST_KEY 로 상호명을 좌표로 변환 → 둘 다 없으면 비워 둠.
    (좌표를 비워 둬도 서버가 실행 중에 상호명으로 자동 조회하므로, 변환기에서는 좌표 조회가 필수가 아니에요.)
  - 시트에서 서버가 안 쓰는 열(건축물대장 면적, 수집자 등)은 버립니다.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import cafe_core as server  # noqa: E402  (좌표 조회 함수 재사용)

# ★ True: '(리뷰)' 열 값을 우선 / False: 일반 열(직접 수집) 값을 우선
PREFER_REVIEW = True

SIZE = {"대": "대형", "중": "중형", "소": "소형"}


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def read_table(path):
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp949"):       # 구글시트=UTF-8, 엑셀 '텍스트(탭으로 분리)'=cp949
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        sys.exit("파일 인코딩을 읽을 수 없어요 (UTF-8 또는 CP949로 저장해 주세요)")
    lines = text.splitlines()
    hline = next((l for l in lines[:15] if "상호명" in l), None)
    if hline is None:
        sys.exit("열 이름 줄(상호명 열이 있는 줄)을 앞쪽 15줄 안에서 찾지 못했어요. 시트 맨 위쪽을 확인해 주세요.")
    delim = "\t" if hline.count("\t") >= hline.count(",") else ","
    table = list(csv.reader(io.StringIO(text, newline=""), delimiter=delim))   # 셀 안 줄바꿈도 안전하게
    hi = next(i for i, r in enumerate(table[:15]) if "상호명" in [c.strip() for c in r])
    header = [c.strip() for c in table[hi]]            # 맨 위의 '① 영업시간…' 같은 그룹 제목 줄은 자동으로 건너뜀
    return [dict(zip(header, r)) for r in table[hi + 1:] if any(c.strip() for c in r)]


def pick(row, base, review=None):
    """일반 열(base)과 리뷰 열(review) 중 값이 있는 쪽을 반환."""
    a = (row.get(base) or "").strip()
    b = (row.get(review) or "").strip() if review else ""
    first, second = (b, a) if PREFER_REVIEW else (a, b)
    return first or second


def split_list(v):
    """쉼표·가운뎃점 등으로 나누되, 괄호 안은 쪼개지 않음 (예: '케이크(생크림·망고), 쿠키' → 2개)."""
    out, buf, depth = [], "", 0
    for ch in v or "":
        if ch in "([（":
            depth += 1
        elif ch in ")]）":
            depth = max(0, depth - 1)
        if depth == 0 and ch in ",，、/·\n":
            out.append(buf)
            buf = ""
        else:
            buf += ch
    out.append(buf)
    return [x.strip() for x in out if x.strip()]


def yes(v):
    return str(v).strip().upper() in ("Y", "YES", "O", "있음", "가능", "TRUE")


def parse_hours(row):
    h = {"open": "", "close": "", "closed_days": [], "note": ""}
    if yes(row.get("24시간")):
        h["open"], h["close"] = "00:00", "24:00"
    else:
        raw = pick(row, "영업시간")
        times = re.findall(r"(\d{1,2}):(\d{2})", raw.replace("~", "-"))
        if len(times) >= 2:
            fmt = lambda t: f"{int(t[0]):02d}:{t[1]}"
            h["open"], h["close"] = fmt(times[0]), fmt(times[-1])
            if len(times) > 2:               # 브레이크타임 등 → 원문 보존
                h["note"] = raw
    rest = pick(row, "정기휴무", "정기휴무(리뷰)")
    if rest and "연중무휴" not in rest and "없음" not in rest:
        if re.search(r"\d{1,2}:\d{2}", rest):          # 예: '일요일 12:00-21:30' → 휴무가 아니라 별도 영업시간
            h["note"] = (h["note"] + " " + rest).strip()
        else:
            days = [d for d in "월화수목금토일" if d in rest.replace("요일", "")]
            h["closed_days"] = days
            if not days:
                h["note"] = (h["note"] + " " + rest).strip()
    said = (row.get("영업시간 언급") or "").strip()
    if said and not (h["open"] and h["open"] in said and h["close"] in said):   # 리뷰의 영업시간 언급이 시트 값과 다를 때만 참고용으로 남김
        h["note"] = (h["note"] + f" 리뷰상 영업시간: {said[:120]}").strip()
    lo = pick(row, "라스트오더", "라스트오더(리뷰)")
    if lo and not lo.startswith("없음") and "마감" not in lo:
        h["note"] = (h["note"] + f" 라스트오더 {lo}").strip()
    elif lo.startswith("없음"):
        pass
    return h


def parse_seating(row):
    s = {"tables": [], "total_seats": None, "size": "", "outlets": "", "outlet_note": "", "note": ""}
    size = (row.get("좌석 규모") or "").strip()
    s["size"] = SIZE.get(size, size)
    area = row.get("좌석 판정 근거(면적)") or ""
    m = re.search(r"약\s*(\d+)\s*석", area) if "신뢰도 낮음" not in area else None   # 면적 추정은 신뢰도 낮으면 제외
    m = m or re.search(r"(\d+)\s*석", row.get("좌석수 언급") or "")
    if m:
        s["total_seats"] = int(m.group(1))
    s["outlets"] = pick(row, "콘센트", "콘센트(리뷰)")
    s["outlet_note"] = (row.get("노트북 제한 내용") or "").strip()
    if yes(pick(row, "단체석", "단체석(리뷰)")):
        s["tables"].append({"type": "단체석", "count": None})
    # 좌석 유형 + 리뷰의 좌석수 언급 (예: '2~3명 앉으면 꽉 참') — 시트의 좌석 규모와 어긋나는 경우 근거가 돼요
    s["note"] = " / ".join(x for x in ((row.get("좌석 유형") or "").strip(), (row.get("좌석수 언급") or "").strip()) if x)[:240]
    return s


def parse_extra(row):
    """검색 근거로 쓸 만한 부가 정보 (LLM 프롬프트에만 들어가요)."""
    pairs = {
        "아메리카노 가격": pick(row, "아메리카노 가격", "아메리카노 가격(리뷰)"),
        "메뉴 가격": (row.get("메뉴 가격(리뷰)") or "").strip(),
        "디카페인": pick(row, "디카페인", "디카페인(리뷰)"),
        "와이파이": (row.get("와이파이(리뷰)") or "").strip(),
        "노트북 작업": (row.get("노트북작업(리뷰)") or "").strip(),
        "층": pick(row, "매장 층수", "매장 층수(리뷰)"),
        "주차": pick(row, "주차 상세", "주차(리뷰)") or (row.get("주차 가능 여부") or "").strip(),
        "예약": (row.get("예약") or "").strip(),
        "반려동물": (row.get("반려동물") or "").strip(),
        "포장·배달": (row.get("포장·배달") or "").strip(),
        "혼잡": (row.get("웨이팅·혼잡") or "").strip(),
        "단점": (row.get("단점") or "").strip(),
        "신뢰도": (row.get("신뢰도 등급(A/B/C)") or "").strip(),
        "리뷰 수": (row.get("유효 리뷰 수") or "").strip(),
    }
    return {k: v for k, v in pairs.items() if v}


def parse_photos(row):
    """시트 열: 사진1 URL, 사진1 출처, 사진1 표기(선택), 사진2 URL, 사진2 출처, 사진2 표기(선택).
    출처(링크) 또는 표기(예: '직접 촬영')가 없는 사진은 앱이 보여주지 않아요."""
    out = []
    for n in ("1", "2"):
        url = (row.get(f"사진{n} URL") or "").strip()
        if url:
            out.append({"url": url, "source": (row.get(f"사진{n} 출처") or "").strip(),
                        "credit": (row.get(f"사진{n} 표기") or "").strip()})
    return out


def to_cafe(i, row, key):
    lat = lng = None
    for a, b in (("위도", "경도"), ("lat", "lng"), ("latitude", "longitude")):
        try:
            lat, lng = float(row.get(a) or ""), float(row.get(b) or "")
            break
        except ValueError:
            pass
    if lat is None and key:
        lat, lng = server.geocode(row["상호명"].strip(), (row.get("주소") or "").strip())
    return {
        "id": i, "name": row["상호명"].strip(), "address": (row.get("주소") or "").strip(),
        "lat": lat, "lng": lng,
        "hours": parse_hours(row),
        "seating": parse_seating(row),
        "menu": {
            "desserts": split_list(pick(row, "디저트 종류", "디저트 종류(리뷰)")),
            "drinks": [],
            "signature": split_list(pick(row, "대표 메뉴", "대표 메뉴(리뷰)")),
        },
        "atmosphere": {
            "noise": pick(row, "소음", "소음(리뷰)"),
            "tags": split_list(pick(row, "분위기 태그", "분위기 태그(리뷰)")),
            "note": pick(row, "한줄 설명", "한줄 설명(리뷰)"),
        },
        "extra": parse_extra(row),
        "photos": parse_photos(row),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("-o", "--out", default=str(ROOT / "data" / "cafes.json"))
    a = ap.parse_args()
    load_env()
    key = server.KAKAO_REST_KEY

    rows = [r for r in read_table(a.sheet)
            if (r.get("상호명") or "").strip() and (r.get("ID") or "").strip() != "예시"
            and not (r.get("상호명") or "").strip().startswith("(예시)")]
    if not rows:
        sys.exit("읽은 카페가 0곳이에요. 열 이름 줄에 '상호명' 열이 있는지, 데이터 행의 상호명이 비어 있지 않은지 확인해 주세요.")
    cafes = []
    for i, r in enumerate(rows, 1):
        c = to_cafe(i, r, key)
        cafes.append(c)
        print(f"[{i}] {c['name']}  좌표 {'OK' if c['lat'] is not None else '없음'}")

    out = Path(a.out)
    if out.exists():
        out.with_name(out.stem + ".backup.json").write_bytes(out.read_bytes())
    out.write_text(json.dumps(cafes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(cafes)}곳 → {out}")
    miss = [c["name"] for c in cafes if c["lat"] is None]
    if miss:
        print("! 좌표가 없는 곳 (지도에 핀이 안 찍혀요):", ", ".join(miss))
        print("  → 시트에 '위도','경도' 열을 추가하거나 .env 에 KAKAO_REST_KEY 를 넣고 다시 실행하세요.")
    if len(cafes) > 12:
        print("! 카페가 12곳을 넘으면 전체 데이터를 프롬프트에 넣는 방식은 느려지고 비싸져요 (README 참고).")


if __name__ == "__main__":
    main()
