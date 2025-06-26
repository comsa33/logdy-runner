import { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 현재 실행 중인 Logdy 프로세스들을 추적하는 맵
 * 키: 워크스페이스 경로, 값: { process: 프로세스 객체, port: 포트 번호 }
 */
const runningProcesses = new Map<string, { process: ChildProcess; port: number }>();

/**
 * 상태바 아이템들
 */
let statusBarItem: vscode.StatusBarItem;
let statusBarButton: vscode.StatusBarItem;

/**
 * 익스텐션이 활성화될 때 호출되는 함수
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Logdy Runner 익스텐션이 활성화되었습니다.');

    // 상태바 아이템 생성
    createStatusBarItems();

    // 자동 로그 파일 감지 실행 명령어 등록
    const runLogdyCommand = vscode.commands.registerCommand('logdy-runner.runLogdy', async () => {
        await runLogdyWithAutoDetection();
    });

    // 특정 로그 파일로 실행 명령어 등록
    const runLogdyWithFileCommand = vscode.commands.registerCommand('logdy-runner.runLogdyWithFile', async (uri?: vscode.Uri) => {
        await runLogdyWithSpecificFile(uri);
    });

    // Logdy 중지 명령어 등록
    const stopLogdyCommand = vscode.commands.registerCommand('logdy-runner.stopLogdy', async () => {
        await stopLogdy();
    });

    // 브라우저 열기 명령어 등록
    const openBrowserCommand = vscode.commands.registerCommand('logdy-runner.openBrowser', async () => {
        await openLogdyInBrowser();
    });

    // 상태바 버튼 클릭 명령어 등록
    const statusBarClickCommand = vscode.commands.registerCommand('logdy-runner.statusBarClick', async () => {
        await handleStatusBarClick();
    });

    // 포트 범위 설정 명령어 등록
    const configurePortRangeCommand = vscode.commands.registerCommand('logdy-runner.configurePortRange', async () => {
        await configurePortRange();
    });

    // 등록된 명령어들을 context에 추가
    context.subscriptions.push(
        runLogdyCommand, 
        runLogdyWithFileCommand, 
        stopLogdyCommand, 
        openBrowserCommand,
        statusBarClickCommand,
        configurePortRangeCommand,
        statusBarItem,
        statusBarButton
    );

    // 익스텐션이 비활성화될 때 모든 프로세스 정리
    context.subscriptions.push(new vscode.Disposable(() => {
        cleanup();
    }));

    // 초기 상태바 업데이트
    updateStatusBar();
}

/**
 * 상태바 아이템들 생성
 */
function createStatusBarItems(): void {
    // Logdy 상태 표시 아이템
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'logdy-runner.statusBarClick';
    statusBarItem.show();

    // Logdy 브라우저 열기 버튼
    statusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    statusBarButton.text = "$(globe) Logdy";
    statusBarButton.tooltip = "Logdy 웹 인터페이스 열기";
    statusBarButton.command = 'logdy-runner.openBrowser';
    // 초기에는 숨김 (Logdy가 실행 중일 때만 표시)
}

/**
 * 상태바 업데이트
 */
function updateStatusBar(): void {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        statusBarItem.text = "$(circle-large-outline) Logdy: No Workspace";
        statusBarItem.tooltip = "워크스페이스가 없습니다";
        statusBarButton.hide();
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const runningInfo = runningProcesses.get(workspacePath);

    if (runningInfo) {
        // 실행 중
        statusBarItem.text = `$(pulse) Logdy: Running :${runningInfo.port}`;
        statusBarItem.tooltip = `Logdy가 포트 ${runningInfo.port}에서 실행 중입니다. 클릭하여 중지`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        
        statusBarButton.text = `$(globe) :${runningInfo.port}`;
        statusBarButton.tooltip = `Logdy 웹 인터페이스 열기 (http://localhost:${runningInfo.port})`;
        statusBarButton.show();
    } else {
        // 중지됨
        statusBarItem.text = "$(circle-large-outline) Logdy: Stopped";
        statusBarItem.tooltip = "Logdy가 중지되었습니다. 클릭하여 시작";
        statusBarItem.backgroundColor = undefined;
        
        statusBarButton.hide();
    }
}

/**
 * 상태바 클릭 핸들러
 */
async function handleStatusBarClick(): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('워크스페이스 폴더를 찾을 수 없습니다.');
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const runningInfo = runningProcesses.get(workspacePath);

    if (runningInfo) {
        // 실행 중이면 중지
        await stopLogdy();
    } else {
        // 중지되어 있으면 시작
        await runLogdyWithAutoDetection();
    }
}

/**
 * 브라우저에서 Logdy 열기
 */
async function openLogdyInBrowser(): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('워크스페이스 폴더를 찾을 수 없습니다.');
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const runningInfo = runningProcesses.get(workspacePath);

    if (runningInfo) {
        const url = `http://localhost:${runningInfo.port}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
        vscode.window.showInformationMessage(`Logdy 웹 인터페이스를 열었습니다: ${url}`);
    } else {
        const action = await vscode.window.showWarningMessage(
            'Logdy가 실행되지 않았습니다. 시작하시겠습니까?',
            '시작',
            '취소'
        );
        
        if (action === '시작') {
            await runLogdyWithAutoDetection();
        }
    }
}
/**
 * 자동 로그 파일 감지로 Logdy 실행
 */
async function runLogdyWithAutoDetection(): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('워크스페이스 폴더를 찾을 수 없습니다.');
        return;
    }

    const scriptPath = await findLogdyScript(workspaceFolder.uri.fsPath);
    if (!scriptPath) {
        vscode.window.showErrorMessage('run_logdy_safe.sh 스크립트를 찾을 수 없습니다.');
        return;
    }

    await executeLogdyScript(scriptPath, workspaceFolder.uri.fsPath);
}

/**
 * 특정 로그 파일로 Logdy 실행
 */
async function runLogdyWithSpecificFile(uri?: vscode.Uri): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('워크스페이스 폴더를 찾을 수 없습니다.');
        return;
    }

    // URI가 제공되지 않은 경우 사용자에게 파일 선택 요청
    let logFilePath: string;
    if (uri) {
        logFilePath = uri.fsPath;
    } else {
        const selectedFile = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Log files': ['log'],
                'All files': ['*']
            },
            defaultUri: workspaceFolder.uri
        });

        if (!selectedFile || selectedFile.length === 0) {
            return;
        }

        logFilePath = selectedFile[0].fsPath;
    }

    const scriptPath = await findLogdyScript(workspaceFolder.uri.fsPath);
    if (!scriptPath) {
        vscode.window.showErrorMessage('run_logdy_safe.sh 스크립트를 찾을 수 없습니다.');
        return;
    }

    await executeLogdyScript(scriptPath, path.dirname(logFilePath), path.basename(logFilePath));
}

/**
 * 실행 중인 Logdy 프로세스 중지
 */
async function stopLogdy(): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('워크스페이스 폴더를 찾을 수 없습니다.');
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const runningInfo = runningProcesses.get(workspacePath);

    if (runningInfo) {
        runningInfo.process.kill('SIGTERM');
        runningProcesses.delete(workspacePath);
        updateStatusBar();
        vscode.window.showInformationMessage('Logdy 프로세스가 중지되었습니다.');
    } else {
        vscode.window.showWarningMessage('실행 중인 Logdy 프로세스를 찾을 수 없습니다.');
    }
}

/**
 * Logdy 스크립트를 실행하는 함수
 */
async function executeLogdyScript(scriptPath: string, workingDir: string, logFileName?: string): Promise<void> {
    const workspaceFolder = getActiveWorkspaceFolder();
    if (!workspaceFolder) {
        return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    // 이미 실행 중인 프로세스가 있는지 확인
    if (runningProcesses.has(workspacePath)) {
        const action = await vscode.window.showWarningMessage(
            '이미 Logdy가 실행 중입니다. 기존 프로세스를 중지하고 새로 시작하시겠습니까?',
            '예',
            '아니오'
        );

        if (action === '예') {
            await stopLogdy();
        } else {
            return;
        }
    }

    // 설정에서 터미널 이름 가져오기
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const terminalName = config.get<string>('terminalName', 'Logdy');

    // 새 터미널 생성 또는 기존 터미널 재사용
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: terminalName,
            cwd: workingDir
        });
    }

    // 터미널 표시
    terminal.show();

    // 스크립트 실행 명령어 구성
    const args = logFileName ? [logFileName] : [];
    const command = `chmod +x "${scriptPath}" && "${scriptPath}" ${args.join(' ')}`;

    terminal.sendText(command);

    // 포트 감지를 위한 지연
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 포트 감지 시도 (8081-8099 범위)
    const detectedPort = await detectLogdyPort();
    
    // 프로세스 추적을 위한 정보 저장
    const virtualProcess = {
        kill: (signal?: string) => {
            terminal?.sendText('\u0003'); // Ctrl+C 전송
            terminal?.dispose();
        }
    } as ChildProcess;

    runningProcesses.set(workspacePath, { process: virtualProcess, port: detectedPort });
    updateStatusBar();

    // 설정에 따라 브라우저 자동 열기
    const autoOpenBrowser = config.get<boolean>('autoOpenBrowser', true);
    if (autoOpenBrowser && detectedPort > 0) {
        // 추가 지연 후 브라우저 열기
        setTimeout(() => {
            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${detectedPort}`));
        }, 1000);
    }

    vscode.window.showInformationMessage(
        `Logdy가 시작되었습니다.${detectedPort > 0 ? ` 포트: ${detectedPort}` : ''} ${logFileName ? `(파일: ${logFileName})` : ''}`
    );
}

/**
 * Logdy 포트 감지 함수
 */
async function detectLogdyPort(): Promise<number> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const portRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    
    // 설정된 포트 범위에서 체크
    for (let port = portRange.start; port <= portRange.end; port++) {
        try {
            // 간단한 HTTP 요청으로 Logdy 서버 확인
            const response = await fetch(`http://localhost:${port}`, { 
                method: 'HEAD',
                signal: AbortSignal.timeout(1000) // 1초 타임아웃
            });
            
            if (response.ok) {
                return port;
            }
        } catch (error) {
            // 포트가 사용 중이 아니거나 Logdy가 아직 시작되지 않음
            continue;
        }
    }
    
    // 감지 실패 시 기본 포트 반환
    return portRange.start;
}

/**
 * 포트 범위 설정 함수
 */
async function configurePortRange(): Promise<void> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const currentRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    
    // 시작 포트 입력
    const startPortInput = await vscode.window.showInputBox({
        prompt: '시작 포트 번호를 입력하세요',
        value: currentRange.start.toString(),
        validateInput: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1024 || port > 65535) {
                return '유효한 포트 번호를 입력하세요 (1024-65535)';
            }
            return null;
        }
    });
    
    if (!startPortInput) {
        return; // 취소됨
    }
    
    const startPort = parseInt(startPortInput);
    
    // 종료 포트 입력
    const endPortInput = await vscode.window.showInputBox({
        prompt: '종료 포트 번호를 입력하세요',
        value: currentRange.end.toString(),
        validateInput: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1024 || port > 65535) {
                return '유효한 포트 번호를 입력하세요 (1024-65535)';
            }
            if (port <= startPort) {
                return `종료 포트는 시작 포트(${startPort})보다 커야 합니다`;
            }
            return null;
        }
    });
    
    if (!endPortInput) {
        return; // 취소됨
    }
    
    const endPort = parseInt(endPortInput);
    
    // 설정 저장
    try {
        await config.update('portRange', {start: startPort, end: endPort}, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
            `포트 범위가 ${startPort}-${endPort}로 설정되었습니다.`
        );
        
        // 실행 중인 Logdy가 있다면 재시작 여부 묻기
        const workspaceFolder = getActiveWorkspaceFolder();
        if (workspaceFolder && runningProcesses.has(workspaceFolder.uri.fsPath)) {
            const action = await vscode.window.showInformationMessage(
                '포트 범위가 변경되었습니다. Logdy를 재시작하시겠습니까?',
                '재시작',
                '나중에'
            );
            
            if (action === '재시작') {
                await stopLogdy();
                await runLogdyWithAutoDetection();
            }
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`설정 저장 중 오류가 발생했습니다: ${error}`);
    }
}

/**
 * 설정에서 포트 범위 가져오기
 */
function getPortRange(): {start: number, end: number} {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const portRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    
    // 유효성 검사
    if (portRange.start < 1024 || portRange.start > 65535 || 
        portRange.end < 1024 || portRange.end > 65535 || 
        portRange.start > portRange.end) {
        
        vscode.window.showWarningMessage(
            `잘못된 포트 범위 설정입니다. 기본값(10001-10099)을 사용합니다.`
        );
        return {start: 10001, end: 10099};
    }
    
    return portRange;
}

/**
 * Logdy 스크립트 파일을 찾는 함수
 */
async function findLogdyScript(workspaceRoot: string): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const configuredPath = config.get<string>('scriptPath', './run_logdy_safe.sh');

    // 설정된 경로 확인
    const fullPath = path.resolve(workspaceRoot, configuredPath);
    if (fs.existsSync(fullPath)) {
        return fullPath;
    }

    // 워크스페이스 루트에서 스크립트 찾기
    const defaultPaths = [
        'run_logdy_safe.sh',
        'scripts/run_logdy_safe.sh',
        'bin/run_logdy_safe.sh'
    ];

    for (const relativePath of defaultPaths) {
        const scriptPath = path.join(workspaceRoot, relativePath);
        if (fs.existsSync(scriptPath)) {
            return scriptPath;
        }
    }

    return null;
}

/**
 * 현재 활성 워크스페이스 폴더 가져오기
 */
function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        // 활성 에디터의 워크스페이스 폴더를 우선적으로 선택
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (workspaceFolder) {
                return workspaceFolder;
            }
        }

        // 첫 번째 워크스페이스 폴더 반환
        return vscode.workspace.workspaceFolders[0];
    }

    return undefined;
}

/**
 * 모든 실행 중인 프로세스 정리
 */
function cleanup(): void {
    for (const [workspacePath, runningInfo] of runningProcesses) {
        try {
            runningInfo.process.kill('SIGTERM');
        } catch (error) {
            console.error(`프로세스 정리 중 오류 발생 (${workspacePath}):`, error);
        }
    }
    runningProcesses.clear();
    updateStatusBar();
}

/**
 * 익스텐션이 비활성화될 때 호출되는 함수
 */
export function deactivate() {
    console.log('Logdy Runner 익스텐션이 비활성화되었습니다.');
    cleanup();
}