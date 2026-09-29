// 每局随机地名：开局时给小镇、各个分区、探索地点从 names.json 的名字池里各抽一个，
// 记在 state.names 里，这一局都用它。名字保留地点的类型（“XX加油站”“XX诊所”），剧情文字照样说得通。
// 老存档没有 state.names，就用配置里的默认名字。
// 界面和日志里显示地点、分区、小镇的名字一律用这里的函数，不要直接读 loc.name。

import { nextRandom } from './rng';
import { DistrictDef, GameConfig, GameState, LocationDef, Objective } from './types';

const DEFAULT_TOWN = '枫谷镇';

function pick<T>(state: GameState, list: T[]): T | undefined {
    return list.length ? list[Math.floor(nextRandom(state) * list.length)] : undefined;
}

/** 开局抽名字（用种子派生出的单独随机数，不打乱这局其他的随机结果） */
export function rollNames(config: GameConfig, state: GameState, seed: number): void {
    const pools = config.names;
    if (!pools) return;
    const rng = { rngState: (seed ^ 0x5bd1e995) | 0 } as GameState;
    const names = { town: pick(rng, pools.towns) ?? DEFAULT_TOWN, districts: {} as Record<string, string>, locations: {} as Record<string, string> };
    for (const d of config.districts?.districts ?? []) {
        const n = pick(rng, pools.districts[d.id] ?? []);
        if (n) names.districts[d.id] = n;
    }
    for (const loc of config.locations) {
        const n = pick(rng, pools.locations[loc.id] ?? []);
        if (n) names.locations[loc.id] = n;
    }
    state.names = names;
}

export function townName(state: GameState): string {
    return state.names?.town ?? DEFAULT_TOWN;
}

export function locationName(config: GameConfig, state: GameState, loc: LocationDef | string): string {
    const def = typeof loc === 'string' ? config.locations.find((l) => l.id === loc) : loc;
    if (!def) return typeof loc === 'string' ? loc : '';
    return state.names?.locations[def.id] ?? def.name;
}

export function districtName(state: GameState, d: DistrictDef): string {
    return state.names?.districts[d.id] ?? d.name;
}

/** 剧情目标的文字：“搜刮某地”换成这一局的地名 */
export function objectiveText(config: GameConfig, state: GameState, o: Objective): string {
    if (o.type === 'flag' && o.flag.startsWith('cleared_')) {
        const loc = config.locations.find((l) => `cleared_${l.id}` === o.flag);
        if (loc) return `搜刮${locationName(config, state, loc)}`;
    }
    return o.text;
}
