import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Cocos 的 LEFT / RIGHT 对齐在部分机型、部分版本上会把字画到框外面去（资源栏、战报跑出画面）。
// 界面上所有文字都用居中对齐：靠左 / 靠右的字由 widgets.ts 的 addLabel（align）和 addParagraph 处理。
describe('界面文字对齐', () => {
    it('ui/ 里不直接用 Cocos 的靠左 / 靠右对齐', () => {
        const dir = join(__dirname, '../assets/scripts/ui');
        const offenders: string[] = [];
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
            const text = readFileSync(join(dir, f), 'utf-8');
            text.split('\n').forEach((line, i) => {
                if (/HorizontalAlign\.(LEFT|RIGHT)/.test(line)) offenders.push(`${f}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
