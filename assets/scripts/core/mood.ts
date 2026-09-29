// 心情系统：每个人的心情 0～100 分成几档，每档有实际效果；心情为什么变了会记下来给玩家看。
//
//   😄 开心（80+）  打仗攻击 +5%
//   🙂 平静（55+）  没有影响
//   😐 一般（30+）  没有影响
//   😟 低落（10+）  干活产量 -15%
//   😭 崩溃（<10）  不干活、不守夜，躺着发呆（心情回升后自己恢复）
//
// 全营地的平均心情还是“士气”，影响所有人的产量（economy.ts 的 moraleMultiplier）。
// 改心情请用 changeMood，这样玩家能在个人档案里看到原因。

import { clampMood } from './economy';
import { GameConfig, GameState, SurvivorState } from './types';

export interface MoodTier {
    min: number;
    name: string;
    icon: string;
    /** 干活产量倍率 */
    work: number;
    /** 战斗攻击倍率 */
    atk: number;
    effect: string;
}

export const MOOD_TIERS: MoodTier[] = [
    { min: 80, name: '开心', icon: '😄', work: 1, atk: 1.05, effect: '打仗攻击 +5%' },
    { min: 55, name: '平静', icon: '🙂', work: 1, atk: 1, effect: '没有影响' },
    { min: 30, name: '一般', icon: '😐', work: 1, atk: 1, effect: '没有影响' },
    { min: 10, name: '低落', icon: '😟', work: 0.85, atk: 1, effect: '干活产量 -15%' },
    { min: 0, name: '崩溃', icon: '😭', work: 0, atk: 0.9, effect: '不干活、不守夜，打仗攻击 -10%' },
];

/** 最多记几条心情变化的原因 */
const MAX_NOTES = 6;

export function moodTier(mood: number): MoodTier {
    return MOOD_TIERS.find((t) => mood >= t.min) ?? MOOD_TIERS[MOOD_TIERS.length - 1];
}

export function isBrokenDown(s: SurvivorState | undefined): boolean {
    return !!s && moodTier(s.mood).work === 0;
}

/** 改一个人的心情，并记下原因 */
export function changeMood(state: GameState, s: SurvivorState, amount: number, reason: string, now: number): void {
    if (!amount) return;
    const before = s.mood;
    s.mood = clampMood(s.mood + amount);
    const real = Math.round(s.mood - before);
    if (!real) return;
    s.moodNotes = s.moodNotes ?? [];
    const last = s.moodNotes[s.moodNotes.length - 1];
    // 同一个原因连着发生就合并成一条
    if (last && last.text === reason) {
        last.amount += real;
        last.at = now;
    } else {
        s.moodNotes.push({ at: now, text: reason, amount: real });
        if (s.moodNotes.length > MAX_NOTES) s.moodNotes.shift();
    }
    if (moodTier(before).name !== moodTier(s.mood).name) state.moodShifts = (state.moodShifts ?? 0) + 1;
}

/** 改所有人的心情 */
export function changeMoodAll(state: GameState, amount: number, reason: string, now: number, filter?: (s: SurvivorState) => boolean): void {
    for (const s of state.survivors) if (!filter || filter(s)) changeMood(state, s, amount, reason, now);
}

/** 现在正在持续影响心情的东西（界面显示用） */
export function moodFactors(config: GameConfig, state: GameState, s: SurvivorState): string[] {
    const out: string[] = [];
    if (state.resources.food <= 0) out.push('🍞 饿肚子，心情一直在掉');
    if (s.injured) out.push('🩹 受伤了');
    if ((s.sleep ?? 100) < (config.balance.nightWatch?.tiredBelow ?? 0)) out.push('🥱 守夜太累');
    if (state.resources.food > 0 && s.mood < config.balance.moodRecoveryMax) out.push('🍲 吃饱了，心情慢慢恢复');
    return out;
}
