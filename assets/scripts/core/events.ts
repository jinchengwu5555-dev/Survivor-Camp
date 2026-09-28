// 事件与抉择系统：条件判断、随机抽取、效果结算。

import { Condition, Effect, GameConfig, GameEventDef, GameState } from './types';
import { addResource, bedCount, canAfford, clampMood, pay } from './economy';
import { addLog, addStat, currentDay, hasFlag, healSurvivorState, newSurvivorState, setFlag } from './state';
import { pickOne, pickWeighted } from './rng';
import { addWanderer, checkGameOver, injureSurvivor, survivorInfo, survivorName as rosterName } from './roster';
import { getSite } from './siteMods';
import { addProp } from './props';

export function getEventDef(config: GameConfig, id: string): GameEventDef | undefined {
    return config.events.find((e) => e.id === id);
}

export function conditionMet(config: GameConfig, state: GameState, cond: Condition | undefined, now: number): boolean {
    if (!cond) return true;
    if (cond.minDay !== undefined && currentDay(config, state, now) < cond.minDay) return false;
    if (cond.minSurvivors !== undefined && state.survivors.length < cond.minSurvivors) return false;
    if (cond.flags && !cond.flags.every((f) => hasFlag(state, f))) return false;
    if (cond.notFlags && cond.notFlags.some((f) => hasFlag(state, f))) return false;
    if (cond.hasSurvivors && !cond.hasSurvivors.every((id) => state.survivors.some((s) => s.id === id))) return false;
    return true;
}

export function eligibleRandomEvents(config: GameConfig, state: GameState, now: number): GameEventDef[] {
    return config.events.filter(
        (e) =>
            e.weight > 0 &&
            !(e.once && state.seenEvents.includes(e.id)) &&
            !state.eventQueue.includes(e.id) &&
            conditionMet(config, state, e.conditions, now),
    );
}

export function queueEvent(state: GameState, eventId: string): void {
    if (!state.eventQueue.includes(eventId)) state.eventQueue.push(eventId);
}

/** 到时间了就抽一个随机事件。队列里还有事件没处理时不再抽，避免离线回来一堆弹窗 */
export function maybeTriggerRandomEvent(config: GameConfig, state: GameState, now: number): void {
    if (now < state.nextRandomEventAt) return;
    state.nextRandomEventAt = now + config.balance.eventIntervalMinutes * 60_000;
    if (state.eventQueue.length > 0) return;
    const picked = pickWeighted(state, eligibleRandomEvents(config, state, now));
    if (picked) queueEvent(state, picked.id);
}

export interface ChoiceResult {
    ok: boolean;
    reason?: string;
    outcomeText?: string;
}

export function resolveChoice(config: GameConfig, state: GameState, choiceIndex: number, now: number): ChoiceResult {
    const eventId = state.eventQueue[0];
    const event = eventId ? getEventDef(config, eventId) : undefined;
    if (!event) return { ok: false, reason: '当前没有事件' };
    const choice = event.choices[choiceIndex];
    if (!choice) return { ok: false, reason: '无效的选项' };

    if (!canAfford(state, choice.cost)) return { ok: false, reason: '资源不足' };
    pay(state, choice.cost);

    state.eventQueue.shift();
    if (!state.seenEvents.includes(event.id)) state.seenEvents.push(event.id);
    addStat(state, 'events_resolved');

    const outcome = pickWeighted(state, choice.outcomes);
    if (!outcome) return { ok: true };
    addLog(state, now, `【${event.title}】${outcome.text}`);
    for (const effect of outcome.effects) applyEffect(config, state, effect, now);
    return { ok: true, outcomeText: outcome.text };
}

/** 发现一个新的营地地点（探索、剧情事件都会用到） */
export function discoverSite(config: GameConfig, state: GameState, siteId: string, now: number): void {
    const site = getSite(config, siteId);
    if (!site || state.discoveredSites.includes(siteId)) return;
    state.discoveredSites.push(siteId);
    addStat(state, 'sites_discovered');
    addLog(state, now, `🗺 发现了新的营地地点：${site.icon}${site.name}。可以在“营地”页考虑搬过去。`);
}

/** 'random' 从非核心角色里随机挑一个 */
function resolveSurvivor(config: GameConfig, state: GameState, target: string): string | null {
    if (target !== 'random') return state.survivors.some((s) => s.id === target) ? target : null;
    const pool = state.survivors.filter((s) => !survivorInfo(config, state, s.id)?.isHero);
    return pickOne(state, pool)?.id ?? null;
}

export function applyEffect(config: GameConfig, state: GameState, effect: Effect, now: number): void {
    switch (effect.type) {
        case 'resource':
            addResource(config, state, effect.resource, effect.amount);
            break;
        case 'mood': {
            const target = effect.target ?? 'all';
            const id = target === 'all' ? null : resolveSurvivor(config, state, target);
            const targets = target === 'all' ? state.survivors : state.survivors.filter((s) => s.id === id);
            for (const s of targets) s.mood = clampMood(s.mood + effect.amount);
            break;
        }
        case 'addSurvivor': {
            if (state.survivors.some((s) => s.id === effect.survivor)) break;
            const name = config.survivors.find((d) => d.id === effect.survivor)?.name ?? effect.survivor;
            if (state.survivors.length >= bedCount(config, state)) {
                addLog(state, now, `营地没有空床位了，${name}只能离开。`);
                break;
            }
            state.survivors.push(newSurvivorState(config, effect.survivor));
            addStat(state, 'recruited');
            addLog(state, now, `${name}加入了营地。`);
            break;
        }
        case 'addWanderer':
            addWanderer(config, state, now, effect.specialty);
            break;
        case 'discoverSite':
            discoverSite(config, state, effect.site, now);
            break;
        case 'removeSurvivor': {
            const id = resolveSurvivor(config, state, effect.survivor);
            if (!id) break;
            const name = rosterName(config, state, id);
            state.survivors = state.survivors.filter((s) => s.id !== id);
            for (const ex of state.expeditions) ex.squad = ex.squad.filter((m) => m !== id);
            addLog(state, now, `${name}离开了营地。`);
            checkGameOver(config, state, now, `${name}离开后，营地里一个人也不剩了`);
            break;
        }
        case 'injure': {
            const id = resolveSurvivor(config, state, effect.survivor);
            const s = state.survivors.find((x) => x.id === id);
            if (!s) break;
            injureSurvivor(config, state, s, now);
            addLog(state, now, `${rosterName(config, state, s.id)}受了重伤。`);
            break;
        }
        case 'heal':
            for (const s of state.survivors) {
                if (effect.survivor === 'all' || s.id === effect.survivor) healSurvivorState(s);
            }
            break;
        case 'flag':
            setFlag(state, effect.flag);
            break;
        case 'triggerEvent':
            queueEvent(state, effect.event);
            break;
        case 'stat':
            addStat(state, effect.stat, effect.amount ?? 1);
            break;
        case 'prop':
            addProp(state, effect.prop, effect.amount ?? 1);
            break;
    }
}

