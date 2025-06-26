import { glob } from 'glob';
import Mocha from 'mocha';
import * as path from 'path';

/**
 * 테스트 스위트 실행 함수
 */
export function run(): Promise<void> {
    // 새로운 Mocha 인스턴스 생성
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        // 테스트 파일들 찾기 (최신 glob 사용)
        glob('**/**.test.js', { cwd: testsRoot })
            .then((files: string[]) => {
                // 각 테스트 파일을 mocha에 추가
                files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

                try {
                    // 테스트 실행
                    mocha.run((failures: number) => {
                        if (failures > 0) {
                            reject(new Error(`${failures}개의 테스트가 실패했습니다.`));
                        } else {
                            resolve();
                        }
                    });
                } catch (err) {
                    console.error(err);
                    reject(err);
                }
            })
            .catch((err: Error) => {
                reject(err);
            });
    });
}