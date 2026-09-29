// 探索背包：打赢以后，战利品摊在地上，要装进背包才能带回营地。
//   - 背包是一个格子网（不开车 3×3，车越大格子越多），每件东西占 w×h 格，可以转 90 度
//   - 还有重量上限：每个人能背 carryPerPerson，车能多装 cargo
//   - 装不下 / 太重的只能留在原地
// 资源按 packing.bundles 打成一包一包（包的大小随指挥部等级和战利品一起成长，所以包数不变）；
// 道具一件一件装，大小、重量写在 props.json（没写用默认值）。
// 界面上玩家自己摆（state.pendingHauls）；测试和模拟自动装（autoPack，按“价值 / 格子”贪心）。

import { grantResources, hqLevel } from './economy';
import { addProp, formatProps, propDef } from './props';
import { addLog, addStat } from './state';
import { ActionResult, GameConfig, GameState, HaulState, LootPiece, RESOURCE_IDS, ResourceBag, ResourceId } from './types';

/** 每种资源一包大概值多少（用来决定先装什么） */
const RESOURCE_VALUE: Record<ResourceId, number> = { food: 1, wood: 1, parts: 1.4, medicine: 1.8, cans: 2.5 };

/** 资源包的大小随战利品一起成长（和 expeditionLoot 的倍率一致） */
function bundleGrowth(config: GameConfig, state: GameState): number {
    return Math.pow(config.balance.expeditionScaling.lootGrowth, hqLevel(state) - 1);
}

/** 把一次探索的战利品拆成一件一件 */
export function makePieces(config: GameConfig, state: GameState, loot: ResourceBag, props: Record<string, number>): LootPiece[] {
    const cfg = config.packing;
    const pieces: LootPiece[] = [];
    let id = 1;
    for (const res of RESOURCE_IDS) {
        const total = Math.floor(loot[res] ?? 0);
        if (total <= 0) continue;
        const b = cfg?.bundles[res] ?? { amount: 20, size: [1, 1] as [number, number], weight: 2 };
        const per = Math.max(1, Math.round(b.amount * bundleGrowth(config, state)));
        const count = Math.max(1, Math.round(total / per));
        for (let i = 0; i < count; i++) {
            const amount = i < count - 1 ? Math.floor(total / count) : total - Math.floor(total / count) * (count - 1);
            pieces.push({ id: id++, kind: 'resource', item: res, amount, w: b.size[0], h: b.size[1], weight: b.weight });
        }
    }
    for (const [prop, n] of Object.entries(props)) {
        const def = propDef(config, prop);
        const size = def?.size ?? cfg?.defaultPropSize ?? [1, 1];
        for (let i = 0; i < n; i++) {
            pieces.push({ id: id++, kind: 'prop', item: prop, amount: 1, w: size[0], h: size[1], weight: def?.weight ?? cfg?.defaultPropWeight ?? 1 });
        }
    }
    return pieces;
}

export function pieceValue(config: GameConfig, p: LootPiece): number {
    if (p.kind === 'resource') return RESOURCE_VALUE[p.item as ResourceId] ?? 1;
    const def = propDef(config, p.item);
    return def?.type === 'gear' ? 6 : def?.type === 'chest' ? 5 : 3;
}

/** 摆好之后占的格子（考虑旋转） */
function footprint(p: LootPiece, rotated: boolean): { w: number; h: number } {
    return rotated ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

export function pieceOf(haul: HaulState, id: number): LootPiece | undefined {
    return haul.pieces.find((p) => p.id === id);
}

export function packedWeight(haul: HaulState): number {
    return haul.packed.reduce((n, pk) => n + (pieceOf(haul, pk.piece)?.weight ?? 0), 0);
}

/** 格子被谁占了：返回二维数组，空格为 0 */
export function occupancy(haul: HaulState, skip?: number): number[][] {
    const [gw, gh] = haul.grid;
    const grid = Array.from({ length: gh }, () => new Array<number>(gw).fill(0));
    for (const pk of haul.packed) {
        if (pk.piece === skip) continue;
        const p = pieceOf(haul, pk.piece);
        if (!p) continue;
        const f = footprint(p, pk.rotated);
        for (let y = pk.y; y < pk.y + f.h; y++) for (let x = pk.x; x < pk.x + f.w; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = p.id;
    }
    return grid;
}

/** 能不能把这件东西放在 (x, y)；返回 null 表示可以 */
export function placeBlocker(haul: HaulState, pieceId: number, x: number, y: number, rotated: boolean): string | null {
    const p = pieceOf(haul, pieceId);
    if (!p) return '没有这件东西';
    const f = footprint(p, rotated);
    const [gw, gh] = haul.grid;
    if (x < 0 || y < 0 || x + f.w > gw || y + f.h > gh) return '放不下';
    const grid = occupancy(haul, pieceId);
    for (let yy = y; yy < y + f.h; yy++) for (let xx = x; xx < x + f.w; xx++) if (grid[yy][xx]) return '位置被占了';
    const already = haul.packed.some((pk) => pk.piece === pieceId);
    if (!already && packedWeight(haul) + p.weight > haul.maxWeight) return '太重了，背不动';
    return null;
}

export function placePiece(haul: HaulState, pieceId: number, x: number, y: number, rotated: boolean): string | null {
    const blocker = placeBlocker(haul, pieceId, x, y, rotated);
    if (blocker) return blocker;
    haul.packed = haul.packed.filter((pk) => pk.piece !== pieceId);
    haul.packed.push({ piece: pieceId, x, y, rotated });
    return null;
}

export function removePiece(haul: HaulState, pieceId: number): void {
    haul.packed = haul.packed.filter((pk) => pk.piece !== pieceId);
}

/** 找第一个能放下的位置（先试不转，再试转 90 度）；放下了返回 null */
export function autoPlace(haul: HaulState, pieceId: number): string | null {
    const p = pieceOf(haul, pieceId);
    if (!p) return '没有这件东西';
    if (!haul.packed.some((pk) => pk.piece === pieceId) && packedWeight(haul) + p.weight > haul.maxWeight) return '太重了，背不动';
    const [gw, gh] = haul.grid;
    for (const rotated of p.w === p.h ? [false] : [false, true]) {
        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                if (placePiece(haul, pieceId, x, y, rotated) === null) return null;
            }
        }
    }
    return '背包里没有地方了';
}

/** 自动整理：清空重新装，贵重、占地小的先装 */
export function autoPack(config: GameConfig, haul: HaulState): void {
    haul.packed = [];
    const order = [...haul.pieces].sort((a, b) => pieceValue(config, b) / (b.w * b.h) - pieceValue(config, a) / (a.w * a.h) || b.w * b.h - a.w * a.h);
    for (const p of order) autoPlace(haul, p.id);
}

export function newHaul(config: GameConfig, state: GameState, title: string, at: number, pieces: LootPiece[], grid: [number, number], maxWeight: number): HaulState {
    const haul: HaulState = { id: state.nextId++, title, at, pieces, packed: [], grid, maxWeight };
    autoPack(config, haul);
    return haul;
}

function pieceLabel(config: GameConfig, p: LootPiece): string {
    if (p.kind === 'resource') return `${config.resources.find((r) => r.id === p.item)?.icon ?? p.item}${p.amount}`;
    const def = propDef(config, p.item);
    return `${def?.icon ?? ''}${def?.name ?? p.item}`;
}

export function pieceText(config: GameConfig, p: LootPiece): string {
    return pieceLabel(config, p);
}

/** 背上背包回营地：装进去的入库，没装的留在原地。返回带回的资源、道具和留下的东西的文字 */
export function carryHome(config: GameConfig, state: GameState, haul: HaulState): { loot: ResourceBag; props: Record<string, number>; left: string } {
    const packed = new Set(haul.packed.map((pk) => pk.piece));
    const bag: ResourceBag = {};
    const props: Record<string, number> = {};
    const left: string[] = [];
    for (const p of haul.pieces) {
        if (!packed.has(p.id)) {
            left.push(pieceLabel(config, p));
            continue;
        }
        if (p.kind === 'resource') bag[p.item as ResourceId] = (bag[p.item as ResourceId] ?? 0) + p.amount;
        else props[p.item] = (props[p.item] ?? 0) + 1;
    }
    const loot = grantResources(config, state, bag);
    for (const [id, n] of Object.entries(props)) addProp(state, id, n);
    if (left.length) addStat(state, 'loot_left_behind', left.length);
    return { loot, props, left: left.join(' ') };
}

/** 玩家装好背包，点“带回营地” */
export function confirmHaul(config: GameConfig, state: GameState, haulId: number, now: number): ActionResult {
    const haul = (state.pendingHauls ?? []).find((h) => h.id === haulId);
    if (!haul) return { ok: false, reason: '没有要装的东西' };
    state.pendingHauls = (state.pendingHauls ?? []).filter((h) => h !== haul);
    const { loot, props, left } = carryHome(config, state, haul);
    const got = [RESOURCE_IDS.filter((id) => loot[id]).map((id) => `${config.resources.find((r) => r.id === id)?.icon ?? id}${loot[id]}`).join(' '), formatProps(config, props)].filter(Boolean).join('，');
    addLog(state, now, `🎒 从${haul.title}带回 ${got || '一点杂物'}。${left ? `没装下、只能留下：${left}。` : ''}`);
    return { ok: true, message: got };
}
