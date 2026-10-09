// 每日目标：每个游戏日（在线约 8 分钟）从任务池里抽几个小目标，完成后领奖励，全部领完再开一个宝箱。
// 和悬赏一样用统计数据判断进度：抽到时记下当前值，之后增加 amount 就算完成。没领的奖励第二天就没了。

import { formatBag } from './combat';
import { formatProps, rollDrops } from './props';
import { conditionMet } from './events';
import { grantResources, hqLevel } from './economy';
import { nextRandom } from './rng';
import { addLog, addStat, currentDay, getStat } from './state';
import { ActionResult, DailyState, DailyTaskDef, GameConfig, GameState, RESOURCE_IDS, ResourceBag } from './types';

export function dailyTaskDef(config: GameConfig, id: string): DailyTaskDef | undefined {
    return config.daily.tasks.find((t) => t.id === id);
}

/** 换天时重新抽目标；同一天内不变 */
export function refreshDaily(config: GameConfig, state: GameState, now: number): DailyState {
    const day = currentDay(config, state, now);
    if (state.daily && state.daily.day === day) return state.daily;
    const pool = config.daily.tasks.filter(
        (t) => conditionMet(config, state, t.conditions, now) && (!t.requiresBuilding || (state.buildings[t.requiresBuilding]?.level ?? 0) > 0),
    );
    const picked: DailyTaskDef[] = [];
    const usedStats = new Set<string>();
    while (picked.length < config.daily.tasksPerDay && pool.length > 0) {
        const t = pool.splice(Math.floor(nextRandom(state) * pool.length), 1)[0];
        // 同一种统计只出一个，避免“探索 1 次”和“探索 2 次”同时出现
        if (usedStats.has(t.stat)) continue;
        usedStats.add(t.stat);
        picked.push(t);
    }
    state.daily = { day, tasks: picked.map((t) => ({ id: t.id, baseline: getStat(state, t.stat), claimed: false })), chestClaimed: false };
    return state.daily;
}

export function dailyProgress(config: GameConfig, state: GameState, taskId: string): { current: number; target: number } {
    const def = dailyTaskDef(config, taskId);
    const t = state.daily?.tasks.find((x) => x.id === taskId);
    if (!def || !t) return { current: 0, target: 0 };
    return { current: Math.max(0, Math.min(def.amount, getStat(state, def.stat) - t.baseline)), target: def.amount };
}

/** 有没有能领的奖励（界面在页签上显示红点） */
export function dailyClaimable(config: GameConfig, state: GameState): boolean {
    const daily = state.daily;
    if (!daily) return false;
    if (daily.tasks.some((t) => !t.claimed && isDone(config, state, t.id))) return true;
    return !daily.chestClaimed && daily.tasks.length > 0 && daily.tasks.every((t) => t.claimed);
}

function isDone(config: GameConfig, state: GameState, taskId: string): boolean {
    const { current, target } = dailyProgress(config, state, taskId);
    return target > 0 && current >= target;
}

export function claimDaily(config: GameConfig, state: GameState, taskId: string, now: number): ActionResult {
    const t = state.daily?.tasks.find((x) => x.id === taskId);
    const def = dailyTaskDef(config, taskId);
    if (!t || !def) return { ok: false, reason: '今天没有这个目标' };
    if (t.claimed) return { ok: false, reason: '已经领过了' };
    if (!isDone(config, state, taskId)) return { ok: false, reason: '还没完成' };
    t.claimed = true;
    const got = grantResources(config, state, def.reward);
    addStat(state, 'daily_completed');
    addLog(state, now, `每日目标「${def.text}」完成，获得 ${formatBag(config, got) || '一些物资'}。`);
    return { ok: true, message: formatBag(config, got) };
}

/** 全部领完后的宝箱奖励（随指挥部等级成长，罐头不成长） */
export function dailyChest(config: GameConfig, state: GameState): ResourceBag {
    const mult = Math.pow(config.balance.expeditionScaling.lootGrowth, hqLevel(state) - 1);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const base = config.daily.chest[id];
        if (base) out[id] = id === 'cans' ? base : Math.round(base * mult);
    }
    return out;
}

export function claimDailyChest(config: GameConfig, state: GameState, now: number): ActionResult {
    const daily = state.daily;
    if (!daily || daily.tasks.length === 0) return { ok: false, reason: '今天没有目标' };
    if (daily.chestClaimed) return { ok: false, reason: '已经开过了' };
    if (!daily.tasks.every((t) => t.claimed)) return { ok: false, reason: '先完成今天的全部目标' };
    daily.chestClaimed = true;
    const got = grantResources(config, state, dailyChest(config, state));
    const found = formatProps(config, rollDrops(state, config.daily.chestProps));
    const text = [formatBag(config, got), found].filter(Boolean).join('，');
    addStat(state, 'daily_chests');
    addLog(state, now, `打开了今天的宝箱：${text || '空的'}。`);
    return { ok: true, message: text };
}
