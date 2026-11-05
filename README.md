# portfolio-cards

내 GitHub 저장소를 **카드형 A4 PDF 포트폴리오**로 만들어 주는 개인용 앱입니다.
내 PC에서만 실행되고(비공개 저장소 포함), GitHub 토큰은 PC 밖으로 나가지 않습니다. 설치할 패키지는 없습니다.

![포트폴리오 1페이지: 프로젝트마다 프로젝트명·기간·인원·언어 및 환경·성과와 README 스크린샷이 카드 한 장으로 정리됩니다](docs/screenshots/preview.png)

## 하는 일

- 저장소를 불러와 **README에 스크린샷이 있는지**로 완성 여부를 추천합니다. (코드·커밋 수는 "주의" 표시로만 사용)
- 새 저장소가 생기면 **업데이트할 때 한 번만** 넣을지 묻습니다. 뺀 저장소는 다시 묻지 않습니다.
- 기간(코드 커밋 기준), 인원·역할(README 팀 표), 언어·환경, 사진(README 이미지)은 자동으로 채웁니다.
- 카드의 연필로 구분(팀/개인), 설명, 성과, 사진(최대 3장)을 고칩니다. 화면과 PDF는 같은 코드로 그려져 똑같이 나옵니다.

## 시작하기

필요한 것: Node.js 22 이상, [GitHub CLI](https://cli.github.com) 로그인(`gh auth login`, 또는 환경변수 `GITHUB_TOKEN`), PDF를 만들 Chrome 또는 Edge.

```bash
git clone https://github.com/haeunjeon0410/portfolio-cards.git
cd portfolio-cards
npm start
```

브라우저에서 http://127.0.0.1:4173 을 열고 **업데이트**를 누르면 저장소를 불러옵니다. **다운로드**는 지금 화면 그대로 PDF를 만듭니다.

Windows에서는 `포트폴리오 열기.vbs` 를 더블클릭해도 됩니다. 서버가 창 없이 켜지고 브라우저가 열립니다. 바탕화면 바로가기를 만들어 두면 서버 위치를 기억할 필요가 없습니다.

## 내 데이터

| 파일 | 설명 |
|---|---|
| `data/overrides.json` | 넣은/뺀 저장소와 직접 고친 값. 가장 소중한 파일이며 바꿀 때마다 `data/backups/` 에 자동 백업(최근 30개). 형식은 `data/overrides.example.json` 참고 |
| `data/config.json` | README에서 내 행을 찾을 이름 목록 `{ "names": ["내 이름"] }` |
| `.cache/` | 수집 결과와 내려받은 사진. 지워도 업데이트하면 다시 받습니다. |

이 파일들은 비공개 저장소 내용이 들어갈 수 있어 `.gitignore` 로 제외되어 있습니다.

## 개발

```bash
npm test   # 판단 규칙, 넣기/빼기, 입력 검증, 서버 보안 시험 (31개)
```

| 위치 | 역할 |
|---|---|
| `lib/collect.js`, `lib/github.js` | GitHub에서 변경분만 수집 (캐시, 재시도, 시간 제한) |
| `lib/judge.js` | 완성 판단, 팀 표·기간 추출 |
| `lib/build.js` | 카드 목록 합치기, 입력 검증, 백업 |
| `lib/pdf.js` | Chrome을 직접 제어해 사진이 모두 준비된 뒤 PDF 출력 |
| `public/` | 화면·PDF 공용 렌더링 |

## 보안

서버는 127.0.0.1에서만 열리며, 다른 웹사이트에서 온 요청(Host/Origin 검사), 과도한 본문, 폴더 밖 파일 접근, 허용되지 않은 입력을 거절합니다.
