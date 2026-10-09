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

/** 营地布局：围墙围成的矩形（rect；老战报只有 half = 中心在原点、半边长 half 的正方形），墙上开着几个门（门的位置在墙线上） */
export interface CampLayout {
    half: number;
    gates: Point[];
    /** 围墙的范围（格）；不写就是 half 的正方形 */
    rect?: Rect;
    /** 营地里的建筑（只用来画，不挡路） */
    buildings?: CampBuilding[];
}

export interface Rect {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

/** 营地里的一栋建筑：中心、宽高（格）和图标 */
export interface CampBuilding {
    x: number;
    y: number;
    w: number;
    h: number;
    icon: string;
    name: string;
}

export function campBounds(camp: CampLayout): Rect {
    return camp.rect ?? { x1: -camp.half, x2: camp.half, y1: -camp.half, y2: camp.half };
}

export function campCenter(camp: CampLayout): Point {
    const r = campBounds(camp);
    return { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
}

/** 在围墙里面（含墙线） */
export function insideCamp(camp: CampLayout, p: Point): boolean {
    const r = campBounds(camp);
    return p.x >= r.x1 - 1e-9 && p.x <= r.x2 + 1e-9 && p.y >= r.y1 - 1e-9 && p.y <= r.y2 + 1e-9;
}

/** 门朝外的方向（单位向量）：看门在哪条墙上 */
export function gateNormal(camp: CampLayout, gate: Point): Point {
    const r = campBounds(camp);
    const d = [
        { n: { x: -1, y: 0 }, d: Math.abs(gate.x - r.x1) },
        { n: { x: 1, y: 0 }, d: Math.abs(gate.x - r.x2) },
        { n: { x: 0, y: -1 }, d: Math.abs(gate.y - r.y1) },
        { n: { x: 0, y: 1 }, d: Math.abs(gate.y - r.y2) },
    ].sort((a, b) => a.d - b.d);
    return d[0].n;
}

/** 严格在墙里面的点推到最近的墙外（墙外的丧尸贴着墙走，不会穿墙进来） */
export function pushOutside(camp: CampLayout, p: Point): Point {
    const r = campBounds(camp);
    if (p.x <= r.x1 || p.x >= r.x2 || p.y <= r.y1 || p.y >= r.y2) return p;
    const options = [
        { d: p.x - r.x1, q: { x: r.x1 - 0.01, y: p.y } },
        { d: r.x2 - p.x, q: { x: r.x2 + 0.01, y: p.y } },
        { d: p.y - r.y1, q: { x: p.x, y: r.y1 - 0.01 } },
        { d: r.y2 - p.y, q: { x: p.x, y: r.y2 + 0.01 } },
    ].sort((a, b) => a.d - b.d);
    return options[0].q;
}

/** 把墙里的点限制在围墙以内 */
export function clampInside(camp: CampLayout, p: Point): Point {
    const r = campBounds(camp);
    return { x: Math.max(r.x1, Math.min(r.x2, p.x)), y: Math.max(r.y1, Math.min(r.y2, p.y)) };
}
