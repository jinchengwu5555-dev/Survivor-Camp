// 羁绊：跟着伊森越久、一起打过的仗越多，感情越深。
//   - 和伊森的羁绊 = 一起度过的天数 + 和伊森并肩作战的次数 × 0.5，分五档，界面上名字用颜色区分
//   - 两个人之间的默契 = 一起出过的战斗次数（state.bonds），同队里有默契的战友打得更好（formation.ts）
//   - “最初的伙伴”：第一次探索遇到并留下的人（以及开局就在的人），像骑马与砍杀里最早跟着你的那几个兄弟
// 墓地也在这里：死去的人连同他和伊森的羁绊一起记下来，可以去祷告。

import { addLog, addStat, currentDay } from './state';
import { changeMoodAll } from './mood';
import { survivorInfo } from './roster';
import { ActionResult, GameConfig, GameState, GraveState, SurvivorState } from './types';

export interface BondTier {
    min: number;
    name: string;
    /** 名字的颜色（十六进制） */
    color: string;
    /** 和伊森同队时的攻击加成 */
    atk: number;
    /** 牺牲时大家多掉的心情 */
    grief: number;
}

export const BOND_TIERS: BondTier[] = [
    { min: 50, name: '老战友', color: '#f0c040', atk: 1.1, grief: 12 },
    { min: 25, name: '生死之交', color: '#c080ff', atk: 1.07, grief: 8 },
    { min: 10, name: '信赖', color: '#60a8ff', atk: 1.04, grief: 5 },
    { min: 3, name: '熟识', color: '#70c070', atk: 1.02, grief: 2 },
    { min: 0, name: '陌生', color: '#a0a0a0', atk: 1, grief: 0 },
];

export const LEADER = 'ethan';

function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 两个人一起打过几次仗 */
export function sharedBattles(state: GameState, a: string, b: string): number {
    return state.bonds?.[pairKey(a, b)] ?? 0;
}

/** 一场战斗打完：同队的人两两加一次默契 */
export function recordSharedBattle(state: GameState, ids: string[]): void {
    state.bonds = state.bonds ?? {};
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const k = pairKey(ids[i], ids[j]);
            state.bonds[k] = (state.bonds[k] ?? 0) + 1;
        }
    }
}

/** 跟着伊森多少天了 */
export function daysWithLeader(config: GameConfig, state: GameState, s: SurvivorState, now: number): number {
    const day = config.balance.dayLengthMinutes * 60_000;
    return Math.max(0, Math.floor((now - (s.joinedAt ?? state.createdAt)) / day));
}

/** 和伊森的羁绊值；伊森自己没有 */
export function bondPoints(config: GameConfig, state: GameState, s: SurvivorState, now: number): number {
    if (s.id === LEADER) return 0;
    return daysWithLeader(config, state, s, now) + sharedBattles(state, s.id, LEADER) * 0.5;
}

export function bondTier(points: number): BondTier {
    return BOND_TIERS.find((t) => points >= t.min) ?? BOND_TIERS[BOND_TIERS.length - 1];
}

export function bondOf(config: GameConfig, state: GameState, s: SurvivorState, now: number): BondTier {
    return bondTier(bondPoints(config, state, s, now));
}

/** 最初的伙伴：开局就在，或者第一次探索遇到并留下的人 */
export function isFounder(state: GameState, s: SurvivorState): boolean {
    return !!s.founder || s.joinedAt === undefined;
}

// ---------- 墓地 ----------

/** 有人死了：写进墓地（killSurvivor 调用） */
export function bury(config: GameConfig, state: GameState, s: SurvivorState, now: number, cause: string): GraveState {
    const info = survivorInfo(config, state, s.id);
    const points = bondPoints(config, state, s, now);
    const grave: GraveState = {
        id: s.id,
        name: info?.name ?? s.id,
        title: info?.title ?? '',
        cause,
        diedDay: currentDay(config, state, now),
        diedAt: now,
        days: daysWithLeader(config, state, s, now),
        battles: s.id === LEADER ? 0 : sharedBattles(state, s.id, LEADER),
        bond: points,
        founder: isFounder(state, s),
        prayers: 0,
    };
    state.graveyard = [...(state.graveyard ?? []), grave];
    // 感情越深，大家越难过
    const tier = bondTier(points);
    if (tier.grief) changeMoodAll(state, -tier.grief, `失去了${tier.name}${grave.name}`, now);
    return grave;
}

/** 今天还能不能去这座墓前祷告（每座墓每天一次） */
export function prayBlocker(config: GameConfig, state: GameState, graveId: string, now: number): string | null {
    const g = (state.graveyard ?? []).find((x) => x.id === graveId);
    if (!g) return '没有这座墓';
    if (state.survivors.length === 0) return '已经没有人能来祷告了';
    if (g.lastPrayDay === currentDay(config, state, now)) return '今天已经来过了';
    return null;
}

/** 在墓前祷告：所有人心情变好（感情越深越有用），第一次祷告的人数越多…… */
export function pray(config: GameConfig, state: GameState, graveId: string, now: number): ActionResult {
    const blocker = prayBlocker(config, state, graveId, now);
    if (blocker) return { ok: false, reason: blocker };
    const g = (state.graveyard ?? []).find((x) => x.id === graveId)!;
    g.lastPrayDay = currentDay(config, state, now);
    g.prayers += 1;
    const tier = bondTier(g.bond);
    const amount = 2 + Math.round(tier.grief / 3) + (g.founder ? 2 : 0);
    changeMoodAll(state, amount, `在${g.name}的墓前祷告`, now);
    addStat(state, 'prayers');
    addLog(state, now, `🕯️ 大家在${g.name}的墓前站了一会儿。${g.founder ? '他是最早跟着伊森的那几个人之一。' : ''}`);
    return { ok: true, message: `心情 +${amount}` };
}
