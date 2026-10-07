import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './helpers';

// 美术图的文件名要和配置对得上，不然游戏找不到图、悄悄退回色块（见 docs/art-assets.md）
const ROOT = join(__dirname, '..');
const SPRITES = join(ROOT, 'assets/resources/sprites');
const BACKGROUNDS = ['bg_camp', 'bg_town', 'bg_battle', 'bg_bloodmoon', 'bg_title'];

function pngs(dir: string): string[] {
    const p = join(SPRITES, dir);
    return existsSync(p) ? readdirSync(p).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : [];
}

/** 建筑可用的图名：通用图 + 每个阶段一张 */
function buildingNames(): Set<string> {
    const names = new Set<string>();
    for (const b of loadConfig().buildings) {
        names.add(`building_${b.id}`);
        (b.stages ?? []).forEach((_, i) => names.add(`building_${b.id}_${i + 1}`));
    }
    return names;
}

describe('美术资源命名', () => {
    it('战斗小人的图都对应 units.json 里的 sprite', () => {
        const used = new Set(loadConfig().units.map((u) => u.appearance.sprite));
        for (const name of pngs('units')) expect(used, `sprites/units/${name}.png 没有单位在用`).toContain(name);
    });

    it('建筑图都对应某个建筑或它的阶段', () => {
        const names = buildingNames();
        for (const name of pngs('buildings')) expect(names, `sprites/buildings/${name}.png 对不上建筑`).toContain(name);
    });

    it('背景图名字是游戏认识的', () => {
        for (const name of pngs('bg')) expect(BACKGROUNDS).toContain(name);
    });

    it('美术清单列出了每个建筑的通用图和阶段图', () => {
        const doc = readFileSync(join(ROOT, 'docs/art-assets.md'), 'utf-8');
        for (const name of buildingNames()) expect(doc, `docs/art-assets.md 缺 ${name}.png`).toContain(`\`${name}.png\``);
        for (const name of BACKGROUNDS) expect(doc).toContain(`\`${name}.png\``);
    });
});

describe('音效', () => {
    it('platform/Audio.ts 里的每个音效、音乐都有文件（python tools/make_audio.py 生成）', () => {
        const src = readFileSync(join(ROOT, 'assets/scripts/platform/Audio.ts'), 'utf-8');
        const list = (name: string) => JSON.parse(src.match(new RegExp(`const ${name}: \\w+\\[\\] = (\\[[^\\]]*\\])`))![1].replace(/'/g, '"')) as string[];
        const dir = join(ROOT, 'assets/resources/audio');
        const have = new Set(readdirSync(dir).map((f) => f.replace(/\.(wav|mp3)$/, '')));
        for (const s of list('SFX')) expect(have, `缺 audio/sfx_${s}`).toContain(`sfx_${s}`);
        for (const m of list('MUSIC')) expect(have, `缺 audio/music_${m}`).toContain(`music_${m}`);
    });
});
