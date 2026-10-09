// 战场几何：俯视的二维战场（x 向右，y 向上，单位：格）。
// 老的横版战斗所有人 y = 0，距离就退化成 |dx|，结果和以前一样。

export interface Point {
    x: number;
    y: number;
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 从 from 朝 to 走 step 格（不会越过 to） */
export function stepToward(from: Point, to: Point, step: number): Point {
    const d = distance(from, to);
    if (d <= step || d < 1e-9) return { x: to.x, y: to.y };
    return { x: from.x + ((to.x - from.x) / d) * step, y: from.y + ((to.y - from.y) / d) * step };
}

/** 营地布局：中心在原点、半边长 half 的方形围墙，墙上开着几个门（门的位置在墙线上） */
export interface CampLayout {
    half: number;
    gates: Point[];
}

/** 在围墙里面（含墙线） */
export function insideCamp(camp: CampLayout, p: Point): boolean {
    return Math.abs(p.x) <= camp.half + 1e-9 && Math.abs(p.y) <= camp.half + 1e-9;
}

/** 门朝外的方向（单位向量） */
export function gateNormal(camp: CampLayout, gate: Point): Point {
    if (Math.abs(gate.x) >= Math.abs(gate.y)) return { x: Math.sign(gate.x) || 1, y: 0 };
    return { x: 0, y: Math.sign(gate.y) || 1 };
}

/** 严格在墙里面的点推到最近的墙外（墙外的丧尸贴着墙走，不会穿墙进来） */
export function pushOutside(camp: CampLayout, p: Point): Point {
    const h = camp.half;
    if (Math.abs(p.x) >= h || Math.abs(p.y) >= h) return p;
    const dx = h - Math.abs(p.x);
    const dy = h - Math.abs(p.y);
    return dx < dy ? { x: (Math.sign(p.x) || 1) * (h + 0.01), y: p.y } : { x: p.x, y: (Math.sign(p.y) || 1) * (h + 0.01) };
}

/** 把墙里的点限制在围墙以内 */
export function clampInside(camp: CampLayout, p: Point): Point {
    const h = camp.half;
    return { x: Math.max(-h, Math.min(h, p.x)), y: Math.max(-h, Math.min(h, p.y)) };
}
