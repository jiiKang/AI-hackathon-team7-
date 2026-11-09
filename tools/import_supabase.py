#!/usr/bin/env python3
"""
Supabase(cafe_detail 뷰 + cafe_photo 테이블) → data/cafes.json 변환기. 표준 라이브러리만 사용.

  python tools/import_supabase.py cafe_detail.json cafe_photo.csv
  python tools/import_supabase.py cafe_detail.csv  cafe_photo.csv   (CSV 도 되지만 JSON 을 권장 — attrs 열이 JSON 이라 엑셀에서 깨지기 쉬워요)

- cafe_detail: JSON 배열 또는 CSV (열: id, name, address, lat, lng, trust_grade, attrs, review_total ...)
- cafe_photo : CSV (열: cafe_id, slot, image_url, source_url, url_status ...)  → url_status 가 ok 인 것만, 슬롯 1·2 사용
- 앱의 카페 id 는 1,2,3… 순번이고, 원래 id 는 "src_id" 로 남겨요.
"""
import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZE = {"대": "대형", "중": "중형", "소": "소형"}
MIN_CONF = 0.5        # 추정 좌석수는 신뢰도가 이보다 낮으면 버림


def read_text(path):
    raw = Path(path).read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        sys.exit(f"{path}: UTF-8 이 아니에요. 엑셀로 열었다 저장하면 한글이 깨져요 → Supabase 에서 다시 내려받고, 엑셀로 열지 말고 그대로 전달해 주세요.")


def read_rows(path):
    text = read_text(path)
    if "json_agg" in text[:200] or text.lstrip().startswith("["):   # SQL 에디터 결과를 통째로 저장한 경우(머리글 '| json_agg |')도 처리
        a, b = text.find("["), text.rfind("]")
        try:
            return json.loads(text[a:b + 1].replace("\\|", "|"))   # 표 형식 저장 시 '|' 가 '\|' 로 바뀌는 것 복구
        except ValueError as e:
            sys.exit(f"{path}: JSON 을 읽지 못했어요 ({e}). 결과 칸의 값만 복사했는지, 끝까지 복사됐는지 확인해 주세요.")
    return list(csv.DictReader(io.StringIO(text, newline="")))


def attrs_of(row):
    a = row.get("attrs") or {}
    if isinstance(a, str):
        try:
            a = json.loads(a)
        except ValueError:
            sys.exit("attrs 열을 JSON 으로 읽지 못했어요. 파일이 깨졌을 수 있어요 (엑셀 저장/열람 여부 확인).")
    return a


class A:
    """attrs 접근 도우미: 값 없으면 '' (속성 없음 = 미확인)."""
    def __init__(self, d):
        self.d = d

    def v(self, k):
        x = self.d.get(k)
        val = x.get("value") if isinstance(x, dict) else x
        return "" if val is None else str(val).strip()

    def conf(self, k):
        x = self.d.get(k)
        try:
            return float(x.get("confidence")) if isinstance(x, dict) and x.get("confidence") is not None else 1.0
        except (TypeError, ValueError):
            return 1.0

    def has(self, k):
        return k in self.d

    def yes(self, k):
        return self.v(k) in ("1", "true", "True", "Y")

    def tags(self, k):
        return [t.strip() for t in self.v(k).split("|") if t.strip()]


def hhmm(t):
    m = re.match(r"(\d{1,2}):(\d{2})", t or "")
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def to_cafe(i, row):
    a = A(attrs_of(row))
    # 영업시간
    h = {"open": hhmm(a.v("open")), "close": hhmm(a.v("close")), "closed_days": [], "note": ""}
    if a.yes("is_24h"):
        h["open"], h["close"] = "00:00", "24:00"
    if a.v("close").startswith("24"):
        h["close"] = "24:00"
    h["closed_days"] = [d for d in "월화수목금토일" if d in a.v("closed_days").replace("요일", "")]
    notes = [a.v("hours_note"), a.v("closed_note"), ("공휴일 휴무" if a.yes("closed_holiday") else ""),
             ("라스트오더 " + a.v("last_order") if a.v("last_order") and not a.v("last_order").startswith("없음") else "")]
    h["note"] = " ".join(n for n in notes if n)[:240]
    # 좌석
    s = {"tables": [], "total_seats": None, "size": SIZE.get(a.v("seat_size"), a.v("seat_size")),
         "outlets": a.v("outlet"), "outlet_note": a.v("laptop_note"), "note": ""}
    est = a.v("seat_est")
    if est.isdigit() and a.conf("seat_est") >= MIN_CONF:
        s["total_seats"] = int(est)
    if a.yes("group_seat"):
        s["tables"].append({"type": "단체석", "count": None})
    s["note"] = " / ".join(x for x in (a.v("seat_type"), a.v("seat_mention")) if x)[:240]
    # 메뉴·분위기
    menu = {"desserts": a.tags("dessert_tags"), "drinks": [], "signature": a.tags("menu")}
    atmo = {"noise": a.v("noise"), "tags": a.tags("vibe_tags"), "note": a.v("summary")}
    # 부가(AI 근거용)
    wifi = {"1": "있음", "0": "없음"}.get(a.v("wifi"), "")
    laptop = {"1": "가능", "0": "제한"}.get(a.v("laptop"), "")
    extra = {
        "아메리카노 가격": (a.v("americano") + "원") if a.v("americano") else "",
        "디카페인": {"1": "가능", "0": "불가"}.get(a.v("decaf"), ""),
        "와이파이": wifi, "노트북 작업": laptop,
        "층": a.v("floor_text"), "주차": " ".join(x for x in (a.v("parking"), a.v("parking_detail")) if x),
        "예약": a.v("reservation"), "반려동물": a.v("pets"), "포장·배달": a.v("takeout_delivery"),
        "혼잡": a.v("crowd"), "단점": a.v("cons"),
        "신뢰도": (row.get("trust_grade") or "").strip(), "리뷰 수": str(row.get("review_total") or "").strip(),
    }
    try:
        lat, lng = float(row.get("lat")), float(row.get("lng"))
    except (TypeError, ValueError):
        lat = lng = None
    return {"id": i, "src_id": row.get("id"), "name": (row.get("name") or "").strip(),
            "address": (row.get("address") or "").strip(), "lat": lat, "lng": lng,
            "hours": h, "seating": s, "menu": menu, "atmosphere": atmo,
            "extra": {k: v for k, v in extra.items() if v}, "photos": []}


def attach_photos(cafes, photo_rows):
    by = {c["src_id"]: c for c in cafes}
    rows = [p for p in photo_rows if (p.get("url_status") or "").strip().lower() == "ok" and (p.get("image_url") or "").strip()]
    rows.sort(key=lambda p: int(p.get("slot") or 9))
    for p in rows:
        c = by.get(p.get("cafe_id"))
        if not c or len(c["photos"]) >= 2:
            continue
        if p.get("slot") not in ("1", "2"):
            continue
        url = p["image_url"].strip().replace("http://", "https://", 1)   # https 페이지에서 http 이미지는 막혀요
        src = (p.get("source_url") or "").strip().replace("http://", "https://", 1)
        c["photos"].append({"url": url, "source": src, "credit": ""})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("detail")
    ap.add_argument("photos", nargs="?")
    ap.add_argument("-o", "--out", default=str(ROOT / "data" / "cafes.json"))
    a = ap.parse_args()
    rows = [r for r in read_rows(a.detail) if (r.get("name") or "").strip()]
    if not rows:
        sys.exit("읽은 카페가 0곳이에요.")
    cafes = [to_cafe(i, r) for i, r in enumerate(rows, 1)]
    if a.photos:
        attach_photos(cafes, read_rows(a.photos))
    out = Path(a.out)
    if out.exists():
        out.with_name(out.stem + ".backup.json").write_bytes(out.read_bytes())
    out.write_text(json.dumps(cafes, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(cafes)
    print(f"{n}곳 → {out}")
    print(f"  좌표 있음 {sum(c['lat'] is not None for c in cafes)}  / 영업시간 있음 {sum(bool(c['hours']['open']) for c in cafes)}"
          f"  / 사진 있음 {sum(bool(c['photos']) for c in cafes)}  / 소음 있음 {sum(bool(c['atmosphere']['noise']) for c in cafes)}")


if __name__ == "__main__":
    main()
