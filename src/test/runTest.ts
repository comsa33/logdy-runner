import { runTests } from '@vscode/test-electron';
import * as path from 'path';

/**
 * 테스트 실행 메인 함수
 */
async function main() {
    try {
        // 익스텐션 개발 경로 (현재 프로젝트 루트)
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // 테스트 스위트 경로
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // VS Code를 다운로드하고 테스트 실행
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions' // 다른 익스텐션들 비활성화하여 테스트 격리
            ]
        });
    } catch (err) {
        console.error('테스트 실행 실패:', err);
        process.exit(1);
    }
}

main();