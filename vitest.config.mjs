import { defineConfig } from 'vitest/config';

export default defineConfig({
    // 根目录的 tsconfig.json 依赖 Cocos 编辑器生成的 temp/ 目录，测试时不读取它
    esbuild: { tsconfigRaw: '{"compilerOptions":{"target":"ES2020"}}' },
    test: { include: ['tests/**/*.test.ts'] },
});
