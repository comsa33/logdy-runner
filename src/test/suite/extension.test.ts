import * as assert from 'assert';
import * as vscode from 'vscode';

// 테스트 그룹 정의
suite('Logdy Runner Extension Test Suite', () => {
    vscode.window.showInformationMessage('테스트 실행을 시작합니다.');

    test('익스텐션이 활성화되는지 확인', async () => {
        // 익스텐션 활성화 확인
        const extension = vscode.extensions.getExtension('pozicube.logdy-runner');
        assert.ok(extension, '익스텐션을 찾을 수 없습니다.');

        if (!extension.isActive) {
            await extension.activate();
        }

        assert.ok(extension.isActive, '익스텐션이 활성화되지 않았습니다.');
    });

    test('명령어들이 등록되어 있는지 확인', async () => {
        // 등록된 명령어 목록 가져오기
        const commands = await vscode.commands.getCommands(true);

        // Logdy Runner 명령어들이 등록되어 있는지 확인
        const expectedCommands = [
            'logdy-runner.runLogdy',
            'logdy-runner.runLogdyWithFile',
            'logdy-runner.stopLogdy'
        ];

        for (const command of expectedCommands) {
            assert.ok(
                commands.includes(command),
                `명령어 '${command}'가 등록되지 않았습니다.`
            );
        }
    });

    test('설정값이 올바르게 로드되는지 확인', () => {
        const config = vscode.workspace.getConfiguration('logdy-runner');

        // 기본 설정값 확인
        const scriptPath = config.get<string>('scriptPath');
        const autoOpenBrowser = config.get<boolean>('autoOpenBrowser');
        const terminalName = config.get<string>('terminalName');

        assert.strictEqual(scriptPath, './run_logdy_safe.sh', '기본 스크립트 경로가 올바르지 않습니다.');
        assert.strictEqual(autoOpenBrowser, true, '기본 자동 브라우저 열기 설정이 올바르지 않습니다.');
        assert.strictEqual(terminalName, 'Logdy', '기본 터미널 이름이 올바르지 않습니다.');
    });
});