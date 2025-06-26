# Logdy Runner VS Code Extension

Logdy 로그 뷰어를 VS Code에서 안전하게 실행할 수 있는 익스텐션입니다.

## 기능

- 🔍 **자동 로그 파일 감지**: 워크스페이스에서 `.log` 파일을 자동으로 감지하여 Logdy 실행
- 📁 **특정 파일 선택**: 원하는 로그 파일을 직접 선택하여 실행
- 🌐 **자동 브라우저 열기**: Logdy 실행 시 자동으로 웹 인터페이스 열기 (설정 가능)
- 🛑 **안전한 프로세스 관리**: 실행 중인 Logdy 프로세스를 안전하게 중지
- ⚙️ **유연한 설정**: 스크립트 경로, 터미널 이름 등 커스터마이징 가능

## 설치 및 설정

### 개발 환경 설정

1. **필수 도구 설치**
   ```bash
   # Node.js와 npm이 설치되어 있어야 합니다
   node --version
   npm --version
   ```

2. **프로젝트 클론 및 의존성 설치**
   ```bash
   git clone <repository-url>
   cd logdy-runner-extension
   npm install
   ```

3. **개발 빌드**
   ```bash
   npm run compile
   ```

### 익스텐션 패키징

```bash
# VSIX 파일 생성
npm run package
```

### code-server에 빌트인으로 설치

1. **익스텐션 빌드**
   ```bash
   npm run compile
   ```

2. **code-server 익스텐션 디렉토리에 복사**
   ```bash
   # code-server의 익스텐션 디렉토리 확인 (보통 ~/.local/share/code-server/extensions)
   cp -r . ~/.local/share/code-server/extensions/logdy-runner-extension
   ```

3. **또는 Docker를 사용하는 경우 Dockerfile에 추가**
   ```dockerfile
   # Dockerfile에 추가
   COPY logdy-runner-extension /config/.local/share/code-server/extensions/logdy-runner
   ```

## 사용법

### 명령어

익스텐션은 다음 명령어들을 제공합니다:

- **`Logdy: 자동 로그 파일 감지 실행`**: 워크스페이스에서 `.log` 파일을 자동으로 찾아 Logdy 실행
- **`Logdy: 특정 로그 파일로 실행`**: 원하는 로그 파일을 선택하여 Logdy 실행
- **`Logdy: 중지`**: 실행 중인 Logdy 프로세스 중지

### 사용 방법

1. **Command Palette에서 실행**
   - `Ctrl+Shift+P` (또는 `Cmd+Shift+P`)를 눌러 명령 팔레트 열기
   - `Logdy`를 입력하여 사용 가능한 명령어 확인

2. **컨텍스트 메뉴에서 실행**
   - Explorer에서 `.log` 파일을 우클릭
   - `Logdy: 특정 로그 파일로 실행` 선택

### 설정

`settings.json`에서 다음 설정을 변경할 수 있습니다:

```json
{
  "logdy-runner.scriptPath": "./run_logdy_safe.sh",
  "logdy-runner.autoOpenBrowser": true,
  "logdy-runner.terminalName": "Logdy"
}
```

#### 설정 옵션

- **`logdy-runner.scriptPath`**: Logdy 실행 스크립트의 경로 (기본값: `./run_logdy_safe.sh`)
- **`logdy-runner.autoOpenBrowser`**: Logdy 실행 시 자동으로 브라우저 열기 (기본값: `true`)
- **`logdy-runner.terminalName`**: Logdy 실행용 터미널 이름 (기본값: `Logdy`)

## 개발

### 개발 서버 실행

```bash
# TypeScript 컴파일 감시 모드
npm run watch
```

### 디버깅

1. VS Code에서 `F5`를 누르거나 `Run Extension` 디버그 구성 실행
2. 새로운 VS Code 창(Extension Development Host)이 열림
3. 새 창에서 익스텐션 테스트

### 린팅

```bash
# ESLint 실행
npm run lint
```

### 테스트

```bash
# 테스트 실행
npm test
```

## 프로젝트 구조

```
logdy-runner-extension/
├── .vscode/              # VS Code 설정
│   ├── launch.json       # 디버깅 설정
│   ├── settings.json     # 워크스페이스 설정
│   └── tasks.json        # 빌드 작업 설정
├── src/                  # TypeScript 소스 코드
│   └── extension.ts      # 메인 익스텐션 로직
├── out/                  # 컴파일된 JavaScript (자동 생성)
├── .eslintrc.js          # ESLint 설정
├── .gitignore            # Git 무시 파일
├── package.json          # 패키지 매니페스트
├── tsconfig.json         # TypeScript 설정
└── README.md             # 프로젝트 설명서
```

## 의존성

### 필수 의존성

- `child_process`: Node.js 기본 모듈

### 개발 의존성

- `@types/vscode`: VS Code API 타입 정의
- `@types/node`: Node.js 타입 정의
- `typescript`: TypeScript 컴파일러
- `eslint`: 코드 린팅
- `@typescript-eslint/*`: TypeScript ESLint 플러그인

## 라이선스

MIT License

## 문제 해결

### 자주 발생하는 문제

1. **스크립트를 찾을 수 없음**
   - `run_logdy_safe.sh` 파일이 워크스페이스에 있는지 확인
   - 설정에서 `logdy-runner.scriptPath` 경로가 올바른지 확인

2. **권한 문제**
   - 스크립트에 실행 권한이 있는지 확인: `chmod +x run_logdy_safe.sh`

3. **포트 충돌**
   - 다른 Logdy 인스턴스가 실행 중인지 확인
   - 기존 프로세스를 중지한 후 다시 실행

### 로그 확인

- VS Code의 개발자 도구(`Help > Toggle Developer Tools`)에서 콘솔 로그 확인
- 터미널에서 Logdy 실행 상태 모니터링

## 기여

버그 리포트나 기능 제안은 이슈로 등록해 주세요.