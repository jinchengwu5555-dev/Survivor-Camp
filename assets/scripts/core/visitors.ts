// 上门的人：“栅栏外的流浪者”“逃难的车队”这类事件会有人加入（addWanderer 效果）。
// 事件一出现就把这些人生成好，事件卡上先显示看得出来的表面信息（名字、来历、专长、性格、印象），
// 玩家看过再决定收不收；选了收留，进营地的就是卡上这几个人。隐藏的坏毛病照样要日后才暴露。

import { makeCandidate } from './recruits';
import { CandidateState, GameConfig, GameEventDef, GameState } from './types';

/** 这个事件最多会来几个人（同一个结果里 addWanderer 的个数） */
export function visitorCount(event: GameEventDef): number {
    let most = 0;
    for (const c of event.choices) for (const o of c.outcomes) most = Math.max(most, o.effects.filter((e) => e.type === 'addWanderer').length);
    return most;
}

/** 当前事件有人上门：提前生成好（只生成一次） */
export function prepareVisitors(config: GameConfig, state: GameState, now: number): void {
    const id = state.eventQueue[0];
    const event = id ? config.events.find((e) => e.id === id) : undefined;
    if (!event) {
        if (state.visitors) state.visitors = undefined;
        return;
    }
    if (state.visitors?.event === event.id) return;
    const count = visitorCount(event);
    const people: CandidateState[] = [];
    // 没有招募配置（老配置、测试的 5 人开局）就按老办法当场生成
    for (let i = 0; i < count && config.recruits; i++) {
        const c = makeCandidate(config, state, '栅栏外', now);
        if (c) people.push(c);
    }
    state.visitors = count > 0 && people.length ? { event: event.id, people } : undefined;
}

/** addWanderer 效果：有提前生成好的人就用他 */
export function takeVisitor(state: GameState): CandidateState | undefined {
    return state.visitors?.people.shift();
}
