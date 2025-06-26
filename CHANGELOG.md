# Change Log

Logdy Runner VS Code 익스텐션의 모든 변경사항이 이 파일에 기록됩니다.

## [1.0.0] - 2025-06-26

### 추가됨
- 🎉 **초기 릴리스**: Logdy Runner VS Code 익스텐션 최초 버전
- 🔍 **자동 로그 파일 감지**: 워크스페이스에서 .log 파일을 자동으로 찾아 Logdy 실행
- 📁 **특정 파일 선택**: 원하는 로그 파일을 직접 선택하여 실행 가능
- 🌐 **자동 브라우저 열기**: Logdy 실행 시 웹 인터페이스 자동 열기 (설정 가능)
- 🛑 **프로세스 관리**: 실행 중인 Logdy 프로세스를 안전하게 중지
- ⚙️ **설정 옵션**: 스크립트 경로, 터미널 이름, 자동 브라우저 열기 등 커스터마이징
- 🎯 **컨텍스트 메뉴**: .log 파일 우클릭으로 바로 실행 가능
- 📝 **명령어 팔레트**: Command Palette에서 모든 기능 접근 가능

### 기능 상세

#### 명령어
- `Logdy: 자동 로그 파일 감지 실행` - 워크스페이스에서 .log 파일 자동 감지 후 실행
- `Logdy: 특정 로그 파일로 실행` - 사용자가 선택한 로그 파일로 실행
- `Logdy: 중지` - 실행 중인 Logdy 프로세스 중지

#### 설정
- `logdy-runner.scriptPath` - Logdy 실행 스크립트 경로 (기본값: ./run_logdy_safe.sh)
- `logdy-runner.autoOpenBrowser` - 자동 브라우저 열기 (기본값: true)
- `logdy-runner.terminalName` - 터미널 이름 (기본값: Logdy)

#### 기술 스택
- TypeScript 4.9.4
- VS Code Extension API
- Node.js child_process
- ESLint + TypeScript ESLint
- Mocha 테스트 프레임워크

### 개발 환경
- VS Code 디버깅 설정 완비
- 자동 컴파일 및 린팅 설정
- 테스트 스위트 구성
- 패키징 스크립트 준비

### 문서
- 상세한 README.md 작성
- 설치 및 사용법 가이드
- 개발 환경 설정 안내
- 문제 해결 가이드

## [앞으로 계획]

### [1.1.0] - 예정
- 📊 **상태 표시**: 상태바에 Logdy 실행 상태 표시
- 🔔 **알림 개선**: 실행 완료 및 오류 알림 개선
- 📋 **로그 파일 목록**: 워크스페이스의 모든 .log 파일 목록 제공
- ⚡ **성능 개선**: 스크립트 감지 및 실행 성능 최적화

### [1.2.0] - 예정
- 🎨 **테마 지원**: 다양한 색상 테마 지원
- 📱 **멀티 워크스페이스**: 여러 워크스페이스 동시 지원
- 🔧 **고급 설정**: 포트 범위, 타임아웃 등 고급 설정 옵션
- 📈 **사용량 통계**: 익스텐션 사용량 및 성능 통계

## 버전 관리 규칙

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다:

- **MAJOR** 버전: 호환되지 않는 API 변경
- **MINOR** 버전: 하위 호환성을 유지하는 기능 추가
- **PATCH** 버전: 하위 호환성을 유지하는 버그 수정

## 기여 가이드

- 모든 변경사항은 이 CHANGELOG.md에 기록되어야 합니다
- 새로운 기능은 테스트와 함께 추가되어야 합니다
- 코딩 스타일은 ESLint 설정을 따라야 합니다
- 커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다