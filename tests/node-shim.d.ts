// 项目没装 @types/node；测试里只用到这几个 Node API，按需声明。
declare module 'fs' {
    export function readFileSync(path: string, encoding: 'utf-8'): string;
    export function readdirSync(path: string): string[];
    export function statSync(path: string): { size: number; isDirectory(): boolean };
}
declare module 'path' {
    export function join(...parts: string[]): string;
}
declare const __dirname: string;
