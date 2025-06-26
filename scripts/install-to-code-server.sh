#!/usr/bin/env bash
# Logdy Runner Extension을 code-server에 빌트인으로 설치하는 스크립트

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

# 도움말 출력
show_help() {
    cat << EOF
Logdy Runner Extension을 code-server에 설치하는 스크립트

사용법:
    $0 [OPTIONS] [CODE_SERVER_EXTENSIONS_DIR]

옵션:
    -h, --help              이 도움말 출력
    -f, --force             기존 익스텐션이 있어도 강제로 덮어쓰기
    -b, --build             설치 전에 빌드 실행
    --docker-mode           Docker 환경용 설정 (기본 경로 변경)

인자:
    CODE_SERVER_EXTENSIONS_DIR    code-server 익스텐션 디렉토리 경로
                                (기본값: ~/.local/share/code-server/extensions)

예시:
    $0                                    # 기본 경로에 설치
    $0 --build                           # 빌드 후 설치
    $0 -f /custom/path/extensions        # 사용자 지정 경로에 강제 설치
    $0 --docker-mode                     # Docker 환경에 설치

EOF
}

# 기본값 설정
FORCE=false
BUILD=false
DOCKER_MODE=false
EXTENSIONS_DIR=""

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -b|--build)
            BUILD=true
            shift
            ;;
        --docker-mode)
            DOCKER_MODE=true
            shift
            ;;
        -*)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
        *)
            if [[ -z "$EXTENSIONS_DIR" ]]; then
                EXTENSIONS_DIR="$1"
            else
                log_error "너무 많은 인자입니다."
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# 스크립트 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_NAME="logdy-runner"

log_info "Logdy Runner Extension code-server 설치 시작"
log_info "프로젝트 루트: $PROJECT_ROOT"

# 기본 익스텐션 디렉토리 설정
if [[ -z "$EXTENSIONS_DIR" ]]; then
    if [[ "$DOCKER_MODE" == true ]]; then
        EXTENSIONS_DIR="/config/.local/share/code-server/extensions"
    else
        EXTENSIONS_DIR="$HOME/.local/share/code-server/extensions"
    fi
fi

log_info "대상 익스텐션 디렉토리: $EXTENSIONS_DIR"

# 프로젝트 루트로 이동
cd "$PROJECT_ROOT"

# 빌드 실행 (옵션)
if [[ "$BUILD" == true ]]; then
    log_info "빌드 실행 중..."
    if [[ -f "scripts/build.sh" ]]; then
        bash scripts/build.sh
    else
        log_warn "빌드 스크립트를 찾을 수 없습니다. 수동 빌드 실행..."
        npm run compile
    fi
fi

# 컴파일된 파일 확인
if [[ ! -d "out" ]]; then
    log_error "컴파일된 파일을 찾을 수 없습니다. 먼저 빌드를 실행하세요."
    log_info "빌드 실행: npm run compile 또는 scripts/build.sh"
    exit 1
fi

# 익스텐션 디렉토리 생성
TARGET_DIR="$EXTENSIONS_DIR/$EXTENSION_NAME"
if [[ ! -d "$EXTENSIONS_DIR" ]]; then
    log_info "익스텐션 디렉토리 생성: $EXTENSIONS_DIR"
    mkdir -p "$EXTENSIONS_DIR"
fi

# 기존 익스텐션 확인
if [[ -d "$TARGET_DIR" ]]; then
    if [[ "$FORCE" == true ]]; then
        log_warn "기존 익스텐션을 강제로 제거합니다: $TARGET_DIR"
        rm -rf "$TARGET_DIR"
    else
        log_error "익스텐션이 이미 설치되어 있습니다: $TARGET_DIR"
        log_info "강제로 덮어쓰려면 --force 옵션을 사용하세요."
        exit 1
    fi
fi

# 익스텐션 디렉토리 생성
log_info "익스텐션 디렉토리 생성: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 필수 파일들 복사
log_info "익스텐션 파일 복사 중..."

# package.json 복사
if [[ -f "package.json" ]]; then
    cp "package.json" "$TARGET_DIR/"
    log_info "✓ package.json 복사 완료"
else
    log_error "package.json을 찾을 수 없습니다."
    exit 1
fi

# 컴파일된 JavaScript 파일들 복사
if [[ -d "out" ]]; then
    cp -r "out" "$TARGET_DIR/"
    log_info "✓ out/ 디렉토리 복사 완료"
else
    log_error "out/ 디렉토리를 찾을 수 없습니다. 컴파일을 먼저 실행하세요."
    exit 1
fi

# node_modules 복사 (프로덕션 의존성이 있는 경우)
if [[ -d "node_modules" ]]; then
    log_info "프로덕션 의존성 복사 중..."
    # 프로덕션 의존성만 복사
    mkdir -p "$TARGET_DIR/node_modules"
    
    # package.json에서 dependencies가 있는지 확인
    if grep -q '"dependencies"' package.json; then
        # 간단한 복사 (필요한 모듈만)
        if [[ -d "node_modules/child_process" ]]; then
            cp -r "node_modules/child_process" "$TARGET_DIR/node_modules/" 2>/dev/null || true
        fi
        log_info "✓ 프로덕션 의존성 복사 완료"
    else
        log_info "프로덕션 의존성이 없습니다."
    fi
fi

# README.md 복사 (선택사항)
if [[ -f "README.md" ]]; then
    cp "README.md" "$TARGET_DIR/"
    log_info "✓ README.md 복사 완료"
fi

# CHANGELOG.md 복사 (선택사항)
if [[ -f "CHANGELOG.md" ]]; then
    cp "CHANGELOG.md" "$TARGET_DIR/"
    log_info "✓ CHANGELOG.md 복사 완료"
fi

# 권한 설정
log_info "파일 권한 설정 중..."
chmod -R 755 "$TARGET_DIR"

# 설치 확인
log_success "익스텐션 설치 완료!"
log_info ""
log_info "설치 정보:"
log_info "  익스텐션 이름: $EXTENSION_NAME"
log_info "  설치 경로: $TARGET_DIR"
log_info "  디렉토리 크기: $(du -sh "$TARGET_DIR" | cut -f1)"
log_info ""
log_info "다음 단계:"
log_info "1. code-server 재시작"
log_info "2. VS Code에서 Ctrl+Shift+P → 'Logdy' 입력하여 익스텐션 확인"
log_info ""

# Docker 환경인 경우 추가 안내
if [[ "$DOCKER_MODE" == true ]]; then
    log_info "Docker 환경 설정 팁:"
    log_info "- Dockerfile에 다음 라인 추가:"
    log_info "  COPY logdy-runner-extension /config/.local/share/code-server/extensions/logdy-runner"
    log_info "- 또는 볼륨 마운트 사용:"
    log_info "  -v \$(pwd)/logdy-runner-extension:/config/.local/share/code-server/extensions/logdy-runner"
fi

log_success "설치가 완료되었습니다. code-server를 재시작하여 익스텐션을 사용하세요!"