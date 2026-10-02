// 伊森的日记（资料库 R55，diary.json）：每过一天，把这一天发生的事写成一篇第一人称的日记。
// 换日时对比当天开始时的快照（统计数据、人员、墓地、食物），挑几句写进去。
// 用哪一句由天数做哈希决定，不动营地的随机数。伊森不在了，就由营地里的其他人接着写。

import { seasonAt } from './seasons';
import { survivorName } from './roster';
import { currentDay } from './state';
import { DiaryEntry, DiarySnapshot, GameConfig, GameState } from './types';

function hash(n: number): number {
    let x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
}

function pick(lines: string[], day: number, salt: number): string {
    return lines.length ? lines[hash(day * 131 + salt) % lines.length] : '';
}

function snapshot(config: GameConfig, state: GameState, now: number): DiarySnapshot {
    return {
        day: currentDay(config, state, now),
        stats: { ...state.stats },
        survivors: state.survivors.map((s) => s.id),
        graves: (state.graveyard ?? []).length,
        food: state.resources.food,
    };
}

/** 写这一天的日记 */
export function writeEntry(config: GameConfig, state: GameState, snap: DiarySnapshot, at: number): DiaryEntry | null {
    const cfg = config.diary;
    if (!cfg || state.survivors.length === 0) return null;
    const day = snap.day;
    const parts: string[] = [];
    const avgMood = state.survivors.reduce((sum, s) => sum + s.mood, 0) / state.survivors.length;
    const opener = cfg.openers.find((o) => avgMood >= o.min) ?? cfg.openers[cfg.openers.length - 1];
    if (opener) parts.push(pick(opener.lines, day, 1));
    const season = seasonAt(config, state, at - 1).season.id;
    if (cfg.seasons[season] && hash(day) % 2 === 0) parts.push(pick(cfg.seasons[season], day, 2));

    const nameList = (names: string[]) => names.join('、');
    const joined = state.survivors.filter((s) => !snap.survivors.includes(s.id)).map((s) => survivorName(config, state, s.id));
    const newGraves = (state.graveyard ?? []).slice(snap.graves);
    const left = snap.survivors.filter((id) => !state.survivors.some((s) => s.id === id) && !newGraves.some((g) => g.id === id)).map((id) => survivorName(config, state, id));
    if (joined.length) parts.push(pick(cfg.joined, day, 3).split('{names}').join(nameList(joined)));
    if (newGraves.length) parts.push(pick(cfg.died, day, 4).split('{names}').join(nameList(newGraves.map((g) => g.name))));
    if (left.length) parts.push(pick(cfg.left, day, 5).split('{names}').join(nameList(left)));

    let said = 0;
    cfg.stats.forEach((line, i) => {
        const n = (state.stats[line.stat] ?? 0) - (snap.stats[line.stat] ?? 0);
        if (n <= 0 || said >= 4) return;
        parts.push(pick(line.lines, day, 10 + i).split('{n}').join(String(n)));
        said += 1;
    });
    if (said === 0 && !joined.length && !newGraves.length && !left.length) parts.push(pick(cfg.quiet, day, 6));
    parts.push(pick(cfg.closers, day, 7));

    const ethan = state.survivors.find((s) => s.id === 'ethan');
    const author = ethan ? survivorName(config, state, 'ethan') : survivorName(config, state, state.survivors[0].id);
    const text = (ethan ? '' : `（伊森不在了，${author}接着写这本日记。）`) + parts.filter(Boolean).join('');
    return { day, at, author, text };
}

/** 每次 tick：换日了就写一篇，再拍下新一天的快照 */
export function updateDiary(config: GameConfig, state: GameState, now: number): void {
    if (!config.diary) return;
    const today = currentDay(config, state, now);
    const snap = state.diarySnap;
    if (!snap) {
        state.diarySnap = snapshot(config, state, now);
        return;
    }
    if (today <= snap.day) return;
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    const entry = writeEntry(config, state, snap, state.createdAt + snap.day * dayMs);
    if (entry) {
        state.diary = [...(state.diary ?? []), entry].slice(-config.diary.keep);
    }
    state.diarySnap = snapshot(config, state, now);
}

/** 最新的几篇（新的在前） */
export function latestEntries(state: GameState, count = 60): DiaryEntry[] {
    return [...(state.diary ?? [])].reverse().slice(0, count);
}
