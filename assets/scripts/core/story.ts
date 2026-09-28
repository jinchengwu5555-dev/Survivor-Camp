// 剧情“季 / 集”推进：检查本集目标，完成后发奖励并进入下一集。

import { EpisodeDef, GameConfig, GameState, Objective, RESOURCE_IDS } from './types';
import { addResource } from './economy';
import { queueEvent } from './events';
import { addLog, hasFlag } from './state';

export function currentEpisode(config: GameConfig, state: GameState): EpisodeDef | undefined {
    return config.episodes[state.episodeIndex];
}

export function objectiveDone(state: GameState, obj: Objective): boolean {
    switch (obj.type) {
        case 'buildingLevel':
            return (state.buildings[obj.building]?.level ?? 0) >= obj.level;
        case 'resource':
            return state.resources[obj.resource] >= obj.amount;
        case 'flag':
            return hasFlag(state, obj.flag);
        case 'survivors':
            return state.survivors.length >= obj.count;
    }
}

/** 开新档时调用：把第一集的开场事件放进队列 */
export function startStory(config: GameConfig, state: GameState): void {
    const ep = currentEpisode(config, state);
    if (ep?.startEvent) queueEvent(state, ep.startEvent);
}

export function checkEpisode(config: GameConfig, state: GameState, now: number): void {
    const ep = currentEpisode(config, state);
    if (!ep || !ep.objectives.every((o) => objectiveDone(state, o))) return;

    for (const id of RESOURCE_IDS) {
        const amount = ep.rewards?.[id];
        if (amount) addResource(config, state, id, amount);
    }
    addLog(state, now, `第 ${ep.season} 季 第 ${ep.episode} 集「${ep.title}」完成！`);
    if (ep.endEvent) queueEvent(state, ep.endEvent);

    state.episodeIndex += 1;
    const next = currentEpisode(config, state);
    if (next?.startEvent) queueEvent(state, next.startEvent);
}
