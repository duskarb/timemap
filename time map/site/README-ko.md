# 대전 시간지도 — 웹 비주얼라이제이션

`time map` 프로젝트(서울 지하철 시간지도)의 **알고리즘과 렌더링 방식을 대전 트램에 이식**한 인터랙티브 사이트입니다.
결과물은 의존성 없는 단일 파일 `../../대전_시간지도.html` 로, 더블클릭하면 바로 열립니다.

## 원본 프로젝트에서 가져온 것

| time map (서울) | 이 사이트 (대전) |
| --- | --- |
| `src/graph.ts` 다익스트라 | 1호선 22역 + 트램 45정거장 통합 그래프 |
| `src/map/projection.ts` 방위=지리 / 반지름=시간 | 동일 (상한 90분, 초과 시 테두리 고정) |
| `src/map/renderer.ts` geo↔time 트윈 모프 | 동일 (cubic-in-out, 1.4초) |
| `exports/daejeon-transit-time-map.svg` | 지오메트리 원본 |

## 데이터 파이프라인

`daejeon-transit-time-map.svg` 는 이미 **시간 왜곡된** 좌표라 지리 좌표가 없습니다.
왜곡 함수(`scripts/export-daejeon-minimal-svg.mjs` 의 `distort`)가 방위를 보존한다는 점을 이용해 역산했습니다.

```
python3 extract.py      # SVG → 경로·정거장·랜드마크 추출
python3 invert.py       # 시간왜곡 역산 → lon/lat 복원 (4회 반복 수렴)
python3 build_data.py   # 그래프·그리드 생성 → daejeon.json
```

복원 정확도 검증 — KAIST·대전시청·대전역 실좌표 대비 오차 0.1~0.8km,
시 면적 533km² (실제 539.7km²), 시 경계 실루엣 일치.

## 빌드

```
python3 -c "import io;sh=io.open('shell.html',encoding='utf-8').read();\
d=io.open('daejeon.json',encoding='utf-8').read();a=io.open('app.js',encoding='utf-8').read();\
io.open('../../대전_시간지도.html','w',encoding='utf-8').write(sh.replace('/*DATA*/null/*DATA*/',d).replace('/*APP*/',a))"
```

## 검증

```
node check.mjs      # 출발지별 도달면적·OD 소요시간 콘솔 출력
node headless.mjs   # DOM 스텁 위에서 4개 모드 전환 런타임 검사
```

## 시간 모델

공표 수치와 가정을 구분합니다.

**공표** — 트램 표정속도 22.06km/h · 본선 33.9km · 정거장 45개 · 첨두 배차 7분 30초 ·
1호선 20.5km / 표정속도 33.5km/h · 개통 2030년 하반기(2026.6 대전시).

**가정** — 직선거리 우회계수 1.3 · 도보 4.55km/h ·
시내버스 접근·대기 10분 + 표정속도 16km/h + 5km 초과 시 환승 7분 · 환승 도보 2분 + 거리.

버스 계수는 공표 자료가 없어 비교용으로 둔 값입니다. `단축 시간` 뷰는 두 시나리오의 **차이**만
보므로 버스 가정의 영향을 가장 적게 받습니다.

지오메트리 © OpenStreetMap contributors, ODbL 1.0.
