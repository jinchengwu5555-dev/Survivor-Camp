// 经济节奏报告：模拟一个普通玩家玩 60 天（真实时间）。前 14 天每天一行，之后每 3 天一行。
//   npm run economy
// 平时跑 npm test 时跳过。
//
// 玩家模型：每天 8:00～22:00 每 2 小时上线一次（一天 8 次），每次在线 5 分钟（一天共 40 分钟在线），其余时间离线。
// 游戏时间只在在线时走（见 core/clock.ts），离线回来先领挂机收益。在线期间每秒一次心跳，每分钟操作一次：
//   处理事件（选第一个能选的）→ 分配工作（厨房：为下一级指挥部攒粮时排满，否则够吃就行；其余人去废料场、医务室）→ 闲着的人够 2 个就去探索 → 升级（缺粮先升厨房，缺零件先升废料场，否则挑最便宜的）
//   探索：有没打过的地点就去打；否则去上次打赢过、战利品最多的地点
// 不看广告、不做物品、不接悬赏，代表“最低投入”的玩家（会顺手捡营地附近的东西、领每日目标、打开背包里的资源箱和加速道具）。

import { expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { availableLocations, clearedFlag, expeditionBlocker, raidEnemyBonus, suggestSquad } from '../assets/scripts/core/combat';
import { suggestSurveyors } from '../assets/scripts/core/districts';
import { buildVehicleBlocker } from '../assets/scripts/core/vehicles';
import { economyRates, hqLevel, morale, workerSlots } from '../assets/scripts/core/economy';
import { upgradeBlocker } from '../assets/scripts/core/buildings';
import { currentDay } from '../assets/scripts/core/state';
import { seasonAt } from '../assets/scripts/core/seasons';
import { RESOURCE_IDS } from '../assets/scripts/core/types';
import { activePickups } from '../assets/scripts/core/pickups';
import { loadConfig, MIN, T0 } from './helpers';

const showReport = (import.meta as unknown as { env: { MODE: string } }).env.MODE === 'economy';
const REAL_DAYS = 60;
const SESSION_HOURS = [8, 10, 12, 14, 16, 18, 20, 22];
const HOUR = 60 * MIN;
const PRODUCERS = ['kitchen', 'scrapyard', 'infirmary'];

const lootValue = (bag: Partial<Record<string, number>>) => Object.values(bag).reduce((sum: number, n) => sum + (n ?? 0), 0);

/** 打输过的地点：记下当时训练场的等级，训练场没升级之前不再去送死 */
const lostAtTraining = new WeakMap<CampGame, Map<string, number>>();

function session(game: CampGame, now: number): void {
    const { config, state } = game;
    const lost = lostAtTraining.get(game) ?? new Map<string, number>();
    lostAtTraining.set(game, lost);
    const training = state.buildings.training?.level ?? 0;
    for (const r of state.reports) {
        if (r.kind === 'expedition' && r.result === 'lose' && !lost.has(`${r.title}@${r.at}`)) {
            lost.set(`${r.title}@${r.at}`, 0);
            lost.set(r.title, training);
        }
    }
    // 背包里的装备：给还空着这个位置的人穿上
    for (const def of config.props) {
        if (def.type !== 'gear' || !def.slot) continue;
        for (const s of state.survivors) {
            if ((state.props?.[def.id] ?? 0) <= 0) break;
            if (!s.gear?.[def.slot]) game.equip(s.id, def.id, now);
        }
    }
    // 捡掉营地附近的东西、领每日目标
    for (const p of activePickups(state, now)) game.collectPickup(p.id, now);
    for (const t of state.daily?.tasks ?? []) game.claimDaily(t.id, now);
    game.claimDailyChest(now);
    // 背包：资源箱、宝箱、加速道具能用就用
    for (const def of config.props) {
        if (!['resource', 'chest', 'speedup'].includes(def.type)) continue;
        for (let guard = 0; guard < 20 && game.useProp(def.id, now).ok; guard++);
    }
    for (let guard = 0; game.currentEvent && guard < 20; guard++) {
        const choices = game.currentEvent.choices.length;
        let ok = false;
        for (let i = 0; i < choices && !ok; i++) ok = game.choose(i, now).ok;
        if (!ok) state.eventQueue.shift();
    }
    // 分配工作：先把所有人撤下来；厨房只安排到“食物不再减少”为止（食物快满了就不再加人），
    // 然后填满废料场，再填医务室。对口专长的人优先。
    for (const s of state.survivors) game.assign(s.id, null, now);
    const idleFor = (b: string) => {
        const def = config.buildings.find((x) => x.id === b)!;
        const match = (id: string) => Number(config.survivors.find((d) => d.id === id)?.specialty === def.specialty);
        return state.survivors
            .filter((s) => !s.injured && !s.assignment && !state.expeditions.some((e) => e.squad.includes(s.id)))
            .sort((x, y) => match(y.id) - match(x.id));
    };
    // 下一级指挥部要多少食物：没攒够就把厨房排满，攒够了只保证够吃
    const hqDef = config.buildings.find((x) => x.id === 'hq')!;
    const foodGoal = Math.max(100, hqDef.levels[hqLevel(state)]?.cost.food ?? 0);
    for (const s of idleFor('kitchen').slice(0, workerSlots(config, state, 'kitchen'))) {
        if (economyRates(config, state, now).net.food > 0.5 && state.resources.food >= foodGoal) break;
        game.assign(s.id, 'kitchen', now);
    }
    for (const b of PRODUCERS.filter((x) => x !== 'kitchen')) {
        for (const s of idleFor(b).slice(0, workerSlots(config, state, b))) game.assign(s.id, b, now);
    }
    const squad = suggestSquad(config, state).filter((id) => !state.survivors.find((x) => x.id === id)?.assignment);
    if (state.expeditions.length === 0 && squad.length >= 3) {
        const locs = availableLocations(config, state, now)
            .filter((l) => !lost.has(l.name) || training > lost.get(l.name)!)
            .filter((l) => expeditionBlocker(config, state, l.id, squad, now) === null);
        const lastResult = (id: string) => [...state.reports].reverse().find((r) => r.kind === 'expedition' && r.title === config.locations.find((l) => l.id === id)?.name)?.result;
        const fresh = locs.find((l) => !state.flags.includes(clearedFlag(l.id)) && lastResult(l.id) !== 'lose');
        const farm = locs.filter((l) => lastResult(l.id) === 'win').sort((a, b) => lootValue(b.loot) - lootValue(a.loot))[0];
        const target = fresh ?? farm ?? locs[0];
        if (target) game.explore(target.id, now, squad);
    }
    // 有空就派两个人去勘察还没探索完的分区（近的先去），能修车就修车
    const districts = config.districts?.districts ?? [];
    for (const d of districts) {
        const who = suggestSurveyors(state).filter((id) => !state.survivors.find((x) => x.id === id)?.assignment);
        if (who.length === 0) break;
        if (game.survey(d.id, now, who.slice(0, 1)).ok) break;
    }
    for (const v of config.vehicles ?? []) if (buildVehicleBlocker(config, state, v.id) === null) game.buildVehicle(v.id, now);
    // 升级：缺粮先升厨房，缺零件先升废料场，其余挑最便宜的（花费总和最小）
    const rates = economyRates(config, state, now).net;
    const urgent = rates.food < 0 ? 'kitchen' : rates.parts < 0.5 ? 'scrapyard' : null;
    if (urgent && game.upgrade(urgent, now).ok) return;
    const options = config.buildings
        .filter((b) => upgradeBlocker(config, state, b.id) === null)
        .map((b) => ({ id: b.id, cost: RESOURCE_IDS.reduce((sum, r) => sum + (b.levels[state.buildings[b.id].level].cost[r] ?? 0), 0) }))
        .sort((a, b) => a.cost - b.cost);
    if (options.length) game.upgrade(options[0].id, now);
}

/** 一次上线：在线 SESSION_MINUTES 分钟，每秒心跳一次，每分钟操作一次 */
const SESSION_MINUTES = 5;
function onlineSession(game: CampGame, start: number): void {
    for (let sec = 0; sec <= SESSION_MINUTES * 60; sec++) {
        game.online(start + sec * 1000);
        if (game.state.gameOver) return;
        if (sec % 60 === 0) session(game, game.now);
    }
}

it.runIf(showReport)('经济节奏报告', { timeout: 600_000 }, () => {
    const game = CampGame.newGame(loadConfig(), T0, 3);
    const { config, state } = game;
    const lines = ['真实天  游戏天  季节  指挥部  其余建筑平均  食物   木材   零件  药品  士气  人数  守夜胜/负  尸潮加成(喘息)  死亡  成就'];
    const r = (n: number, w = 5) => String(Math.round(n)).padStart(w);
    let starvedSessions = 0;
    let sessions = 0;
    for (let day = 0; day < REAL_DAYS; day++) {
        for (const h of SESSION_HOURS) {
            onlineSession(game, T0 + (day * 24 + h) * HOUR);
            if (state.gameOver) break;
            sessions++;
            if (state.resources.food < 1) starvedSessions++;
        }
        if (state.gameOver) {
            lines.push(`营地在第 ${state.gameOver.day} 天（真实第 ${day + 1} 天）覆灭：${state.gameOver.cause}`);
            break;
        }
        if (day >= 14 && (day + 1) % 3 !== 0) continue;
        const now = game.now;
        const others = config.buildings.filter((b) => b.id !== 'hq');
        const avg = others.reduce((sum, b) => sum + state.buildings[b.id].level, 0) / others.length;
        lines.push(
            `${r(day + 1, 4)}  ${r(currentDay(config, state, now), 6)}   ${seasonAt(config, state, now).season.icon}   ${r(hqLevel(state), 5)}  ${avg.toFixed(1).padStart(10)}   ${r(state.resources.food)}  ${r(state.resources.wood)}  ${r(state.resources.parts)}  ${r(state.resources.medicine, 4)}  ${r(morale(state), 4)}  ${r(state.survivors.length, 4)}   ${r(state.stats.raids_won ?? 0, 4)}/${state.stats.raids_lost ?? 0}   ${r(raidEnemyBonus(config, state, now), 6)}(${state.raidRelief})   ${r(state.stats.deaths ?? 0, 4)}  ${r(state.achievements.length, 4)}`,
        );
    }
    lines.push('', `上线时食物为 0 的次数：${starvedSessions}/${sessions}   领到离线收益 ${state.stats.offline_rewards ?? 0} 次`);
    const deaths = Object.entries(state.stats).filter(([k]) => k.startsWith('death_'));
    lines.push(`探索 胜 ${state.stats.expeditions_won ?? 0} / 负 ${state.stats.expeditions_lost ?? 0}   死因：${deaths.map(([k, n]) => `${k.slice(6)} ×${n}`).join('，') || '无'}`);
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(1);
});
