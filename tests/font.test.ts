import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// 界面像素字体是裁剪过的子集：加了新文字没重新裁剪，新字会用系统字体显示（像素风里很扎眼）。
const ROOT = join(__dirname, '..');

function files(dir: string, ext: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return files(p, ext);
        return p.endsWith(ext) ? [p] : [];
    });
}

/** 和 tools/subset_font.py 的 collect_chars 一致：去掉控制符、空白、emoji */
function needsGlyph(c: string): boolean {
    const code = c.codePointAt(0)!;
    if (c !== ' ' && /[\p{C}\p{Z}\s]/u.test(c)) return false;
    if (code >= 0x1f000) return false;
    if (code >= 0x2600 && code <= 0x27bf) return false;
    return true;
}

describe('像素字体', () => {
    it('游戏里用到的字都裁进了字体（缺字请运行 python tools/subset_font.py）', () => {
        const have = new Set(readFileSync(join(ROOT, 'tools/fonts/camp_pixel.chars.txt'), 'utf-8'));
        const noGlyph = new Set(readFileSync(join(ROOT, 'tools/fonts/camp_pixel.missing.txt'), 'utf-8'));
        const sources = [...files(join(ROOT, 'assets/resources/config'), '.json'), ...files(join(ROOT, 'assets/scripts'), '.ts')];
        const missing = new Set<string>();
        for (const f of sources) {
            for (const c of readFileSync(f, 'utf-8')) if (needsGlyph(c) && !have.has(c) && !noGlyph.has(c)) missing.add(c);
        }
        expect([...missing].join('')).toBe('');
    });

    it('字体文件存在，带着 OFL 许可证', () => {
        expect(statSync(join(ROOT, 'assets/resources/fonts/camp_pixel.ttf')).size).toBeGreaterThan(50_000);
        expect(readFileSync(join(ROOT, 'assets/resources/fonts/LICENSE-fusion-pixel.txt'), 'utf-8')).toContain('SIL OPEN FONT LICENSE');
    });
});
