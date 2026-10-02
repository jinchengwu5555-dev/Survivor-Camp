// 界面红点：哪里有新东西、哪里有事可做。
//
// 两种红点：
//   “新内容”：新加入的人、新解锁的地点、新悬赏、新能做的物品、新成就、新战报、新发现的营地、商人来访、背包里新得到的道具。
//             玩家打开对应页面后调用 markSeen() 记为已读，红点消失。
//   “可以做”：有人闲着而岗位有空、小队可以出发、有奖励能领。做完红点自然消失，不需要标记已读。
// 已读记录存在 state.seen 里。第一次计算时（新开局或老存档）把当时已有的内容全部记为已读，避免满屏红点。

import { availableBounties, bountyProgress } from './bounties';
import { availableLocations, restockSecondsLeft, suggestSquad } from './combat';
import { workshopLevel } from './crafting';
import { dailyClaimable } from './daily';
import { bestCrop, petBlocker, produceFood, readyPlots } from './farming';
import { workerSlots } from './economy';
import { relocationTargets } from './sites';
import { traderPresent } from './trader';
import { activeScoutSpots } from './scouting';
import { GameConfig, GameState, SeenState } from './types';
import { idleSurvivors, workersIn } from './workers';

/** 会显示红点的地方 */
export type BadgeGroup = 'survivors' | 'explore' | 'bounties' | 'workshop' | 'achievements' | 'reports' | 'sites' | 'trader' | 'props';
export const BADGE_GROUPS: BadgeGroup[] = ['survivors', 'explore', 'bounties', 'workshop', 'achievements', 'reports', 'sites', 'trader', 'props'];

/** 每个地方现在有哪些“新内容”的 key（不管看没看过） */
function contentKeys(config: GameConfig, state: GameState, now: number): Record<BadgeGroup, string[]> {
    const level = workshopLevel(config, state);
    return {
        survivors: state.survivors.map((s) => `survivor:${s.id}`),
        explore: [...availableLocations(config, state, now).map((l) => `loc:${l.id}`), ...activeScoutSpots(state, now).map((s) => `spot:${s.id}`)],
        bounties: availableBounties(config, state, now).map((b) => `bounty:${b.id}`),
        workshop: level > 0 ? config.items.filter((i) => i.workshopLevel <= level).map((i) => `item:${i.id}`) : [],
        achievements: state.achievements.map((a) => `ach:${a.id}`),
        reports: [],
        sites: relocationTargets(config, state).map((s) => `site:${s.id}`),
        trader: traderPresent(state, now) ? [`trader:${state.trader!.visit}`] : [],
        // 背包：每种道具的数量变多了就算新内容（key 里带着累计获得数）
        props: Object.entries(state.props ?? {})
            .filter(([, n]) => n > 0)
            .map(([id, n]) => `prop:${id}:${n}`),
    };
}

function latestReportId(state: GameState): number {
    return state.reports.reduce((max, r) => Math.max(max, r.id), 0);
}

/** 已读记录；第一次用时把现有内容全部记为已读 */
export function seenState(config: GameConfig, state: GameState, now: number): SeenState {
    if (!state.seen) {
        const keys = Object.values(contentKeys(config, state, now)).flat();
        state.seen = { keys, reportId: latestReportId(state) };
    }
    return state.seen;
}

/** 各个地方的红点数（0 = 没有红点） */
export function badgeCounts(config: GameConfig, state: GameState, now: number): Record<BadgeGroup, number> {
    const seen = new Set(seenState(config, state, now).keys);
    const keys = contentKeys(config, state, now);
    const counts = {} as Record<BadgeGroup, number>;
    for (const g of BADGE_GROUPS) counts[g] = keys[g].filter((k) => !seen.has(k)).length;

    // 可以做的事
    const idle = idleSurvivors(state).length;
    const freeSlot = config.buildings.some((b) => workerSlots(config, state, b.id) > workersIn(state, b.id).length);
    if (idle > 0 && freeSlot) counts.survivors += 1;
    const canExplore =
        state.expeditions.length === 0 &&
        suggestSquad(config, state).length > 0 &&
        availableLocations(config, state, now).some((l) => restockSecondsLeft(state, l.id, now) === 0);
    if (canExplore) counts.explore += 1;
    if (dailyClaimable(config, state)) counts.bounties += 1;
    counts.bounties += state.bounties.active.filter((a) => {
        const { current, target } = bountyProgress(config, state, a.id);
        return target > 0 && current >= target;
    }).length;
    counts.reports = state.reports.filter((r) => r.id > seenState(config, state, now).reportId).length;
    return counts;
}

/** 玩家打开了某个页面：这里的新内容都记为已读 */
export function markSeen(config: GameConfig, state: GameState, group: BadgeGroup, now: number): void {
    const seen = seenState(config, state, now);
    const known = new Set(seen.keys);
    for (const k of contentKeys(config, state, now)[group]) if (!known.has(k)) seen.keys.push(k);
    if (group === 'reports') seen.reportId = latestReportId(state);
}

/**
 * 菜园、畜栏上的“可以做”提示（显示在营地地图的建筑上）：
 *   菜园：🧺 有熟了的菜、🌱 有空地、有这个季节能种的种子；畜栏：🥚 有蛋 / 奶可以收、🤗 今天还没照看、⚠️ 牲口在挨饿
 */
export function farmTodos(config: GameConfig, state: GameState, now: number): { garden: string[]; pen: string[] } {
    const farm = state.farm;
    const garden: string[] = [];
    const pen: string[] = [];
    if (!farm) return { garden, pen };
    if (readyPlots(config, state, now) > 0) garden.push('🧺');
    if (bestCrop(config, state, now)) garden.push('🌱');
    if (produceFood(config, state) > 0) pen.push('🥚');
    if (!petBlocker(config, state, now)) pen.push('🤗');
    if (farm.hunger > 0) pen.push('⚠️');
    return { garden, pen };
}
