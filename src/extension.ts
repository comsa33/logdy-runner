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
let currentWorkDirectory: string = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('Logdy Runner 익스텐션이 활성화되었습니다.');

    // 초기 작업 디렉토리 설정
    const workspaceFolder = getActiveWorkspaceFolder();
    if (workspaceFolder) {
        currentWorkDirectory = workspaceFolder.uri.fsPath;
    }

    // 사이드바 뷰 프로바이더 등록
    sidebarProvider = new LogdySidebarProvider(context.extensionUri);
    
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

    // 새로고침 명령어 등록
    const refreshCommand = vscode.commands.registerCommand('logdy-runner.refreshView', () => {
        sidebarProvider.refresh();
    });
    
    context.subscriptions.push(refreshCommand);

    // 정리
    context.subscriptions.push(new vscode.Disposable(() => {
        cleanup();
    }));

    console.log('Logdy Runner 익스텐션 등록 완료');
}

async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = require('net').createServer();
        server.listen(port, () => {
            server.close();
            resolve(false);
        });
        server.on('error', () => resolve(true));
    });
}

async function findAvailablePort(): Promise<number> {
    const config = vscode.workspace.getConfiguration('logdy-runner');
    const portRange = config.get<{start: number, end: number}>('portRange', {start: 10001, end: 10099});
    
    for (let port = portRange.start; port <= portRange.end; port++) {
        if (!(await isPortInUse(port))) {
            return port;
        }
    }
    
    throw new Error(`사용 가능한 포트를 찾을 수 없습니다 (범위: ${portRange.start}-${portRange.end})`);
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

async function startLogdy(directory: string, logFile: string): Promise<void> {
    try {
        if (runningInstances.has(directory)) {
            vscode.window.showWarningMessage(`${directory}에서 이미 Logdy가 실행 중입니다.`);
            return;
        }

        const port = await findAvailablePort();
        const logFilePath = path.join(directory, logFile);
        
        // tail + logdy 파이프라인 실행
        const tailProcess = spawn('tail', ['-f', logFilePath], {
            cwd: directory,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const logdyProcess = spawn('logdy', [`--port=${port}`], {
            cwd: directory,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        tailProcess.stdout.pipe(logdyProcess.stdin);

        const cleanup = () => {
            tailProcess.kill();
            logdyProcess.kill();
            runningInstances.delete(directory);
            sidebarProvider.refresh();
        };

        tailProcess.on('error', (error) => {
            vscode.window.showErrorMessage(`tail 오류: ${error.message}`);
            cleanup();
        });

        logdyProcess.on('error', (error) => {
            vscode.window.showErrorMessage(`logdy 오류: ${error.message}`);
            cleanup();
        });

        tailProcess.on('exit', cleanup);
        logdyProcess.on('exit', cleanup);

        const instance: LogdyInstance = {
            process: logdyProcess,
            port,
            logFile,
            directory
        };
        
        runningInstances.set(directory, instance);

        // WebView 열기
        setTimeout(() => {
            openLogdyWebView(`http://localhost:${port}`, port, path.basename(directory));
        }, 2000);

        vscode.window.showInformationMessage(`Logdy 시작: ${path.basename(directory)} (포트: ${port})`);
        sidebarProvider.refresh();

    } catch (error) {
        vscode.window.showErrorMessage(`Logdy 시작 실패: ${error}`);
    }
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

function openLogdyWebView(url: string, port: number, title: string): void {
    const panel = vscode.window.createWebviewPanel(
        'logdyWebView',
        `Logdy - ${title} :${port}`,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logdy</title>
    <style>
        body { margin: 0; padding: 0; }
        iframe { width: 100%; height: 100vh; border: none; }
    </style>
</head>
<body>
    <iframe src="${url}"></iframe>
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

class LogdySidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this.updateWebview();

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
            this._view.webview.html = this.getHtmlForWebview();
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
        .directory-name {
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
                        <span class="directory-name">${dir.name}</span>
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
        const vscode = acquireVsCodeApi();

        function selectWorkDirectory() {
            vscode.postMessage({ type: 'selectWorkDirectory' });
        }

        function startLogdy(directory, logFile) {
            vscode.postMessage({ 
                type: 'startLogdy', 
                directory: directory,
                logFile: logFile
            });
        }

        function stopLogdy(directory) {
            vscode.postMessage({ 
                type: 'stopLogdy', 
                directory: directory
            });
        }

        function configurePortRange() {
            vscode.postMessage({ type: 'configurePortRange' });
        }
    </script>
</body>
</html>`;
    }
}