// 营地的空地（campzones.json）：营地地图分成几块，开局只有中间一块能用，
// 其他的地上堆着货架、废车、瓦砾，要先“清理”（花资源、等一会儿，有的还要指挥部等级）才能在上面盖房子。
// 建筑属于哪块地，看它在地图上的位置（buildings.json 的 map）落在哪块地的 rect 里。
// 老存档：某块地上已经有建好的建筑，就算已经清理过了。

import { canAfford, getBuildingDef, hqLevel, pay } from './economy';
import { addLog, addStat } from './state';
import { ActionResult, BuildingDef, CampZoneDef, GameConfig, GameState } from './types';

export function campZones(config: GameConfig): CampZoneDef[] {
    return config.campzones?.zones ?? [];
}

export function zoneDef(config: GameConfig, id: string): CampZoneDef | undefined {
    return campZones(config).find((z) => z.id === id);
}

/** 建筑在哪块地上（没写 map 或者不在任何一块地里就是 undefined） */
export function zoneOfBuilding(config: GameConfig, def: BuildingDef): CampZoneDef | undefined {
    const p = def.map;
    if (!p) return undefined;
    return campZones(config).find((z) => p.x >= z.rect.x1 && p.x < z.rect.x2 && p.y >= z.rect.y1 && p.y < z.rect.y2);
}

export function zoneCleared(config: GameConfig, state: GameState, id: string): boolean {
    const zone = zoneDef(config, id);
    if (!zone || zone.start) return true;
    if (state.zones?.[id]?.cleared) return true;
    // 老存档：上面已经有建好的建筑
    return config.buildings.some((b) => (state.buildings[b.id]?.level ?? 0) > 0 && zoneOfBuilding(config, b)?.id === id);
}

/** 正在清理的那块地什么时候清完（没有在清理就是 null） */
export function clearingEndsAt(state: GameState, id: string): number | null {
    return state.zones?.[id]?.endsAt ?? null;
}

/** 建筑脚下的地还没清理：返回原因，否则 null */
export function buildingZoneBlocker(config: GameConfig, state: GameState, buildingId: string): string | null {
    const def = getBuildingDef(config, buildingId);
    if (!def || (state.buildings[buildingId]?.level ?? 0) > 0) return null;
    const zone = zoneOfBuilding(config, def);
    if (!zone || zoneCleared(config, state, zone.id)) return null;
    return `要先清理「${zone.name}」`;
}

/** 能不能开始清理；返回 null 表示可以 */
export function clearZoneBlocker(config: GameConfig, state: GameState, id: string): string | null {
    const zone = zoneDef(config, id);
    if (!zone) return '没有这块地';
    if (zoneCleared(config, state, id)) return '已经清理出来了';
    if (clearingEndsAt(state, id) !== null) return '正在清理';
    if (campZones(config).some((z) => clearingEndsAt(state, z.id) !== null)) return '一次只能清理一块地';
    if (zone.requires?.hq && hqLevel(state) < zone.requires.hq) return `需要指挥部 ${zone.requires.hq} 级`;
    if (!canAfford(state, zone.cost ?? {})) return '资源不足';
    return null;
}

export function startClearingZone(config: GameConfig, state: GameState, id: string, now: number): ActionResult {
    const blocker = clearZoneBlocker(config, state, id);
    if (blocker) return { ok: false, reason: blocker };
    const zone = zoneDef(config, id)!;
    pay(state, zone.cost ?? {});
    state.zones = { ...(state.zones ?? {}), [id]: { cleared: false, endsAt: now + (zone.minutes ?? 0) * 60_000 } };
    addLog(state, now, `${zone.icon} 大家开始清理${zone.name}。`);
    return { ok: true, message: `开始清理${zone.name}` };
}

/** 每次 tick：清理完的地可以盖房子了 */
export function updateZones(config: GameConfig, state: GameState, now: number): void {
    for (const zone of campZones(config)) {
        const at = clearingEndsAt(state, zone.id);
        if (at === null || at > now) continue;
        state.zones = { ...(state.zones ?? {}), [zone.id]: { cleared: true, endsAt: null } };
        addStat(state, 'zones_cleared');
        addLog(state, at, `${zone.icon} ${zone.name}清理出来了，营地又大了一圈！`);
    }
}
