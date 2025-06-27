# Logdy Runner VS Code Extension

Logdy 로그 뷰어를 VS Code에서 안전하게 실행할 수 있는 익스텐션입니다.

## 주요 기능

- 🎯 **사이드바 통합**: VS Code 사이드바에서 직접 Logdy 관리
- 📁 **자동 로그 디렉토리 감지**: 워크스페이스에서 `.log` 파일이 있는 디렉토리를 자동 탐지
- 🚀 **원클릭 실행**: 버튼 하나로 Logdy 서버 시작/중지
- 🌐 **내장 웹뷰**: VS Code 내에서 바로 Logdy 웹 인터페이스 사용
- ⚙️ **포트 관리**: 사용 가능한 포트를 자동으로 찾아 할당
- 🔧 **설정 관리**: 포트 범위 등 사용자 정의 설정
- 🛑 **안전한 프로세스 관리**: 실행 중인 Logdy 프로세스를 안전하게 관리

## 설치

### VSIX 파일로 설치
1. 최신 릴리스에서 `.vsix` 파일 다운로드
2. VS Code에서 `Ctrl+Shift+P` → `Extensions: Install from VSIX`
3. 다운로드한 `.vsix` 파일 선택

### 개발자 모드로 설치
```bash
git clone <repository-url>
cd pyrunner-logdy
npm install
npm run compile
```

## 사용법

### 1. 사이드바에서 사용
1. VS Code 사이드바에서 **Logdy Runner** 아이콘 클릭
2. **작업 디렉토리 선택** 버튼으로 로그가 있는 디렉토리 선택
3. 감지된 로그 디렉토리에서 **▶️ 시작** 버튼 클릭
4. Logdy 웹 인터페이스가 VS Code 내부 패널에서 자동으로 열림

### 2. 기능 설명
- **작업 디렉토리**: 로그 파일을 검색할 루트 디렉토리 설정
- **로그 디렉토리**: `.log` 파일이 있는 디렉토리들이 자동으로 나열됨
- **상태 표시**: 각 디렉토리의 Logdy 실행 상태를 시각적으로 표시
- **포트 정보**: 실행 중인 Logdy의 포트 번호 표시

### 3. 새로고침
사이드바 상단의 **새로고침** 버튼으로 로그 디렉토리 목록을 업데이트할 수 있습니다.

## 설정

VS Code 설정에서 다음 옵션을 설정할 수 있습니다:

```json
{
  "logdy-runner.portRange": {
    "start": 10001,
    "end": 10099
  }
}
```

### 설정 옵션
- **`logdy-runner.portRange`**: Logdy가 사용할 포트 범위
  - `start`: 시작 포트 번호 (기본값: 10001)
  - `end`: 종료 포트 번호 (기본값: 10099)

사이드바에서 **⚙️ 포트 범위 설정** 버튼을 통해서도 설정할 수 있습니다.

## 전제 조건

이 익스텐션을 사용하기 전에 다음이 필요합니다:

1. **Logdy 설치**: `logdy` 명령어가 시스템 PATH에 있어야 함
2. **tail 명령어**: Unix/Linux 시스템의 `tail` 명령어 필요
3. **로그 파일**: `.log` 확장자를 가진 로그 파일들

## 개발

### 개발 환경 설정
```bash
# 의존성 설치
npm install

# TypeScript 컴파일
npm run compile

# 감시 모드로 컴파일
npm run watch

# 린팅
npm run lint
```

### 디버깅
1. VS Code에서 `F5` 키를 누르거나 `Run Extension` 실행
2. 새로운 Extension Development Host 창이 열림
3. 새 창에서 익스텐션 테스트

### 패키징
```bash
# VSIX 파일 생성
npm run package
```

## 프로젝트 구조

```
pyrunner-logdy/
├── src/
│   ├── extension.ts          # 메인 익스텐션 로직
│   └── test/                 # 테스트 파일들
├── out/                      # 컴파일된 JavaScript
├── images/                   # 아이콘 이미지
├── scripts/                  # 빌드 스크립트
├── package.json              # 패키지 매니페스트
├── tsconfig.json            # TypeScript 설정
└── README.md                # 이 파일
```

## 아키텍처

### 핵심 컴포넌트
1. **LogdySidebarProvider**: WebviewViewProvider를 구현하여 사이드바 UI 제공
2. **프로세스 관리**: `tail -f` + `logdy` 파이프라인으로 로그 스트리밍
3. **포트 관리**: 사용 가능한 포트를 자동으로 찾아 할당
4. **파일 시스템 스캔**: 지정된 디렉토리에서 `.log` 파일 자동 감지

### 데이터 흐름
```
로그 파일 → tail -f → logdy → HTTP 서버 → VS Code WebView
```

## 문제 해결

### 자주 발생하는 문제

1. **"logdy 명령어를 찾을 수 없습니다"**
   - Logdy가 시스템에 설치되어 있는지 확인
   - PATH 환경변수에 logdy가 포함되어 있는지 확인

2. **포트 충돌**
   - 설정에서 포트 범위를 변경
   - 다른 프로세스가 해당 포트를 사용하지 않는지 확인

3. **로그 파일이 감지되지 않음**
   - 파일 확장자가 `.log`인지 확인
   - 작업 디렉토리가 올바르게 설정되었는지 확인
   - 파일에 읽기 권한이 있는지 확인

4. **사이드바에 내용이 표시되지 않음**
   - VS Code를 재시작
   - 개발자 도구에서 콘솔 에러 확인
   - 익스텐션을 다시 설치

### 로그 확인
- VS Code 개발자 도구(`Help > Toggle Developer Tools`)에서 콘솔 로그 확인
- 익스텐션 호스트 프로세스 로그 모니터링

## 기여

버그 리포트나 기능 제안은 GitHub Issues를 통해 제출해 주세요.

### 개발 가이드라인
- 모든 변경사항은 테스트와 함께 제출
- ESLint 규칙을 준수
- 커밋 메시지는 명확하고 구체적으로 작성

## 라이선스

MIT License

## 변경 로그

자세한 변경 내역은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.