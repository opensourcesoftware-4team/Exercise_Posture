# 맨몸 운동 자세 평가 프로그램 
  
AI 실시간 자세 분석, 운동 세션 기록, 운동 가이드 & 교정 루틴, 운동 정보 공유 커뮤니티
  
## 스크린샷 
(추후 추가 예정)
  
## 주요 기능 
| 기능 | 설명 | 담당 | 
|------|------|------| 
| Posture-Tracker | AI 실시간 자세 분석 | 김원빈 | 
| Date-Storage | 운동 세션 기록 | 김성재 | 
| Exercise-Guide | 운동 가이드 & 교정 루틴 | 전승희 | 
| Workout-Sharing | 운동 정보 공유 커뮤니티 | 민유경 | 
  
## 설치와 실행 (Python 3.12 이상, 3.13에서 테스트) 
1. `setup.cmd`를 더블클릭해 `.venv`를 만들고 라이브러리(Flask, waitress)를 설치합니다.
2. `start.cmd`를 더블클릭하거나 프로젝트 폴더에서 `python main.py`를 실행합니다. (`server.py`도 같은 서버를 띄웁니다.)
3. 브라우저에서 http://127.0.0.1:8000/ 에 접속합니다.

| 화면 | 주소 |
|------|------|
| 소개 · 커뮤니티 | `/`, `/#community` |
| AI 실시간 자세 분석 | `/tracker/` |
| 운동 기록 대시보드 | `/dashboard/` |
| 운동 가이드 | `/guide/` |

- 카메라는 브라우저 보안 정책 때문에 서버를 켠 PC의 `127.0.0.1`(또는 `localhost`) 주소에서만 켜집니다. 같은 Wi-Fi의 휴대폰에서는 커뮤니티·대시보드·가이드를 쓸 수 있습니다.
- 운동 기록은 `data/records.json`, 게시글은 `instance/community.sqlite3`에 저장되고 git에는 올리지 않습니다.
- 주소와 포트는 환경변수 `HOST`(기본 `0.0.0.0`), `PORT`(기본 `8000`)로 바꿀 수 있습니다.
- 테스트: `python -m pytest tests` (서버), `node --test "tests/js/*.test.js"` (트래커 판정 엔진, Node 22 이상)
  
## 사용법 
(추후 추가 예정)

## 팀원 
| 이름 | 역할 | GitHub | 
|------|------|--------| 
| 전승희 | 팀장 | jeonseunghui475@gmail.com | 
| 김원빈 | 개발 리드 | plmokn044330@gmail.com | 
| 김성재 | 문서 담당 | ksj71kr@pukyong.ac.kr | 
| 민유경 | 리뷰 품질 담당  | sarah1210-@naver.com | 
  
기여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md), 행동 수칙은 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
를 참고하세요. 
  
## 라이선스 
MIT License — see [LICENSE](LICENSE)
