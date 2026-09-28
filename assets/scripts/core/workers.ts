// 安排工作：给建筑加人 / 减人、一键安排所有闲着的人。

import { assignSurvivor } from './buildings';
import { isOnExpedition } from './combat';
import { economyRates, getBuildingDef, workerSlots } from './economy';
import { survivorInfo } from './roster';
import { ActionResult, GameConfig, GameState, SurvivorState } from './types';

/** 闲着、能干活的人 */
export function idleSurvivors(state: GameState): SurvivorState[] {
    return state.survivors.filter((s) => !s.assignment && !s.injured && !isOnExpedition(state, s.id));
}

function matches(config: GameConfig, state: GameState, s: SurvivorState, buildingId: string): boolean {
    const specialty = getBuildingDef(config, buildingId)?.specialty;
    return !!specialty && survivorInfo(config, state, s.id)?.specialty === specialty;
}

export function workersIn(state: GameState, buildingId: string): SurvivorState[] {
    return state.survivors.filter((s) => s.assignment === buildingId);
}

/** 给建筑加一个人：优先专长对口的 */
export function addWorker(config: GameConfig, state: GameState, buildingId: string): ActionResult {
    if (workerSlots(config, state, buildingId) <= 0) return { ok: false, reason: '这个建筑不需要工人' };
    if (workersIn(state, buildingId).length >= workerSlots(config, state, buildingId)) return { ok: false, reason: '岗位已满' };
    const idle = idleSurvivors(state).sort((a, b) => Number(matches(config, state, b, buildingId)) - Number(matches(config, state, a, buildingId)));
    if (idle.length === 0) return { ok: false, reason: '没有闲着的人' };
    const res = assignSurvivor(config, state, idle[0].id, buildingId);
    return res.ok ? { ok: true, message: survivorInfo(config, state, idle[0].id)?.name } : res;
}

/** 从建筑撤下一个人：优先专长不对口的 */
export function removeWorker(config: GameConfig, state: GameState, buildingId: string): ActionResult {
    const workers = workersIn(state, buildingId).sort((a, b) => Number(matches(config, state, a, buildingId)) - Number(matches(config, state, b, buildingId)));
    if (workers.length === 0) return { ok: false, reason: '这里没有人' };
    workers[0].assignment = null;
    return { ok: true, message: survivorInfo(config, state, workers[0].id)?.name };
}

/**
 * 一键安排：把闲着的人派出去干活。
 * 食物在减少（或者只多一点点）就先去厨房，然后是废料场（木材、零件），再是医务室，最后再补厨房。
 */
export function autoAssign(config: GameConfig, state: GameState, now: number): ActionResult {
    let count = 0;
    for (const s of idleSurvivors(state)) {
        const foodLow = economyRates(config, state, now).net.food < 0.3;
        const order = foodLow ? ['kitchen', 'scrapyard', 'infirmary'] : ['scrapyard', 'kitchen', 'infirmary'];
        // 专长对口的建筑有空位就优先去
        const own = config.buildings.find((b) => matches(config, state, s, b.id));
        if (own) order.unshift(own.id);
        if (order.some((b) => assignSurvivor(config, state, s.id, b).ok)) count++;
    }
    return count > 0 ? { ok: true, message: `安排了 ${count} 个人` } : { ok: false, reason: idleSurvivors(state).length ? '岗位都满了' : '没有闲着的人' };
}
