# DIV AUDIO APP (Windows)

폰 앱 `music_apk`의 플레이어와 북마크 화면을 쓰는 Electron 프로그램입니다. 폰은 폴더를 탐색하지만 PC는 재생목록 하나에 파일과 폴더를 끌어다 넣습니다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm start` | 소스에서 바로 실행 |
| `npm test` | ZIP, 태그, 곡 모으기 시험 |
| `npm run e2e` | 앱을 띄워 실제 파일을 재생하며 시험. 실행 파일 경로를 주면 빌드한 파일을 시험 |
| `npm run port` | 폰 앱의 화면 변경을 가져오기 |
| `npm run dist` | `dist/`에 설치 파일과 포터블 파일 만들기 |

VS Code 안에서 `ELECTRON_RUN_AS_NODE`가 켜져 있으면 Electron이 시작되지 않습니다. 그 변수를 지우고 실행합니다.

## 구조

- `main.js`, `preload.js`: 창, 저장 대화상자, 곡 전달(`daa://app/media/...`, Range 지원)
- `src/`: ZIP, 태그, 곡 모으기. `collect-worker.js`는 재생을 막지 않도록 별도 스레드에서 파일을 읽습니다.
- `www/bridge.js`: 재생 엔진(EQ, 배속, 이어듣기, 취침 예약). PC에서 직접 관리합니다.
- `www/pc.css`: 넓은 창 배치와 마우스 표시. PC에서 직접 관리합니다.
- `tools/pc-part.js`: 재생목록과 PC 조작 코드입니다. `www/app.js`에 들어갑니다.
- `www/app.js`, `www/index.html`: `tools/port-www.js`가 폰 앱 파일에서 탐색과 라이브러리를 잘라 내고 `tools/pc-part.js`를 넣어 만듭니다. 직접 고치면 다음 `npm run port`에서 사라지므로 이 두 도구 파일을 고칩니다.

폰 화면이 바뀌어 고칠 자리를 찾지 못하면 `npm run port`가 멈추고 그 자리를 알려 줍니다.

## 사용자 데이터

`%APPDATA%\DIV AUDIO APP`에 재생목록(`playlist.json`), 테마(`theme.json`), 창 크기(`window.json`), 미니/플로팅 창 상태와 투명도(`compact.json`), 북마크, 이어듣기 위치, 설정이 있습니다. 프로그램을 지워도 남습니다.
