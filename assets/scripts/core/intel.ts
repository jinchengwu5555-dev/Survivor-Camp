// 今日情报（资料库 R79，intel.json）：每天给几个分区一条情报，引导玩家每天去不同的地方。
// 当天派出去的人（打猎、钓鱼、勘察）按出发时的情报算：收获多、危险少，或者危险大但收获更多。
// 挑哪几个分区用 天数 + 开局时间 做哈希，不动营地的随机数（不影响其他系统的随机结果）。

import { districtName } from './names';
import { currentDay } from './state';
import { DistrictDef, GameConfig, GameState, IntelKind } from './types';
import { maxTierOwned } from './vehicles';

export interface IntelMods {
    hunt: number;
    fish: number;
    loot: number;
    danger: number;
}

const NEUTRAL: IntelMods = { hunt: 1, fish: 1, loot: 1, danger: 1 };

/** 简单的整数哈希（同一天同一局结果固定） */
function hash(n: number): number {
    let x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
}

function fits(kind: IntelKind, d: DistrictDef): boolean {
    if (kind.needs === 'hunt') return (d.hunting?.game ?? []).some((g) => g.kind === 'hunt');
    if (kind.needs === 'fish') return (d.hunting?.game ?? []).some((g) => g.kind === 'fish');
    if (kind.hunt && !kind.loot && !kind.danger) return !!d.hunting;
    return true;
}

/** 今天的情报（换日时重新生成） */
export function todayIntel(config: GameConfig, state: GameState, now: number): { district: DistrictDef; kind: IntelKind; text: string }[] {
    const cfg = config.intel;
    const districts = config.districts?.districts ?? [];
    if (!cfg || !cfg.kinds.length || !districts.length) return [];
    const day = currentDay(config, state, now);
    if (state.intel?.day !== day) {
        // 只给现在能去的分区（交通工具够得着）
        const tier = maxTierOwned(config, state);
        const pool = districts.filter((d) => d.tier <= tier);
        const items: { district: string; kind: string }[] = [];
        let seed = hash(day * 7919 + (state.createdAt % 1_000_003));
        for (let i = 0; i < cfg.perDay && pool.length > items.length; i++) {
            const left = pool.filter((d) => !items.some((x) => x.district === d.id));
            const d = left[seed % left.length];
            seed = hash(seed + 1);
            const kinds = cfg.kinds.filter((k) => fits(k, d));
            if (!kinds.length) continue;
            items.push({ district: d.id, kind: kinds[seed % kinds.length].id });
            seed = hash(seed + 1);
        }
        state.intel = { day, items };
    }
    return state.intel.items.flatMap((x) => {
        const district = districts.find((d) => d.id === x.district);
        const kind = cfg.kinds.find((k) => k.id === x.kind);
        return district && kind ? [{ district, kind, text: kind.text.split('{d}').join(`${district.icon}${districtName(state, district)}`) }] : [];
    });
}

/** 某个分区今天的倍率（没有情报就是 1） */
export function intelMods(config: GameConfig, state: GameState, districtId: string, now: number): IntelMods {
    const hit = todayIntel(config, state, now).find((x) => x.district.id === districtId);
    if (!hit) return NEUTRAL;
    const k = hit.kind;
    return { hunt: k.hunt ?? 1, fish: k.fish ?? 1, loot: k.loot ?? 1, danger: k.danger ?? 1 };
}
