// 镇地图分区：每个区有自己的范围、远近（要什么交通工具）和危险程度。
// “勘察”：派人去某个区转一圈，回来时驱散这个区里一片还没探索的迷雾，顺手带回一点东西，
// 有一定概率受伤。一个区的迷雾全散了，发一次性的“探索完成”奖励。
// 分区里的探索地点（locations）也要有能到那个区的交通工具才能去。

import { isOnExpedition } from './combat';
import { grantResources, hqLevel } from './economy';
import { addProp, rollDrops } from './props';
import { nextRandom } from './rng';
import { injureSurvivor, survivorName } from './roster';
import { addLog, addStat } from './state';
import { isRevealed, revealers } from './townMap';
import { ActionResult, DistrictDef, GameConfig, GameState, MapPoint, RESOURCE_IDS, ResourceBag } from './types';
import { haulCapacity, pickVehicle, useVehicle, vehicleDef } from './vehicles';
import { isBrokenDown } from './mood';

export function districtDef(config: GameConfig, id: string): DistrictDef | undefined {
    return (config.districts?.districts ?? []).find((d) => d.id === id);
}

function inRect(d: DistrictDef, p: MapPoint): boolean {
    return p.x >= d.rect.x1 && p.x < d.rect.x2 && p.y >= d.rect.y1 && p.y < d.rect.y2;
}

/** 某个点在哪个区 */
export function districtAt(config: GameConfig, p: MapPoint | undefined): DistrictDef | undefined {
    if (!p) return undefined;
    return (config.districts?.districts ?? []).find((d) => inRect(d, p));
}

/** 去这个点要什么等级的交通工具（不在任何区里就是 0） */
export function tierAt(config: GameConfig, p: MapPoint | undefined): number {
    return districtAt(config, p)?.tier ?? 0;
}

/** 区里的网格中心点 */
function cells(config: GameConfig, d: DistrictDef): MapPoint[] {
    const step = config.districts?.cell ?? 30;
    const out: MapPoint[] = [];
    for (let x = d.rect.x1 + step / 2; x < d.rect.x2; x += step) {
        for (let y = d.rect.y1 + step / 2; y < d.rect.y2; y += step) out.push({ x, y });
    }
    return out;
}

/** 这个区探索了多少（0～1） */
export function districtExplored(config: GameConfig, state: GameState, d: DistrictDef, now: number): number {
    const pts = revealers(config, state, now);
    const all = cells(config, d);
    return all.length ? all.filter((c) => isRevealed(pts, c.x, c.y)).length / all.length : 1;
}

export function isSurveying(state: GameState, survivorId: string): boolean {
    return (state.surveys ?? []).some((s) => s.squad.includes(survivorId));
}

/** 勘察能派谁：没受伤、没崩溃、不在外面的人 */
export function surveyCandidates(state: GameState): string[] {
    return state.survivors.filter((s) => !s.injured && !isBrokenDown(s) && !isOnExpedition(state, s.id)).map((s) => s.id);
}

/** 默认派两个人：闲着的优先 */
export function suggestSurveyors(state: GameState, size = 2): string[] {
    const pool = surveyCandidates(state);
    const idle = pool.filter((id) => !state.survivors.find((s) => s.id === id)?.assignment);
    return [...idle, ...pool.filter((id) => !idle.includes(id))].slice(0, size);
}

export function surveyBlocker(config: GameConfig, state: GameState, districtId: string, squad: string[], now: number, vehicle?: string): string | null {
    const d = districtDef(config, districtId);
    if (!d) return '没有这个区';
    if ((state.surveys ?? []).some((s) => s.district === districtId)) return '已经有人在勘察这个区了';
    if (districtExplored(config, state, d, now) >= 1) return '这个区已经探索完了';
    if (squad.length === 0) return '没有能派出去的人';
    const pool = surveyCandidates(state);
    if (!squad.every((id) => pool.includes(id))) return '有人受伤了或者已经在外面';
    return pickVehicle(config, state, d.tier, vehicle).blocker ?? null;
}

export function startSurvey(config: GameConfig, state: GameState, districtId: string, squad: string[], now: number, vehicle?: string): ActionResult {
    const blocker = surveyBlocker(config, state, districtId, squad, now, vehicle);
    if (blocker) return { ok: false, reason: blocker };
    const d = districtDef(config, districtId)!;
    const v = pickVehicle(config, state, d.tier, vehicle).vehicle;
    useVehicle(state, v);
    for (const s of state.survivors) if (squad.includes(s.id)) s.assignment = null;
    state.surveys = state.surveys ?? [];
    state.surveys.push({
        id: state.nextId++,
        district: d.id,
        squad: [...squad],
        vehicle: v?.id,
        startedAt: now,
        returnsAt: now + d.surveyMinutes * (v?.speed ?? 1) * 60_000,
    });
    addLog(state, now, `${squad.map((id) => survivorName(config, state, id)).join('、')}${v ? `开着${v.icon}${v.name}` : ''}出发去勘察${d.icon}${d.name}。`);
    return { ok: true };
}

/** 在区里挑一块还没探索的地方（尽量挑离已探索区域近的，像是一点点往外摸） */
function nextRevealPoint(config: GameConfig, state: GameState, d: DistrictDef, now: number): MapPoint | undefined {
    const pts = revealers(config, state, now);
    const hidden = cells(config, d).filter((c) => !isRevealed(pts, c.x, c.y));
    if (hidden.length === 0) return undefined;
    const dist = (c: MapPoint) => Math.min(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y) - p.r));
    hidden.sort((a, b) => dist(a) - dist(b));
    // 在最近的几块里随机挑一块
    const pick = hidden[Math.floor(nextRandom(state) * Math.min(4, hidden.length))];
    return pick;
}

function surveyLoot(config: GameConfig, state: GameState, d: DistrictDef): ResourceBag {
    const growth = Math.pow(config.balance.expeditionScaling.lootGrowth, (hqLevel(state) - 1) / 2);
    const out: ResourceBag = {};
    for (const id of RESOURCE_IDS) if (d.loot[id]) out[id] = id === 'cans' ? d.loot[id] : Math.round(d.loot[id]! * growth);
    return out;
}

export function resolveSurveys(config: GameConfig, state: GameState, now: number): void {
    const due = (state.surveys ?? []).filter((s) => s.returnsAt <= now);
    if (due.length === 0) return;
    state.surveys = (state.surveys ?? []).filter((s) => s.returnsAt > now);
    for (const sv of due) {
        const d = districtDef(config, sv.district);
        const squad = sv.squad.filter((id) => state.survivors.some((s) => s.id === id));
        if (!d || squad.length === 0) continue;
        const at = sv.returnsAt;
        const point = nextRevealPoint(config, state, d, at);
        if (point) {
            state.surveyed = state.surveyed ?? [];
            state.surveyed.push({ ...point, r: config.districts?.revealRadius ?? 85 });
        }
        // 带回来的东西受背包限制：资源最多装满重量上限的一半（勘察主要是看路）
        const cap = haulCapacity(config, squad.length, vehicleDef(config, sv.vehicle));
        const loot = surveyLoot(config, state, d);
        const scale = Math.min(1, (cap.maxWeight * 4) / Math.max(1, Object.values(loot).reduce((n, v) => n + (v ?? 0), 0)));
        for (const id of RESOURCE_IDS) if (loot[id]) loot[id] = Math.round(loot[id]! * scale);
        const got = grantResources(config, state, loot);
        const found = rollDrops(state, d.drops);
        let hurt = '';
        if (nextRandom(state) < d.danger) {
            const victim = squad[Math.floor(nextRandom(state) * squad.length)];
            const s = state.survivors.find((x) => x.id === victim)!;
            injureSurvivor(config, state, s, at);
            hurt = `${survivorName(config, state, victim)}在路上受了伤。`;
        }
        addStat(state, 'surveys_done');
        const gotText = Object.entries(got).filter(([, n]) => n).map(([id, n]) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${n}`).join(' ');
        const foundText = Object.entries(found).map(([id, n]) => `${config.props.find((p) => p.id === id)?.icon ?? ''}${config.props.find((p) => p.id === id)?.name ?? id}${n > 1 ? `×${n}` : ''}`).join('、');
        addLog(state, at, `🗺 勘察${d.icon}${d.name}回来了：${point ? '地图上又亮了一片。' : '没发现新地方。'}${gotText ? `带回 ${gotText}。` : ''}${foundText ? `还找到了${foundText}。` : ''}${hurt}`);
        // 整个区都探索完了
        state.districtsCompleted = state.districtsCompleted ?? [];
        if (!state.districtsCompleted.includes(d.id) && districtExplored(config, state, d, at) >= 1) {
            state.districtsCompleted.push(d.id);
            addStat(state, 'districts_completed');
            if (d.complete?.resources) grantResources(config, state, d.complete.resources);
            for (const [id, n] of Object.entries(d.complete?.props ?? {})) addProp(state, id, n);
            addLog(state, at, `🎉 ${d.icon}${d.name}全部探索完了！大家在这里找到了一批藏起来的物资。`);
        }
    }
}
