// 今日情报（资料库 R79，intel.json）：每天给几个分区一条情报，引导玩家每天去不同的地方。
// 当天派出去的人（打猎、钓鱼、勘察）按出发时的情报算：收获多、危险少，或者危险大但收获更多。
// 挑哪几个分区用 天数 + 开局时间 做哈希，不动营地的随机数（不影响其他系统的随机结果）。

import { districtName } from './names';
import { currentDay } from './state';
import { hqLevel } from './economy';
import { GameConfig, GameState, HuntingGround, IntelKind } from './types';
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

/** 打猎 / 钓鱼的情报给狩猎场，其他的（搜刮、危险）给探索分区 */
function forGrounds(kind: IntelKind): boolean {
    return (!!kind.hunt || !!kind.fish) && !kind.loot;
}

function fitsGround(kind: IntelKind, g: HuntingGround): boolean {
    if (kind.needs === 'fish' || (kind.fish && !kind.hunt)) return g.game.some((x) => x.kind === 'fish');
    if (kind.needs === 'hunt') return g.game.some((x) => x.kind === 'hunt');
    return true;
}

export interface IntelItem {
    /** 分区 id 或狩猎场 id */
    id: string;
    icon: string;
    name: string;
    target: 'district' | 'ground';
    kind: IntelKind;
    text: string;
}

/** 今天的情报（换日时重新生成）：搜刮 / 危险的情报给探索分区，打猎 / 钓鱼的给狩猎场 */
export function todayIntel(config: GameConfig, state: GameState, now: number): IntelItem[] {
    const cfg = config.intel;
    const districts = config.districts?.districts ?? [];
    const grounds = config.hunting?.grounds ?? [];
    if (!cfg || !cfg.kinds.length || (!districts.length && !grounds.length)) return [];
    const day = currentDay(config, state, now);
    // 只给现在能去的地方（交通工具够得着）
    const tier = maxTierOwned(config, state);
    const places = [
        ...districts.filter((d) => d.tier <= tier).map((d) => ({ id: d.id, ground: undefined as HuntingGround | undefined })),
        ...grounds.filter((g) => g.tier <= tier && !(g.minHq && hqLevel(state) < g.minHq)).map((g) => ({ id: g.id, ground: g as HuntingGround | undefined })),
    ];
    if (state.intel?.day !== day) {
        const items: { district: string; kind: string }[] = [];
        let seed = hash(day * 7919 + (state.createdAt % 1_000_003));
        for (let i = 0; i < cfg.perDay && places.length > items.length; i++) {
            const left = places.filter((p) => !items.some((x) => x.district === p.id));
            const p = left[seed % left.length];
            seed = hash(seed + 1);
            const kinds = cfg.kinds.filter((k) => (p.ground ? forGrounds(k) && fitsGround(k, p.ground) : !forGrounds(k)));
            if (!kinds.length) continue;
            items.push({ district: p.id, kind: kinds[seed % kinds.length].id });
            seed = hash(seed + 1);
        }
        state.intel = { day, items };
    }
    return state.intel.items.flatMap((x): IntelItem[] => {
        const kind = cfg.kinds.find((k) => k.id === x.kind);
        if (!kind) return [];
        const d = districts.find((y) => y.id === x.district);
        const g = grounds.find((y) => y.id === x.district);
        const name = d ? districtName(state, d) : g?.name;
        const icon = d?.icon ?? g?.icon ?? '';
        if (!name) return [];
        return [{ id: x.district, icon, name, target: d ? 'district' : 'ground', kind, text: kind.text.split('{d}').join(`${icon}${name}`) }];
    });
}

/** 某个分区 / 狩猎场今天的倍率（没有情报就是 1） */
export function intelMods(config: GameConfig, state: GameState, districtId: string, now: number): IntelMods {
    const hit = todayIntel(config, state, now).find((x) => x.id === districtId);
    if (!hit) return NEUTRAL;
    const k = hit.kind;
    return { hunt: k.hunt ?? 1, fish: k.fish ?? 1, loot: k.loot ?? 1, danger: k.danger ?? 1 };
}
