// 枫谷镇地图：地点的位置、状态（打下 / 已知 / 传闻 / 未知）、道路和战争迷雾。
//
// 地点状态：
//   cleared  打下过
//   known    条件满足，可以派小队去
//   rumor    前置地点已经解锁了，但自己还没解锁：地图上显示成“？”，写着怎么解锁
//   hidden   更远的地方：藏在迷雾里，地图上不显示
// 迷雾：营地、已解锁 / 打下的地点、已发现的营地地点周围一圈可见（半径见 balance.townMap），
// 越探索，地图亮起来的部分越大。

import { clearedFlag } from './combat';
import { conditionMet } from './events';
import { hqLevel } from './economy';
import { locationName } from './names';
import { currentDay, hasFlag } from './state';
import { GameConfig, GameState, LocationDef, MapPoint } from './types';

export type LocationStatus = 'cleared' | 'known' | 'rumor' | 'hidden';

const DEFAULT_CAMP: MapPoint = { x: 0, y: -60 };

/** 营地在地图上的位置 = 当前营地地点的位置 */
export function campPoint(config: GameConfig, state: GameState): MapPoint {
    return config.sites.find((s) => s.id === state.siteId)?.map ?? DEFAULT_CAMP;
}

/** 前置地点：条件里要求“打下某地”的第一个地点 */
export function prerequisiteOf(config: GameConfig, loc: LocationDef): LocationDef | undefined {
    for (const flag of loc.conditions?.flags ?? []) {
        if (!flag.startsWith('cleared_')) continue;
        const pre = config.locations.find((l) => clearedFlag(l.id) === flag);
        if (pre) return pre;
    }
    return undefined;
}

export function locationStatus(config: GameConfig, state: GameState, loc: LocationDef, now: number): LocationStatus {
    if (hasFlag(state, clearedFlag(loc.id))) return 'cleared';
    if (conditionMet(config, state, loc.conditions, now)) return 'known';
    const pre = prerequisiteOf(config, loc);
    if (!pre) return 'rumor';
    const preStatus = locationStatus(config, state, pre, now);
    return preStatus === 'cleared' || preStatus === 'known' ? 'rumor' : 'hidden';
}

/** 还没解锁的地点：怎么解锁（比如“先打下加油站便利店 · 第 3 天以后”） */
export function unlockHint(config: GameConfig, state: GameState, loc: LocationDef, now: number): string {
    const parts: string[] = [];
    const c = loc.conditions ?? {};
    for (const flag of c.flags ?? []) {
        if (hasFlag(state, flag)) continue;
        const pre = config.locations.find((l) => clearedFlag(l.id) === flag);
        parts.push(pre ? `先打下${locationName(config, state, pre)}` : '剧情推进后');
    }
    if (c.minDay && currentDay(config, state, now) < c.minDay) parts.push(`第 ${c.minDay} 天以后`);
    if (c.minHq && hqLevel(state) < c.minHq) parts.push(`指挥部 ${c.minHq} 级`);
    return parts.join(' · ') || '条件满足后';
}

export interface Revealer extends MapPoint {
    r: number;
}

/** 能驱散迷雾的点 */
export function revealers(config: GameConfig, state: GameState, now: number): Revealer[] {
    const m = config.balance.townMap;
    const out: Revealer[] = [{ ...campPoint(config, state), r: m.revealCamp }];
    for (const loc of config.locations) {
        if (!loc.map) continue;
        const status = locationStatus(config, state, loc, now);
        if (status === 'cleared') out.push({ ...loc.map, r: m.revealCleared });
        else if (status === 'known') out.push({ ...loc.map, r: m.revealKnown });
    }
    for (const site of config.sites) {
        if (site.map && state.discoveredSites.includes(site.id)) out.push({ ...site.map, r: m.revealSite });
    }
    // 勘察分区驱散的迷雾（见 districts.ts）
    for (const p of state.surveyed ?? []) out.push({ ...p });
    return out;
}

export function isRevealed(points: Revealer[], x: number, y: number): boolean {
    return points.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= p.r ** 2);
}

/** 地图上已经亮起来的比例（0～1，按网格估算，界面显示“已探索 xx%”） */
export function exploredRatio(config: GameConfig, state: GameState, now: number, half = 330, step = 30): number {
    const pts = revealers(config, state, now);
    let seen = 0;
    let total = 0;
    for (let x = -half; x <= half; x += step) {
        for (let y = -half; y <= half; y += step) {
            total++;
            if (isRevealed(pts, x, y)) seen++;
        }
    }
    return total > 0 ? seen / total : 0;
}
