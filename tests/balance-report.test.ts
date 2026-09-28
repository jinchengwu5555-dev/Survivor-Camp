// 数值平衡报告：每个探索地点、每种尸潮在不同的训练场 / 栅栏等级下各打 50 场，统计胜率和平均受伤人数。
// 最后一张表是无尽模式：不同加成的尸潮对上不同建设进度的营地。
//   npm run balance
// 平时跑 npm test 时不输出。战斗参数和游戏里完全一样（expeditionSetup / raidSetup）。

import { expect, it } from 'vitest';
import { Battle, BattleSetup } from '../assets/scripts/core/battle/Battle';
import { BARRICADE_UNIT, battleRegistry, expeditionSetup, raidSetup } from '../assets/scripts/core/combat';
import { loadConfig } from './helpers';

const showReport = (import.meta as unknown as { env: { MODE: string } }).env.MODE === 'balance';
const RUNS = 50;

// 要打上千场战斗，平时跑 npm test 时跳过
it.runIf(showReport)('数值平衡报告', { timeout: 120_000 }, () => {
    const config = loadConfig();
    const reg = battleRegistry(config);
    const member = (id: string) => ({ id, unit: config.survivors.find((d) => d.id === id)!.battleUnit! });
    const squad = ['derek', 'ethan', 'martha', 'toby'].map(member);
    const defenders = [...squad, member('sophie')];
    const building = (id: string) => config.buildings.find((b) => b.id === id)!;
    const trainingLevels = [0, 1, 2, 3, 5, 10];
    const wallHp = (level: number) => building('wall').levels[level - 1].safety! * config.balance.barricadeHpPerSafety;
    const battleLevel = (trainingLevel: number) => 1 + (trainingLevel > 0 ? building('training').levels[trainingLevel - 1].battleLevel! : 0);

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
    const header = (title: string, cols: string[]) => lines.push('', title, pad('', 20) + cols.map((c) => pad(c, 14)).join(''));
    const row = (name: string, cells: string[]) => lines.push(pad(name, 20) + cells.map((c) => pad(c, 14)).join(''));

    header('—— 探索：4 人小队的胜率（平均受伤人数）——', trainingLevels.map((t) => `训练场${t}级`));
    for (const loc of config.locations) {
        row(loc.name, trainingLevels.map((t) => stats((seed) => expeditionSetup(config, loc, squad, battleLevel(t), seed))));
    }

    const combos = [1, 2, 3, 4].flatMap((w) => [0, 2].map((t) => ({ w, t })));
    header('—— 尸潮：5 人 + 栅栏的胜率（平均受伤人数）——', combos.map((c) => `栅栏${c.w}/训练${c.t}`));
    for (const raid of config.raids) {
        for (const bloodMoon of [false, true]) {
            for (const dog of bloodMoon ? [false, true] : [false]) {
                const name = `${bloodMoon ? '血月·' : ''}${raid.name}${dog ? '+狗' : ''}`;
                row(name, combos.map(({ w, t }) => stats((seed) => raidSetup(config, raid, defenders, wallHp(w), battleLevel(t), seed, { bloodMoon, dog }))));
            }
        }
    }

    // 无尽模式：营地建设进度（栅栏 = 训练场 = 指挥部等级）对上不同加成的大尸潮
    const great = config.raids[config.raids.length - 1];
    const camps = [5, 10, 15, 20, 25];
    header(`—— 无尽尸潮：${great.name}+N 对上不同建设进度的营地（栅栏、训练场都和指挥部同级）——`, camps.map((lv) => `营地${lv}级`));
    for (const bonus of [0, 5, 10, 20, 30, 40, 50]) {
        row(`${great.name} +${bonus}`, camps.map((lv) => stats((seed) => raidSetup(config, great, defenders, wallHp(lv), battleLevel(lv), seed, { enemyBonus: bonus }))));
    }

    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
});
