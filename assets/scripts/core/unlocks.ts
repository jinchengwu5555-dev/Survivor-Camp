// 新手节奏（unlocks.json）：开局只开放几个基础页签，其他功能按天数 / 建筑慢慢解锁，解锁后永久保留。
// 条件写法和事件条件一样，any 里满足任意一个就解锁。
// 老存档（state.unlocked 不存在）全部算已解锁，不会把老玩家的功能藏起来。

import { conditionMet } from './events';
import { addLog } from './state';
import { GameConfig, GameState, UnlockDef } from './types';

export function unlockDef(config: GameConfig, id: string): UnlockDef | undefined {
    return config.unlocks?.features.find((f) => f.id === id);
}

/** 这个功能开放了没有；配置里没写的功能一直开放 */
export function isUnlocked(config: GameConfig, state: GameState, id: string): boolean {
    if (!state.unlocked) return true;
    if (!unlockDef(config, id)) return true;
    return state.unlocked.includes(id);
}

/** 检查有没有新解锁的功能，返回这次新解锁的（界面弹提示用） */
export function checkUnlocks(config: GameConfig, state: GameState, now: number): UnlockDef[] {
    if (!state.unlocked) return [];
    const fresh: UnlockDef[] = [];
    for (const f of config.unlocks?.features ?? []) {
        if (state.unlocked.includes(f.id)) continue;
        if (!f.any.some((c) => conditionMet(config, state, c, now))) continue;
        state.unlocked.push(f.id);
        addLog(state, now, `${f.icon} 新功能：${f.name}。${f.text}`);
        fresh.push(f);
    }
    return fresh;
}
