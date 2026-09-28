// 数值平衡报告：每个探索地点、每种尸潮在不同的训练场 / 路障等级下各打 50 场，统计胜率和平均受伤人数。
//   npm run balance
// 平时跑 npm test 时不输出。战斗参数和游戏里完全一样（expeditionSetup / raidSetup）。

import { expect, it } from 'vitest';
import { Battle, BattleSetup } from '../assets/scripts/core/battle/Battle';
import { BARRICADE_UNIT, battleRegistry, expeditionSetup, raidSetup } from '../assets/scripts/core/combat';
import { loadConfig } from './helpers';

const showReport = (import.meta as unknown as { env: { MODE: string } }).env.MODE === 'balance';
const RUNS = 50;

it('数值平衡报告', () => {
    const config = loadConfig();
    const reg = battleRegistry(config);
    const squad = ['derek', 'ethan', 'martha', 'toby'];
    const defenders = [...squad, 'sophie'];
    const building = (id: string) => config.buildings.find((b) => b.id === id)!;
    const trainingLevels = [0, ...building('training').levels.map((l) => l.battleLevel!)];
    const wallHps = building('wall').levels.map((l) => l.safety! * config.balance.barricadeHpPerSafety);

    const stats = (make: (seed: number) => BattleSetup) => {
        let wins = 0;
        let fallen = 0;
        for (let seed = 1; seed <= RUNS; seed++) {
            const b = new Battle(reg, make(seed));
            if (b.runToEnd() === 'win') wins++;
            fallen += b.side('ally').filter((u) => !u.alive && u.tag !== BARRICADE_UNIT).length;
        }
        return `${String(Math.round((wins / RUNS) * 100)).padStart(3)}%(${(fallen / RUNS).toFixed(1)}伤)`;
    };

    // 中文字符在终端里占两格，按显示宽度补空格才能对齐
    const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(1, w - width(s)));
    const lines: string[] = [];
    const header = (title: string, cols: string[]) => lines.push('', title, pad('', 14) + cols.map((c) => pad(c, 14)).join(''));
    const row = (name: string, cells: string[]) => lines.push(pad(name, 14) + cells.map((c) => pad(c, 14)).join(''));

    header('—— 探索：4 人小队的胜率（平均受伤人数）——', trainingLevels.map((t) => `训练场${t}级`));
    for (const loc of config.locations) {
        row(loc.name, trainingLevels.map((t) => stats((seed) => expeditionSetup(config, loc, squad, 1 + t, seed))));
    }

    const combos = [0, 1, 2].flatMap((w) => [0, 1].map((t) => ({ w, t })));
    header('—— 尸潮：5 人 + 路障的胜率（平均受伤人数）——', combos.map((c) => `路障${c.w + 1}/训练${c.t}`));
    for (const raid of config.raids) {
        row(raid.name, combos.map(({ w, t }) => stats((seed) => raidSetup(config, raid, defenders, wallHps[w], 1 + t, seed))));
    }

    if (showReport) console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
});
