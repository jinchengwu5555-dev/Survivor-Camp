// 经济节奏报告：模拟一个“普通玩家”玩 24 小时（每 10 分钟上线一次：分配工作、有钱就升级、事件选第一个能选的），
// 每 2 小时打印一次资源、士气、守夜战绩和建筑进度。
//   npm run economy
// 平时跑 npm test 时跳过。用来检查季节、腐烂、建筑成本是否让营地有持续的压力。

import { expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { morale } from '../assets/scripts/core/economy';
import { seasonAt } from '../assets/scripts/core/seasons';
import { loadConfig, MIN, T0 } from './helpers';

const showReport = (import.meta as unknown as { env: { MODE: string } }).env.MODE === 'economy';
const HOURS = 24;
const JOBS: Record<string, string> = { martha: 'kitchen', toby: 'kitchen', derek: 'scrapyard', sophie: 'scrapyard' };
const BUILD_ORDER = ['kitchen', 'wall', 'dorm', 'hq', 'cellar', 'training', 'workshop', 'scrapyard', 'infirmary'];

it.runIf(showReport)('经济节奏报告', { timeout: 120_000 }, () => {
    const game = CampGame.newGame(loadConfig(), T0, 3);
    const lines: string[] = ['时间  季节  食物  木材  零件  士气  人数  伤员  守夜胜/负  成就  已满级建筑'];
    for (let m = 0; m <= HOURS * 60; m += 10) {
        const now = T0 + m * MIN;
        game.tick(now);
        for (let guard = 0; game.currentEvent && guard < 10; guard++) {
            const choices = game.currentEvent.choices.length;
            let ok = false;
            for (let i = 0; i < choices && !ok; i++) ok = game.choose(i, now).ok;
            if (!ok) game.state.eventQueue.shift();
        }
        for (const [id, job] of Object.entries(JOBS)) game.assign(id, job, now);
        for (const b of BUILD_ORDER) if (game.upgrade(b, now).ok) break;

        if (m % 120 === 0) {
            const s = game.state;
            const season = seasonAt(game.config, s, now).season;
            const maxed = game.config.buildings.filter((b) => s.buildings[b.id].level >= b.levels.length).length;
            const r = (n: number) => String(Math.round(n)).padStart(4);
            lines.push(
                `${String(m / 60).padStart(3)}h  ${season.icon}   ${r(s.resources.food)}  ${r(s.resources.wood)}  ${r(s.resources.parts)}  ${r(morale(s))}  ${r(s.survivors.length)}  ${r(s.survivors.filter((x) => x.injured).length)}  ${r(s.stats.raids_won ?? 0)}/${s.stats.raids_lost ?? 0}     ${r(s.achievements.length)}  ${maxed}/${game.config.buildings.length}`,
            );
        }
    }
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(1);
});
