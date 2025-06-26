#!/usr/bin/env bash
# Logdy Runner VS Code Extension 빌드 스크립트

set -euo pipefail

# 색상 코드
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# 로그 함수들
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 스크립트 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_info "Logdy Runner VS Code Extension 빌드 시작"
log_info "프로젝트 루트: $PROJECT_ROOT"

# 프로젝트 루트로 이동
cd "$PROJECT_ROOT"

# Node.js와 npm 확인
if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js를 찾을 수 없습니다. Node.js를 설치해주세요."
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    log_error "npm을 찾을 수 없습니다. npm을 설치해주세요."
    exit 1
fi

log_info "Node.js 버전: $(node --version)"
log_info "npm 버전: $(npm --version)"

# package.json 존재 확인
if [[ ! -f "package.json" ]]; then
    log_error "package.json 파일을 찾을 수 없습니다."
    exit 1
fi

# 의존성 설치
log_info "의존성 설치 중..."
if npm ci; then
    log_success "의존성 설치 완료"
else
    log_warn "npm ci 실패, npm install 시도 중..."
    if npm install; then
        log_success "의존성 설치 완료"
    else
        log_error "의존성 설치 실패"
        exit 1
    fi
fi

# 린팅
log_info "코드 린팅 실행 중..."
if npm run lint; then
    log_success "린팅 통과"
else
    log_error "린팅 실패"
    exit 1
fi

# TypeScript 컴파일
log_info "TypeScript 컴파일 중..."
if npm run compile; then
    log_success "컴파일 완료"
else
    log_error "컴파일 실패"
    exit 1
fi

# 테스트 실행 (선택사항)
if [[ "${1:-}" == "--with-tests" ]]; then
    log_info "테스트 실행 중..."
    if npm test; then
        log_success "모든 테스트 통과"
    else
        log_error "테스트 실패"
        exit 1
    fi
fi

# VSIX 패키지 생성
log_info "VSIX 패키지 생성 중..."
if npm run package; then
    log_success "VSIX 패키지 생성 완료"
    
    # 생성된 VSIX 파일 찾기
    VSIX_FILE=$(find . -maxdepth 1 -name "*.vsix" -type f | head -1)
    if [[ -n "$VSIX_FILE" ]]; then
        log_success "생성된 패키지: $VSIX_FILE"
        log_info "패키지 크기: $(du -h "$VSIX_FILE" | cut -f1)"
    fi
else
    log_error "VSIX 패키지 생성 실패"
    exit 1
fi

log_success "빌드 완료!"
log_info ""
log_info "다음 단계:"
log_info "1. 로컬 설치: code --install-extension $VSIX_FILE"
log_info "2. code-server에 설치: code-server --install-extension $VSIX_FILE"
log_info "3. 수동 설치: VS Code에서 Ctrl+Shift+P → 'Extensions: Install from VSIX...'"