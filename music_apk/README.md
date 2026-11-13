# DIV AUDIO APP

기기에 저장된 음원과 압축 파일(zip)을 폴더째로 재생하는 오디오 플레이어. Capacitor 기반(Android / iOS).

- 화면: `www/`
- Android 네이티브: `android/`
- iOS 네이티브: `ios/App/App/Native/`

## iOS 배포

`main`에 푸시하면 GitHub Actions(macOS)가 서명 안 된 `.ipa`를 빌드해서
Release에 올리고, `docs/` 설치 페이지와 함께 GitHub Pages에 배포한다.

설치 페이지: `https://<계정>.github.io/<저장소>/`

아이폰 설치는 AltStore / SideStore / Sideloadly로 본인 Apple ID 서명을 해서 한다.
(무료 Apple ID는 7일마다 재서명 필요)

## Android 빌드

```
npx cap sync android
cd android && ./gradlew assembleRelease
```
서명 키(`keystore/`)는 저장소에 올리지 않는다.
