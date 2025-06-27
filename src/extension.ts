import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface LogdyInstance {
    process: ChildProcess;
    port: number;
    logFile: string;
    directory: string;
}

interface LogDirectory {
    path: string;
    name: string;
    logFiles: string[];
}

const runningInstances = new Map<string, LogdyInstance>();
let sidebarProvider: LogdySidebarProvider;
// let treeDataProvider: LogdyTreeDataProvider; // Legacy - commented out
let currentWorkDirectory: string = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('Logdy Runner 익스텐션이 활성화되었습니다.');

    // code-server 환경 감지
    let isCodeServer = process.env.NODE_ENV === 'production' || 
                       process.env.VSCODE_ENV === 'server' ||
                       context.extensionMode === vscode.ExtensionMode.Production;
    
    console.log('Environment info:', {
        isCodeServer,
        extensionMode: context.extensionMode,
        nodeEnv: process.env.NODE_ENV,
        vscodeEnv: process.env.VSCODE_ENV
    });

    // 초기 작업 디렉토리 설정
    const workspaceFolder = getActiveWorkspaceFolder();
    if (workspaceFolder) {
        currentWorkDirectory = workspaceFolder.uri.fsPath;
    }

    // 사이드바 뷰 프로바이더 등록
    sidebarProvider = new LogdySidebarProvider(context.extensionUri);
    
    try {
        const disposable = vscode.window.registerWebviewViewProvider(
            'logdyView', 
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        
        context.subscriptions.push(disposable);
        console.log('✅ WebviewViewProvider 등록 성공');
    } catch (error) {
        console.error('❌ WebviewViewProvider 등록 실패:', error);
        vscode.window.showErrorMessage(`Logdy Runner 초기화 실패: ${error}`);
    }

    // Legacy TreeDataProvider 등록 (code-server fallback) - commented out since HTTPS works
    /*
    treeDataProvider = new LogdyTreeDataProvider();
    try {
        const treeView = vscode.window.createTreeView('logdyTreeView', {
            treeDataProvider: treeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(treeView);
        console.log('✅ TreeDataProvider 등록 성공');
        
        // code-server에서는 TreeView 활성화
        if (isCodeServer) {
            vscode.commands.executeCommand('setContext', 'logdy.showTreeView', true);
            console.log('🌐 code-server 모드: TreeView 활성화');
        }
    } catch (error) {
        console.error('❌ TreeDataProvider 등록 실패:', error);
    }
    */
    
    // View 활성화 강제 (code-server에서는 더 길게 대기)
    const delay = isCodeServer ? 3000 : 1000;
    setTimeout(() => {
        vscode.commands.executeCommand('workbench.view.extension.logdyContainer').then(
            () => console.log('View 활성화 명령 성공'),
            (err: any) => console.log('View 활성화 명령 실패 (정상적인 경우일 수 있음):', err)
        );
    }, delay);

    // 명령어 등록
    const refreshCommand = vscode.commands.registerCommand('logdy-runner.refreshView', () => {
        console.log('새로고침 명령 실행');
        try {
            sidebarProvider.refresh();
            // treeDataProvider.refresh(); // Legacy - commented out
        } catch (error) {
            console.error('새로고침 실패:', error);
        }
    });

    const startLogdyCommand = vscode.commands.registerCommand('logdy-runner.startLogdy', async (directory?: string, logFile?: string) => {
        if (!directory || !logFile) {
            // 사용자가 선택할 수 있도록 로그 디렉토리 목록 표시
            const logDirectories = currentWorkDirectory ? findLogDirectories(currentWorkDirectory) : [];
            if (logDirectories.length === 0) {
                vscode.window.showErrorMessage('로그 파일을 찾을 수 없습니다. 먼저 작업 디렉토리를 선택하세요.');
                return;
            }
            
            const items = logDirectories.map(dir => ({
                label: dir.logFiles[0]?.replace('.log', '') || 'unknown',
                description: dir.path,
                directory: dir.path,
                logFile: dir.logFiles[0]
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '시작할 로그를 선택하세요'
            });
            
            if (selected) {
                await startLogdy(selected.directory, selected.logFile);
            }
        } else {
            await startLogdy(directory, logFile);
        }
        
        // UI 업데이트
        sidebarProvider.refresh();
        // treeDataProvider.refresh(); // Legacy - commented out
    });

    const stopLogdyCommand = vscode.commands.registerCommand('logdy-runner.stopLogdy', async (directory?: string) => {
        if (!directory) {
            // 실행 중인 인스턴스 목록에서 선택
            const runningDirs = Array.from(runningInstances.keys());
            if (runningDirs.length === 0) {
                vscode.window.showInformationMessage('실행 중인 Logdy가 없습니다.');
                return;
            }
            
            const items = runningDirs.map(dir => ({
                label: path.basename(dir),
                description: dir,
                directory: dir
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '중지할 Logdy를 선택하세요'
            });
            
            if (selected) {
                await stopLogdy(selected.directory);
            }
        } else {
            await stopLogdy(directory);
        }
        
        // UI 업데이트
        sidebarProvider.refresh();
        // treeDataProvider.refresh(); // Legacy - commented out
    });

    const selectWorkDirectoryCommand = vscode.commands.registerCommand('logdy-runner.selectWorkDirectory', async () => {
        await selectWorkDirectory();
        sidebarProvider.refresh();
        // treeDataProvider.refresh(); // Legacy - commented out
    });

    // Legacy TreeView command - commented out
    /*
    const switchToTreeViewCommand = vscode.commands.registerCommand('logdy-runner.switchToTreeView', () => {
        vscode.commands.executeCommand('setContext', 'logdy.showTreeView', true);
        vscode.window.showInformationMessage('TreeView 모드로 전환되었습니다. (code-server 호환 모드)');
    });
    */
    
    context.subscriptions.push(
        refreshCommand,
        startLogdyCommand,
        stopLogdyCommand,
        selectWorkDirectoryCommand
        // switchToTreeViewCommand // Legacy - commented out
    );

    // 정리
    context.subscriptions.push(new vscode.Disposable(() => {
        cleanup();
    }));

    // code-server 특별 처리
    if (isCodeServer) {
        console.log('🌐 code-server 환경에서 실행 중');
        vscode.window.showInformationMessage('Logdy Runner가 code-server 환경에서 실행 중입니다. 일부 기능이 제한될 수 있습니다.');
    }

    console.log('Logdy Runner 익스텐션 등록 완료');
}

async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = require('net').createServer();
        server.listen(port, '127.0.0.1', () => {
            server.close();
            resolve(false); // 포트가 열렸다가 닫혔으므로 사용 가능
        });
        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // 포트가 이미 사용 중
            } else {
                resolve(false); // 다른 오류는 사용 가능으로 처리
            }
        });
    });
}


function findLogFiles(dirPath: string): string[] {
    try {
        const files = fs.readdirSync(dirPath);
        return files.filter(file => 
            file.endsWith('.log') && 
            fs.statSync(path.join(dirPath, file)).isFile()
        );
    } catch (error) {
        return [];
    }
}

function findLogDirectories(rootPath: string): LogDirectory[] {
    const logDirectories: LogDirectory[] = [];
    
    function scanDirectory(dirPath: string, maxDepth: number = 3, currentDepth: number = 0) {
        if (currentDepth >= maxDepth) return;
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const logFiles = findLogFiles(dirPath);
            
            if (logFiles.length > 0) {
                logDirectories.push({
                    path: dirPath,
                    name: path.basename(dirPath),
                    logFiles
                });
            }
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    scanDirectory(path.join(dirPath, entry.name), maxDepth, currentDepth + 1);
                }
            }
        } catch (error) {
            // 권한 없는 디렉토리는 무시
        }
    }
    
    scanDirectory(rootPath);
    return logDirectories;
}

async function startLogdyWithRetry(directory: string, logFile: string, maxRetries: number = 5): Promise<void> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const portRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    const logFilePath = path.join(directory, logFile);

    console.log(`Logdy 시작 시도: ${directory}, 로그파일: ${logFilePath}`);

    // logdy 명령어 존재 확인
    try {
        const logdyCheck = spawn('which', ['logdy'], { stdio: 'pipe' });
        await new Promise<void>((resolve, reject) => {
            logdyCheck.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error('logdy 명령어를 찾을 수 없습니다'));
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        vscode.window.showErrorMessage('logdy 명령어를 찾을 수 없습니다. logdy가 설치되어 있는지 확인하세요.');
        return;
    }

    let attemptedPorts: number[] = [];
    let successfulPort: number | null = null;

    // 포트 범위 내에서 순차적으로 시도
    for (let port = portRange.start; port <= portRange.end && attemptedPorts.length < maxRetries; port++) {
        try {
            // 포트 사용 중인지 먼저 확인
            const portInUse = await isPortInUse(port);
            if (portInUse) {
                console.log(`포트 ${port}는 이미 사용 중, 다음 포트 시도`);
                attemptedPorts.push(port);
                continue;
            }

            console.log(`포트 ${port}에서 Logdy 시작 시도 중...`);
            attemptedPorts.push(port);

            // 프로세스 시작
            const result = await startLogdyOnPort(directory, logFile, port);
            if (result.success) {
                successfulPort = result.actualPort || port;
                const retryMessage = attemptedPorts.length > 1 ? ` [${attemptedPorts.length}번째 시도]` : '';
                vscode.window.showInformationMessage(
                    `🚀 Logdy 시작 성공: ${path.basename(directory)} (포트: ${successfulPort})${retryMessage}`
                );
                console.log(`✅ Logdy 성공: ${directory} 포트 ${successfulPort}`);
                break;
            } else {
                console.log(`❌ 포트 ${port}에서 실패: ${result.error}`);
                // 포트 충돌이면 다음 포트 시도
                if (result.error?.includes('bind: address already in use') || 
                    result.error?.includes('EADDRINUSE')) {
                    console.log(`🔄 포트 ${port} 충돌 감지, 다음 포트로 재시도...`);
                    continue;
                }
                // 다른 오류면 중단
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`포트 ${port}에서 오류:`, error);
            if (port === portRange.end) {
                throw error;
            }
        }
    }

    if (successfulPort === null) {
        const message = `모든 포트에서 Logdy 시작 실패 (시도한 포트: ${attemptedPorts.join(', ')})`;
        console.error(message);
        vscode.window.showErrorMessage(message);
    }
}

async function startLogdyOnPort(directory: string, logFile: string, port: number): Promise<{success: boolean, error?: string, actualPort?: number}> {
    return new Promise((resolve) => {
        const logFilePath = path.join(directory, logFile);
        
        // 백그라운드 프로세스 관리 (실제 프로세스)
        const tailProcess = spawn('tail', ['-f', logFilePath], {
            cwd: directory,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const logdyProcess = spawn('logdy', [`--port=${port}`], {
            cwd: directory,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let errorOutput = '';
        let hasStarted = false;
        let startTimeout: NodeJS.Timeout;
        let terminal: vscode.Terminal | null = null;

        // 로그 출력 캡처
        logdyProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`Logdy stdout (포트 ${port}):`, output);
            
            // 성공적으로 시작되었는지 확인
            if (output.includes('WebUI started') || output.includes(`http://127.0.0.1:${port}`)) {
                hasStarted = true;
                clearTimeout(startTimeout);
                
                // 성공한 후에만 터미널 생성 (같은 포트로)
                terminal = vscode.window.createTerminal({
                    name: `✅ Logdy-${path.basename(directory)}-${port}`,
                    cwd: directory
                });
                
                terminal.sendText(`echo "=== ✅ Logdy 성공: ${logFilePath} (포트: ${port}) ===" && echo "웹 인터페이스: http://localhost:${port}"`);
                terminal.show();
                
                const instance: LogdyInstance = {
                    process: logdyProcess,
                    port,
                    logFile,
                    directory
                };
                
                runningInstances.set(directory, instance);
                
                // 웹뷰 열기 (실제 성공한 포트로)
                setTimeout(() => {
                    openLogdyWebView(`http://localhost:${port}`, port, path.basename(directory));
                }, 1000);
                
                sidebarProvider.refresh();
                resolve({success: true, actualPort: port});
            }
        });

        logdyProcess.stderr.on('data', (data) => {
            const output = data.toString();
            errorOutput += output;
            console.log(`Logdy stderr (포트 ${port}):`, output);
            
            // 포트 충돌 감지
            if (output.includes('bind: address already in use') || 
                output.includes('EADDRINUSE')) {
                console.log(`❌ 포트 ${port} 충돌 확인됨`);
                clearTimeout(startTimeout);
                cleanup();
                resolve({success: false, error: 'bind: address already in use'});
            }
        });

        tailProcess.stdout.on('data', (data) => {
            console.log(`Tail output (${logFile}):`, data.toString().substring(0, 100) + '...');
        });

        tailProcess.stdout.pipe(logdyProcess.stdin);

        const cleanup = () => {
            console.log(`Logdy 정리: ${directory}, 포트: ${port}`);
            try {
                tailProcess.kill();
                logdyProcess.kill();
                if (terminal) {
                    terminal.dispose();
                }
            } catch (e) {
                console.log('정리 중 오류:', e);
            }
            // 성공하지 못한 경우에만 runningInstances에서 제거
            if (!hasStarted) {
                runningInstances.delete(directory);
                sidebarProvider.refresh();
            }
        };

        // 오류 처리
        tailProcess.on('error', (error) => {
            console.error(`tail 오류 (${logFile}):`, error);
            clearTimeout(startTimeout);
            cleanup();
            resolve({success: false, error: `tail 오류: ${error.message}`});
        });

        logdyProcess.on('error', (error) => {
            console.error(`logdy 오류 (포트 ${port}):`, error);
            clearTimeout(startTimeout);
            cleanup();
            resolve({success: false, error: `logdy 오류: ${error.message}`});
        });

        // 프로세스 종료 처리
        logdyProcess.on('exit', (code, signal) => {
            console.log(`logdy 종료 (포트 ${port}): code=${code}, signal=${signal}`);
            if (!hasStarted && code !== 0) {
                clearTimeout(startTimeout);
                cleanup();
                resolve({success: false, error: errorOutput || `logdy 프로세스가 코드 ${code}로 종료됨`});
            } else if (hasStarted) {
                // 정상 종료인 경우 정리
                runningInstances.delete(directory);
                sidebarProvider.refresh();
            }
        });

        // 시작 타임아웃 (5초로 단축)
        startTimeout = setTimeout(() => {
            if (!hasStarted) {
                console.log(`⏰ 포트 ${port}에서 시작 타임아웃`);
                cleanup();
                resolve({success: false, error: '시작 타임아웃'});
            }
        }, 5000);
    });
}

async function startLogdy(directory: string, logFile: string): Promise<void> {
    try {
        if (runningInstances.has(directory)) {
            vscode.window.showWarningMessage(`${directory}에서 이미 Logdy가 실행 중입니다.`);
            return;
        }

        await startLogdyWithRetry(directory, logFile);

    } catch (error) {
        console.error('Logdy 시작 실패:', error);
        vscode.window.showErrorMessage(`Logdy 시작 실패: ${error}`);
    }
}

async function getForwardedAddress(port: number): Promise<string> {
    try {
        // VS Code의 포트 포워딩 API 사용
        const forwardedPort = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${port}`));
        const forwardedUrl = forwardedPort.toString();
        
        console.log(`포트 ${port} 포워딩 URL: ${forwardedUrl}`);
        
        // code-server의 포워딩된 URL 반환 (예: https://domain.com/proxy/10001/)
        if (forwardedUrl !== `http://localhost:${port}/`) {
            return forwardedUrl;
        }
    } catch (error) {
        console.error('포트 포워딩 URL 가져오기 실패:', error);
    }
    
    // fallback: localhost 사용
    return `http://localhost:${port}`;
}

async function stopLogdy(directory: string): Promise<void> {
    const instance = runningInstances.get(directory);
    if (instance) {
        instance.process.kill('SIGTERM');
        runningInstances.delete(directory);
        sidebarProvider.refresh();
        vscode.window.showInformationMessage(`Logdy 중지: ${path.basename(directory)}`);
    }
}

async function openLogdyWebView(originalUrl: string, port: number, title: string): Promise<void> {
    // code-server 포트 포워딩 주소 가져오기
    const forwardedUrl = await getForwardedAddress(port);
    
    console.log(`웹뷰 URL: 원본 ${originalUrl} → 포워딩 ${forwardedUrl}`);
    
    const panel = vscode.window.createWebviewPanel(
        'logdyWebView',
        `Logdy - ${title} :${port}`,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
            portMapping: [
                {
                    webviewPort: port,
                    extensionHostPort: port
                }
            ]
        }
    );

    // 웹뷰에서 메시지 처리
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
            case 'openExternal':
                // 외부 브라우저에서도 포워딩된 URL 사용
                const externalUrl = await getForwardedAddress(port);
                vscode.env.openExternal(vscode.Uri.parse(externalUrl));
                break;
            case 'checkServer':
                // VS Code API를 통해 서버 상태 확인
                try {
                    const response = await fetch(message.url);
                    panel.webview.postMessage({
                        type: 'serverStatus',
                        status: response.ok ? 'success' : 'error',
                        statusCode: response.status
                    });
                } catch (error) {
                    panel.webview.postMessage({
                        type: 'serverStatus',
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                break;
        }
    });

    // 웹뷰 HTML - fetch 대신 바로 iframe으로 시도
    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logdy</title>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .loading {
            text-align: center;
            padding: 50px;
        }
        .error {
            color: var(--vscode-errorForeground);
            text-align: center;
            padding: 50px;
        }
        .success {
            text-align: center;
            padding: 20px;
        }
        iframe { 
            width: 100%; 
            height: calc(100vh - 100px); 
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }
        .info {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .retry-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 10px;
        }
        .iframe-container {
            position: relative;
        }
        .iframe-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--vscode-editor-background);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>Logdy 서버:</strong> ${forwardedUrl}<br>
        <strong>디렉토리:</strong> ${title}<br>
        <strong>포트:</strong> ${port}
    </div>
    
    <div class="iframe-container">
        <iframe id="logdy-iframe" src="${forwardedUrl}" title="Logdy Interface" style="opacity: 0;"></iframe>
        <div id="iframe-overlay" class="iframe-overlay">
            <div class="loading">
                <p>🔄 Logdy 인터페이스 로딩 중...</p>
                <p>서버가 응답하지 않으면 아래 버튼을 사용하세요.</p>
                <div style="margin-top: 20px;">
                    <button class="retry-btn" onclick="reloadIframe()">🔄 새로고침</button>
                    <button class="retry-btn" onclick="openExternal()">🌐 외부 브라우저에서 열기</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const iframe = document.getElementById('logdy-iframe');
        const overlay = document.getElementById('iframe-overlay');
        let loadTimeout;
        
        function showContent() {
            iframe.style.opacity = '1';
            overlay.classList.add('hidden');
            console.log('✅ Logdy 인터페이스 로드 완료');
        }
        
        function showError(message) {
            overlay.innerHTML = \`
                <div class="error">
                    <h3>❌ Logdy 인터페이스 로드 실패</h3>
                    <p><strong>URL:</strong> ${forwardedUrl}</p>
                    <p><strong>오류:</strong> \${message}</p>
                    <p>외부 브라우저에서는 정상 작동할 수 있습니다.</p>
                    <div style="margin-top: 20px;">
                        <button class="retry-btn" onclick="reloadIframe()">🔄 다시 시도</button>
                        <button class="retry-btn" onclick="openExternal()">🌐 외부 브라우저에서 열기</button>
                    </div>
                </div>
            \`;
        }
        
        function reloadIframe() {
            console.log('🔄 iframe 새로고침');
            iframe.style.opacity = '0';
            overlay.classList.remove('hidden');
            overlay.innerHTML = \`
                <div class="loading">
                    <p>🔄 Logdy 인터페이스 새로고침 중...</p>
                </div>
            \`;
            
            iframe.src = iframe.src; // 강제 새로고침
            startLoadTimeout();
        }
        
        function openExternal() {
            vscode.postMessage({
                type: 'openExternal',
                url: '${forwardedUrl}'
            });
        }
        
        function startLoadTimeout() {
            clearTimeout(loadTimeout);
            loadTimeout = setTimeout(() => {
                if (iframe.style.opacity === '0') {
                    console.log('⏰ iframe 로드 타임아웃');
                    showError('로드 타임아웃 (15초)');
                }
            }, 15000);
        }
        
        // iframe 로드 이벤트 처리
        iframe.onload = function() {
            console.log('📄 iframe onload 이벤트');
            clearTimeout(loadTimeout);
            setTimeout(showContent, 1000); // 1초 후 표시 (컨텐츠 로딩 시간 고려)
        };
        
        iframe.onerror = function() {
            console.log('❌ iframe onerror 이벤트');
            clearTimeout(loadTimeout);
            showError('네트워크 연결 오류');
        };
        
        // 초기 로드 타임아웃 시작
        startLoadTimeout();
        
        // 3초 후에도 로딩 중이면 힌트 메시지 업데이트
        setTimeout(() => {
            if (iframe.style.opacity === '0') {
                overlay.innerHTML = \`
                    <div class="loading">
                        <p>⏳ Logdy 서버 응답 대기 중...</p>
                        <p>서버가 시작되고 있을 수 있습니다. 잠시만 기다려주세요.</p>
                        <div style="margin-top: 20px;">
                            <button class="retry-btn" onclick="reloadIframe()">🔄 새로고침</button>
                            <button class="retry-btn" onclick="openExternal()">🌐 외부 브라우저에서 열기</button>
                        </div>
                    </div>
                \`;
            }
        }, 3000);
    </script>
</body>
</html>`;
}

async function configurePortRange(): Promise<void> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const currentRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    
    const startPortInput = await vscode.window.showInputBox({
        prompt: '시작 포트 번호',
        value: currentRange.start.toString(),
        validateInput: (value) => {
            const port = parseInt(value);
            return (isNaN(port) || port < 1024 || port > 65535) ? '1024-65535 범위의 포트를 입력하세요' : null;
        }
    });
    
    if (!startPortInput) return;
    const startPort = parseInt(startPortInput);
    
    const endPortInput = await vscode.window.showInputBox({
        prompt: '종료 포트 번호',
        value: currentRange.end.toString(),
        validateInput: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1024 || port > 65535) return '1024-65535 범위의 포트를 입력하세요';
            if (port <= startPort) return `시작 포트(${startPort})보다 큰 값을 입력하세요`;
            return null;
        }
    });
    
    if (!endPortInput) return;
    const endPort = parseInt(endPortInput);
    
    try {
        await config.update('portRange', {start: startPort, end: endPort}, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`포트 범위 설정: ${startPort}-${endPort}`);
        sidebarProvider.refresh();
    } catch (error) {
        vscode.window.showErrorMessage(`설정 저장 실패: ${error}`);
    }
}

async function selectWorkDirectory(): Promise<void> {
    const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '작업 디렉토리 선택'
    });

    if (selectedFolder && selectedFolder.length > 0) {
        currentWorkDirectory = selectedFolder[0].fsPath;
        vscode.window.showInformationMessage(`작업 디렉토리: ${currentWorkDirectory}`);
        sidebarProvider.refresh();
    }
}

function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0];
    }
    return undefined;
}

function cleanup(): void {
    for (const [directory, instance] of runningInstances) {
        try {
            instance.process.kill('SIGTERM');
        } catch (error) {
            console.error(`정리 중 오류 (${directory}):`, error);
        }
    }
    runningInstances.clear();
}

export function deactivate() {
    console.log('Logdy Runner 익스텐션이 비활성화되었습니다.');
    cleanup();
}

// Legacy TreeDataProvider for code-server fallback - commented out since HTTPS works
/*
class LogdyTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly directory?: string,
        public readonly logFile?: string,
        public readonly isRunning?: boolean
    ) {
        super(label, collapsibleState);
        
        if (directory && logFile) {
            this.tooltip = `${directory}/${logFile}`;
            this.description = this.isRunning ? '🟢 실행 중' : '🔴 중지';
            this.contextValue = this.isRunning ? 'logdyItemRunning' : 'logdyItemStopped';
            this.command = {
                command: this.isRunning ? 'logdy-runner.stopLogdy' : 'logdy-runner.startLogdy',
                title: this.isRunning ? 'Logdy 중지' : 'Logdy 시작',
                arguments: [directory, logFile]
            };
        }
    }
}

class LogdyTreeDataProvider implements vscode.TreeDataProvider<LogdyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<LogdyTreeItem | undefined | null | void> = new vscode.EventEmitter<LogdyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<LogdyTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LogdyTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: LogdyTreeItem): Thenable<LogdyTreeItem[]> {
        if (!currentWorkDirectory) {
            return Promise.resolve([
                new LogdyTreeItem(
                    '작업 디렉토리를 선택하세요',
                    vscode.TreeItemCollapsibleState.None
                )
            ]);
        }

        if (!element) {
            // 루트 노드들
            const logDirectories = findLogDirectories(currentWorkDirectory);
            
            if (logDirectories.length === 0) {
                return Promise.resolve([
                    new LogdyTreeItem(
                        '로그 파일을 찾을 수 없습니다',
                        vscode.TreeItemCollapsibleState.None
                    )
                ]);
            }

            const items = logDirectories.map(dir => {
                const isRunning = runningInstances.has(dir.path);
                const logFileName = dir.logFiles[0]?.replace('.log', '') || 'unknown';
                const displayName = dir.logFiles.length > 1 
                    ? `${logFileName} (+${dir.logFiles.length - 1})`
                    : logFileName;
                
                return new LogdyTreeItem(
                    displayName,
                    vscode.TreeItemCollapsibleState.None,
                    dir.path,
                    dir.logFiles[0],
                    isRunning
                );
            });

            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }
}
*/

class LogdySidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('LogdySidebarProvider: resolveWebviewView 호출됨');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
            enableCommandUris: true,
            enableForms: true
        };

        this.updateWebview();
        console.log('LogdySidebarProvider: 웹뷰 업데이트 완료');

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'selectWorkDirectory':
                    await selectWorkDirectory();
                    break;
                case 'startLogdy':
                    await startLogdy(data.directory, data.logFile);
                    break;
                case 'stopLogdy':
                    await stopLogdy(data.directory);
                    break;
                case 'configurePortRange':
                    await configurePortRange();
                    break;
            }
        });
    }

    public refresh() {
        this.updateWebview();
    }

    private updateWebview() {
        if (this._view) {
            console.log('LogdySidebarProvider: HTML 생성 시작');
            this._view.webview.html = this.getHtmlForWebview();
            console.log('LogdySidebarProvider: HTML 생성 완료');
        } else {
            console.log('LogdySidebarProvider: _view가 null입니다');
        }
    }

    private getHtmlForWebview(): string {
        const config = vscode.workspace.getConfiguration('logdy-runner');
        const portRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
        const logDirectories = currentWorkDirectory ? findLogDirectories(currentWorkDirectory) : [];

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';">
    <title>Logdy Runner</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 16px;
        }
        .section {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
        }
        .section-title {
            font-weight: bold;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .button {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button-danger {
            background-color: #d73a49;
            color: white;
        }
        .log-directory {
            margin-bottom: 8px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        .directory-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .log-file-name {
            font-weight: bold;
            font-size: 0.9em;
        }
        .directory-path {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .log-files {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
        }
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .running {
            background-color: #28a745;
        }
        .stopped {
            background-color: #dc3545;
        }
        .work-directory-info {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            word-break: break-all;
        }
        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .setting-label {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .setting-value {
            font-size: 0.9em;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <!-- 작업 디렉토리 섹션 -->
    <div class="section">
        <div class="section-title">
            작업 디렉토리
            <button class="button button-secondary" onclick="selectWorkDirectory()">📁 선택</button>
        </div>
        <div class="work-directory-info">
            ${currentWorkDirectory || '디렉토리가 선택되지 않았습니다'}
        </div>
    </div>

    <!-- 로그 디렉토리 섹션 -->
    ${logDirectories.length > 0 ? `
    <div class="section">
        <div class="section-title">로그 디렉토리 (${logDirectories.length}개)</div>
        ${logDirectories.map(dir => {
            const isRunning = runningInstances.has(dir.path);
            const instance = runningInstances.get(dir.path);
            return `
            <div class="log-directory">
                <div class="directory-header">
                    <div style="display: flex; align-items: center;">
                        <div class="status-indicator ${isRunning ? 'running' : 'stopped'}"></div>
                        <span class="log-file-name">${dir.logFiles[0]?.replace('.log', '') || 'unknown'}${dir.logFiles.length > 1 ? ` (+${dir.logFiles.length - 1})` : ''}</span>
                        ${isRunning ? `<span style="margin-left: 8px; font-size: 0.8em; color: #28a745;">:${instance?.port}</span>` : ''}
                    </div>
                    ${isRunning ? 
                        `<button class="button button-danger" onclick="stopLogdy('${dir.path}')">⏹️ 중지</button>` :
                        `<button class="button" onclick="startLogdy('${dir.path}', '${dir.logFiles[0]}')">▶️ 시작</button>`
                    }
                </div>
                <div class="directory-path">${dir.path}</div>
                <div class="log-files">로그 파일: ${dir.logFiles.join(', ')}</div>
            </div>
            `;
        }).join('')}
    </div>
    ` : currentWorkDirectory ? `
    <div class="section">
        <div class="section-title">로그 디렉토리</div>
        <div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 20px;">
            선택한 디렉토리에서 .log 파일을 찾을 수 없습니다.
        </div>
    </div>
    ` : ''}

    <!-- 설정 섹션 -->
    <div class="section">
        <div class="section-title">설정</div>
        <div class="setting-item">
            <span class="setting-label">포트 범위:</span>
            <span class="setting-value">${portRange.start}-${portRange.end}</span>
        </div>
        <button class="button button-secondary" onclick="configurePortRange()">
            ⚙️ 포트 범위 설정
        </button>
    </div>

    <script>
        // code-server 환경 감지
        const isCodeServer = window.location.hostname !== 'localhost' || 
                           window.location.protocol !== 'vscode-webview:' ||
                           navigator.userAgent.includes('code-server');
        
        console.log('Environment:', {
            isCodeServer,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            userAgent: navigator.userAgent
        });

        let vscode;
        try {
            vscode = acquireVsCodeApi();
            console.log('VS Code API acquired successfully');
        } catch (error) {
            console.error('Failed to acquire VS Code API:', error);
            // code-server에서 실패할 경우 fallback
            vscode = {
                postMessage: function(message) {
                    console.log('Fallback postMessage:', message);
                    // 실제 기능은 제한되지만 오류 방지
                }
            };
        }

        function selectWorkDirectory() {
            try {
                vscode.postMessage({ type: 'selectWorkDirectory' });
            } catch (error) {
                console.error('selectWorkDirectory error:', error);
                alert('code-server 환경에서는 일부 기능이 제한될 수 있습니다.');
            }
        }

        function startLogdy(directory, logFile) {
            try {
                vscode.postMessage({ 
                    type: 'startLogdy', 
                    directory: directory,
                    logFile: logFile
                });
            } catch (error) {
                console.error('startLogdy error:', error);
                alert('code-server 환경에서는 일부 기능이 제한될 수 있습니다.');
            }
        }

        function stopLogdy(directory) {
            try {
                vscode.postMessage({ 
                    type: 'stopLogdy', 
                    directory: directory
                });
            } catch (error) {
                console.error('stopLogdy error:', error);
                alert('code-server 환경에서는 일부 기능이 제한될 수 있습니다.');
            }
        }

        function configurePortRange() {
            try {
                vscode.postMessage({ type: 'configurePortRange' });
            } catch (error) {
                console.error('configurePortRange error:', error);
                alert('code-server 환경에서는 일부 기능이 제한될 수 있습니다.');
            }
        }
        
        // code-server 환경 정보 표시
        if (isCodeServer) {
            console.warn('Running in code-server environment. Some features may be limited.');
            
            // 환경 정보를 사용자에게 표시
            setTimeout(() => {
                const envInfo = document.createElement('div');
                envInfo.style.cssText = \`
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: #ff9800;
                    color: white;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    z-index: 1000;
                    cursor: pointer;
                \`;
                envInfo.textContent = 'code-server 환경';
                envInfo.title = 'code-server 환경에서 실행 중입니다. 일부 기능이 제한될 수 있습니다.';
                document.body.appendChild(envInfo);
                
                // 5초 후 자동 제거
                setTimeout(() => envInfo.remove(), 5000);
            }, 1000);
        }
    </script>
</body>
</html>`;
    }
}