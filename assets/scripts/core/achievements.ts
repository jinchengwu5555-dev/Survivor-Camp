// 成就系统：条件复用剧情目标（Objective），满足后自动解锁并发奖励。

import { grantResources } from './economy';
import { addLog } from './state';
import { objectiveDone } from './story';
import { AchievementDef, GameConfig, GameState } from './types';
import { formatBag } from './combat';

export function isUnlocked(state: GameState, id: string): boolean {
    return state.achievements.some((a) => a.id === id);
}

/** 检查所有成就，新解锁的返回出来（界面可以弹提示） */
export function checkAchievements(config: GameConfig, state: GameState, now: number): AchievementDef[] {
    const unlocked: AchievementDef[] = [];
    for (const def of config.achievements) {
        if (isUnlocked(state, def.id) || !objectiveDone(config, state, def.goal, now)) continue;
        state.achievements.push({ id: def.id, at: now });
        const got = grantResources(config, state, def.reward);
        addLog(state, now, `🏆 解锁成就「${def.name}」${formatBag(config, got) ? `，获得 ${formatBag(config, got)}` : ''}`);
        unlocked.push(def);
    }
    return unlocked;
}
