// 侦察点：镇地图上已经亮起来的区域里，时不时冒出废弃的车、空投箱、求救信号……
// 点一下派一个人去一趟（优先派闲着的人），过一会儿带回东西，或者触发一个事件（比如救回一个人）。
// 按游戏时间刷新（只在在线时出现），没人去就会消失。

import { formatBag } from './combat';
import { grantResources, hqLevel } from './economy';
import { conditionMet, queueEvent } from './events';
import { formatProps, rollDrops } from './props';
import { nextRandom, pickWeighted } from './rng';
import { injureSurvivor, survivorName } from './roster';
import { addLog, addStat } from './state';
import { revealers } from './townMap';
import { scoutMultiplier } from './talents';
import { ActionResult, GameConfig, GameState, RESOURCE_IDS, ResourceBag, ScoutKindDef, ScoutSpotState } from './types';

const MAP_HALF = 320;

export function scoutKind(config: GameConfig, id: string): ScoutKindDef | undefined {
    return config.scouting.kinds.find((k) => k.id === id);
}

export function activeScoutSpots(state: GameState, now: number): ScoutSpotState[] {
    return (state.scoutSpots ?? []).filter((s) => s.expiresAt > now);
}

/** 这个人是不是正在外面侦察 */
export function isScouting(state: GameState, survivorId: string): boolean {
    return (state.scouts ?? []).some((s) => s.survivor === survivorId);
}

function nextInterval(config: GameConfig, state: GameState): number {
    return config.scouting.intervalMinutes * (0.5 + nextRandom(state)) * 60_000;
}

/** 在已经亮起来的区域里随机找个位置 */
function randomRevealedPoint(config: GameConfig, state: GameState, now: number): { x: number; y: number } {
    const pts = revealers(config, state, now);
    const p = pts[Math.floor(nextRandom(state) * pts.length)];
    const angle = nextRandom(state) * Math.PI * 2;
    const dist = (0.35 + nextRandom(state) * 0.55) * p.r;
    const clamp = (v: number) => Math.max(-MAP_HALF, Math.min(MAP_HALF, Math.round(v)));
    return { x: clamp(p.x + Math.cos(angle) * dist), y: clamp(p.y + Math.sin(angle) * dist) };
}

/** 推进到 now：清掉过期的，按间隔刷出新的 */
export function updateScoutSpots(config: GameConfig, state: GameState, now: number): void {
    const cfg = config.scouting;
    if (cfg.kinds.length === 0 || state.gameOver) return;
    state.scoutSpots = activeScoutSpots(state, now);
    let next = state.nextScoutSpotAt ?? now + nextInterval(config, state) / 2;
    let guard = 0;
    while (next <= now && guard++ < cfg.maxActive * 2) {
        const at = next;
        next = at + nextInterval(config, state);
        if (state.scoutSpots.length >= cfg.maxActive) continue;
        const kind = pickWeighted(state, cfg.kinds.filter((k) => conditionMet(config, state, k.conditions, at)));
        const expiresAt = at + cfg.lifetimeMinutes * 60_000;
        if (kind && expiresAt > now) state.scoutSpots.push({ id: state.nextId++, kind: kind.id, ...randomRevealedPoint(config, state, now), expiresAt });
    }
    state.nextScoutSpotAt = next <= now ? now + nextInterval(config, state) : next;
}

/** 派谁去：闲着的人优先，其次是在岗位上干活的人（去侦察时离开岗位） */
export function pickScout(state: GameState): string | undefined {
    const free = state.survivors.filter(
        (s) => !s.injured && !isScouting(state, s.id) && !state.expeditions.some((e) => e.squad.includes(s.id)),
    );
    return (free.find((s) => !s.assignment) ?? free[0])?.id;
}

export function sendScout(config: GameConfig, state: GameState, spotId: number, now: number): ActionResult {
    const spot = activeScoutSpots(state, now).find((s) => s.id === spotId);
    const kind = spot && scoutKind(config, spot.kind);
    if (!spot || !kind) return { ok: false, reason: '已经没了' };
    const who = pickScout(state);
    if (!who) return { ok: false, reason: '没有能派出去的人' };
    const s = state.survivors.find((x) => x.id === who)!;
    s.assignment = null;
    state.scoutSpots = (state.scoutSpots ?? []).filter((x) => x !== spot);
    state.scouts = state.scouts ?? [];
    const travel = kind.travelMinutes * scoutMultiplier(config, state, who) * 60_000;
    state.scouts.push({ id: state.nextId++, kind: kind.id, survivor: who, x: spot.x, y: spot.y, startedAt: now, returnsAt: now + travel });
    addLog(state, now, `${survivorName(config, state, who)}出发去侦察${kind.icon}${kind.name}。`);
    return { ok: true, message: survivorName(config, state, who) };
}

/** 侦察带回的资源：随指挥部等级成长（按探索战利品倍率的一半指数，罐头不成长） */
export function scoutReward(config: GameConfig, state: GameState, kind: ScoutKindDef): ResourceBag {
    const growth = Math.pow(config.balance.expeditionScaling.lootGrowth, (hqLevel(state) - 1) / 2);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) {
        const base = kind.reward[id];
        if (base) out[id] = id === 'cans' ? base : Math.round(base * growth);
    }
    return out;
}

/** 到时间的侦察员回来：发奖励、掉道具、触发事件，有一定概率受点伤 */
export function resolveScouts(config: GameConfig, state: GameState, now: number): void {
    const due = (state.scouts ?? []).filter((s) => s.returnsAt <= now);
    if (due.length === 0) return;
    state.scouts = (state.scouts ?? []).filter((s) => s.returnsAt > now);
    for (const sc of due) {
        const kind = scoutKind(config, sc.kind);
        const s = state.survivors.find((x) => x.id === sc.survivor);
        if (!kind || !s) continue;
        const got = formatBag(config, grantResources(config, state, scoutReward(config, state, kind)));
        const found = formatProps(config, rollDrops(state, kind.drops));
        if (kind.event) queueEvent(state, kind.event);
        let hurt = '';
        if (nextRandom(state) < config.scouting.injuryChance) {
            injureSurvivor(config, state, s, sc.returnsAt);
            hurt = '回来时受了点伤。';
        }
        addStat(state, 'scouts_done');
        const loot = [got, found].filter(Boolean).join('，');
        addLog(state, sc.returnsAt, `${survivorName(config, state, s.id)}侦察${kind.icon}${kind.name}回来了：${kind.text}${loot ? `带回 ${loot}。` : ''}${hurt}`);
    }
}
