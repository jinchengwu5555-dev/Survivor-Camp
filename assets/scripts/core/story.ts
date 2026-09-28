// 剧情“季 / 集”推进：检查本集目标，完成后发奖励并进入下一集。

import { EpisodeDef, GameConfig, GameState, Objective, RESOURCE_IDS } from './types';
import { addResource } from './economy';
import { queueEvent } from './events';
import { addLog, currentDay, getStat, hasFlag } from './state';

export function currentEpisode(config: GameConfig, state: GameState): EpisodeDef | undefined {
    return config.episodes[state.episodeIndex];
}

/** 目标的当前进度（current / target），界面显示进度条用 */
export function objectiveProgress(config: GameConfig, state: GameState, obj: Objective, now: number): { current: number; target: number } {
    switch (obj.type) {
        case 'buildingLevel':
            return { current: state.buildings[obj.building]?.level ?? 0, target: obj.level };
        case 'resource':
            return { current: Math.floor(state.resources[obj.resource]), target: obj.amount };
        case 'flag':
            return { current: hasFlag(state, obj.flag) ? 1 : 0, target: 1 };
        case 'survivors':
            return { current: state.survivors.length, target: obj.count };
        case 'stat':
            return { current: getStat(state, obj.stat), target: obj.amount };
        case 'day':
            return { current: currentDay(config, state, now), target: obj.day };
    }
}

export function objectiveDone(config: GameConfig, state: GameState, obj: Objective, now: number): boolean {
    const { current, target } = objectiveProgress(config, state, obj, now);
    return current >= target;
}

/** 开新档时调用：把第一集的开场事件放进队列 */
export function startStory(config: GameConfig, state: GameState): void {
    const ep = currentEpisode(config, state);
    if (ep?.startEvent) queueEvent(state, ep.startEvent);
}

export function checkEpisode(config: GameConfig, state: GameState, now: number): void {
    const ep = currentEpisode(config, state);
    if (!ep || !ep.objectives.every((o) => objectiveDone(config, state, o, now))) return;

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
