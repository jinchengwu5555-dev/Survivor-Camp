// 站位和人物搭配：技能删掉以后，打得好不好看的是谁站前排、谁站后排、队里都有谁。
//
// 站位（每个人在档案里选，默认按武器自动）：
//   前排：先挨打，生命 +10%；拿近战武器的人适合站前排
//   后排：离尸群远，开战后晚一点接敌；拿枪的人站后排攻击 +10%（武器的 range 决定能不能远程打）
//
// 搭配（同一支队伍里有这些人就生效，界面上会列出来）：
//   领袖（伊森）   全队攻击 +5%
//   医生           全队生命 +5%，倒下的人牺牲的概率减半
//   战士站前排     他自己的生命再 +10%
//   拾荒者         探索战利品 +15%
//   机械师         每人能多背 4 重
//   默契           和同队的人一起打过 3 场以上，每有一个这样的战友攻击 +3%（最多 +9%）
//   跟伊森的羁绊   和伊森同队时，按羁绊档位攻击 +2%～+10%（bonds.ts）

import { bondOf, LEADER, sharedBattles } from './bonds';
import { gearOf } from './gear';
import { survivorInfo } from './roster';
import { GameConfig, GameState, SurvivorRow } from './types';

export const ROW_NAMES: Record<SurvivorRow, string> = { front: '前排', back: '后排' };

/** 这个人手里武器的射程（没有远程武器就是 0，按角色自己的射程打） */
export function weaponRange(config: GameConfig, state: GameState, id: string): number {
    return gearOf(config, state, id).reduce((m, d) => Math.max(m, d.gear?.range ?? 0), 0);
}

/** 站位：自己选过就用自己选的，否则拿远程武器的站后排，其余站前排 */
export function rowOf(config: GameConfig, state: GameState, id: string): SurvivorRow {
    const s = state.survivors.find((x) => x.id === id);
    if (s?.row) return s.row;
    return weaponRange(config, state, id) >= 3 ? 'back' : 'front';
}

export interface SquadBonus {
    atk: number;
    hp: number;
}

export interface Synergy {
    icon: string;
    name: string;
    text: string;
}

const specialtyOf = (config: GameConfig, state: GameState, id: string) => survivorInfo(config, state, id)?.specialty;

/** 这支队伍有哪些搭配效果（界面显示用） */
export function squadSynergies(config: GameConfig, state: GameState, ids: string[], now: number): Synergy[] {
    const out: Synergy[] = [];
    const has = (spec: string) => ids.some((id) => specialtyOf(config, state, id) === spec);
    if (has('leader')) out.push({ icon: '⭐', name: '有人领头', text: '全队攻击 +5%' });
    if (has('medic')) out.push({ icon: '💊', name: '有医生跟着', text: '全队生命 +5%，倒下的人牺牲概率减半' });
    if (ids.some((id) => specialtyOf(config, state, id) === 'fighter' && rowOf(config, state, id) === 'front')) out.push({ icon: '🛡️', name: '战士顶在前面', text: '前排战士生命再 +10%' });
    if (has('scavenger')) out.push({ icon: '🔦', name: '有拾荒者', text: '战利品 +15%' });
    if (has('mechanic')) out.push({ icon: '🔧', name: '有机械师', text: '每个机械师让队伍多背 4 重' });
    const pairs = ids.reduce((n, a, i) => n + ids.slice(i + 1).filter((b) => sharedBattles(state, a, b) >= 3).length, 0);
    if (pairs) out.push({ icon: '🤝', name: '老搭档', text: `${pairs} 对人一起打过 3 场以上，攻击更高` });
    if (ids.includes(LEADER)) {
        const close = ids.filter((id) => id !== LEADER).map((id) => state.survivors.find((s) => s.id === id)).filter((s) => s && bondOf(config, state, s, now).atk > 1);
        if (close.length) out.push({ icon: '❤️', name: '跟着伊森', text: `${close.length} 个人和伊森感情深，攻击更高` });
    }
    const front = ids.filter((id) => rowOf(config, state, id) === 'front').length;
    if (ids.length >= 2 && front === 0) out.push({ icon: '⚠️', name: '没人顶前排', text: '后排会直接被尸群扑到' });
    return out;
}

/** 队伍里某个人的倍率（站位 + 搭配），乘在 combatMultiplier 之上 */
export function squadBonus(config: GameConfig, state: GameState, ids: string[], id: string, now: number): SquadBonus {
    let atk = 1;
    let hp = 1;
    const has = (spec: string) => ids.some((x) => specialtyOf(config, state, x) === spec);
    const row = rowOf(config, state, id);
    if (row === 'front') hp *= 1.1;
    if (row === 'back' && weaponRange(config, state, id) >= 3) atk *= 1.1;
    if (has('leader')) atk *= 1.05;
    if (has('medic')) hp *= 1.05;
    if (row === 'front' && specialtyOf(config, state, id) === 'fighter') hp *= 1.1;
    const mates = ids.filter((x) => x !== id && sharedBattles(state, id, x) >= 3).length;
    atk *= 1 + 0.03 * Math.min(3, mates);
    if (id !== LEADER && ids.includes(LEADER)) {
        const s = state.survivors.find((x) => x.id === id);
        if (s) atk *= bondOf(config, state, s, now).atk;
    }
    return { atk, hp };
}

/** 队里有没有医生（倒下的人牺牲概率减半） */
export function hasMedic(config: GameConfig, state: GameState, ids: string[]): boolean {
    return ids.some((id) => specialtyOf(config, state, id) === 'medic');
}

/** 拾荒者让战利品变多 */
export function lootBonus(config: GameConfig, state: GameState, ids: string[]): number {
    return ids.some((id) => specialtyOf(config, state, id) === 'scavenger') ? 1.15 : 1;
}

/** 机械师让队伍多背 */
export function carryBonus(config: GameConfig, state: GameState, ids: string[]): number {
    return ids.filter((id) => specialtyOf(config, state, id) === 'mechanic').length * 4;
}
