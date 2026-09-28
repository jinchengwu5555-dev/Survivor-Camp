// 可存档的伪随机数（mulberry32）。随机状态保存在调用方的 rngState 里（GameState、Battle），
// 读档或用同一个种子重放时结果可复现，方便测试和调试。

export interface RngHolder {
    rngState: number;
}

export function nextRandom(state: RngHolder): number {
    let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pickWeighted<T extends { weight: number }>(state: RngHolder, items: T[]): T | null {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (total <= 0) return null;
    let roll = nextRandom(state) * total;
    for (const item of items) {
        roll -= Math.max(0, item.weight);
        if (roll < 0) return item;
    }
    return items[items.length - 1];
}

export function pickOne<T>(state: RngHolder, items: T[]): T | null {
    if (items.length === 0) return null;
    return items[Math.floor(nextRandom(state) * items.length)];
}
