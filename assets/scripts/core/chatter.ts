// 营地闲聊：每隔一会儿，营地里的两个人聊几句（闲聊、八卦、玩笑、拌嘴、担心……）。
// 台词在 chatter.json。说过的对话记在 state.chatterSeen，全部说完之前不会重复；
// 都说过一遍后才重新开始。
//   who    说话的人：幸存者 id，或者 "any"（营地里随便一个人）
//   about  八卦对象："any" = 随便一个不在说话的人，台词里用 {x} 代替名字
//   lines  [说话人序号, 台词]
//   kind   chat 闲聊 / gossip 八卦 / joke 玩笑 / warm 暖心 / worry 担心 / quarrel 拌嘴，按 moodByKind 改说话人的心情

import { conditionMet } from './events';
import { isOnExpedition } from './combat';
import { changeMood } from './mood';
import { nextRandom, pickOne } from './rng';
import { survivorName } from './roster';
import { ChatterDialogueDef, ChatterEntry, GameConfig, GameState } from './types';

const MAX_RECENT = 12;

/** 在营地里、能聊天的人 */
function present(state: GameState): string[] {
    return state.survivors.filter((s) => !isOnExpedition(state, s.id)).map((s) => s.id);
}

/** 给一段对话找齐说话的人；找不齐返回 null */
function castDialogue(state: GameState, d: ChatterDialogueDef, here: string[]): { speakers: string[]; about?: string } | null {
    const speakers: string[] = [];
    for (const role of d.who) {
        if (role !== 'any') {
            if (!here.includes(role) || speakers.includes(role)) return null;
            speakers.push(role);
        }
    }
    for (const role of d.who) {
        if (role !== 'any') continue;
        const pool = here.filter((id) => !speakers.includes(id));
        const pick = pickOne(state, pool);
        if (!pick) return null;
        speakers.push(pick);
    }
    // 按原来的顺序排回去（具名的人在 who 里的位置）
    const ordered: string[] = [];
    let anyIdx = d.who.filter((r) => r !== 'any').length;
    let namedIdx = 0;
    for (const role of d.who) ordered.push(role === 'any' ? speakers[anyIdx++] : speakers[namedIdx++]);
    let about: string | undefined;
    if (d.about) {
        about = pickOne(state, here.filter((id) => !ordered.includes(id))) ?? undefined;
        if (!about) return null;
    }
    return { speakers: ordered, about };
}

/** 还能说的对话（条件满足、没说过、人凑得齐） */
export function availableDialogues(config: GameConfig, state: GameState, now: number): ChatterDialogueDef[] {
    const here = present(state);
    const seen = new Set(state.chatterSeen ?? []);
    return (config.chatter?.dialogues ?? []).filter((d) => {
        if (seen.has(d.id) || !conditionMet(config, state, d.conditions, now)) return false;
        const named = d.who.filter((r) => r !== 'any');
        const need = d.who.length + (d.about ? 1 : 0);
        return named.every((id) => here.includes(id)) && here.length >= need;
    });
}

/** 聊一段；没人能聊时返回 null */
export function chat(config: GameConfig, state: GameState, now: number): ChatterEntry | null {
    let pool = availableDialogues(config, state, now);
    if (pool.length === 0 && (state.chatterSeen ?? []).length > 0) {
        // 能说的都说过了：重新开始一轮
        state.chatterSeen = [];
        pool = availableDialogues(config, state, now);
    }
    const d = pickOne(state, pool);
    if (!d) return null;
    const cast = castDialogue(state, d, present(state));
    if (!cast) return null;
    const name = (id: string) => survivorName(config, state, id);
    const fill = (text: string) => (cast.about ? text.split('{x}').join(name(cast.about)) : text);
    const entry: ChatterEntry = {
        at: now,
        id: d.id,
        kind: d.kind,
        lines: d.lines.map(([i, text]) => ({ who: cast.speakers[i], text: fill(text) })),
    };
    state.chatterSeen = [...(state.chatterSeen ?? []), d.id];
    state.chatter = [...(state.chatter ?? []), entry].slice(-MAX_RECENT);
    const mood = config.chatter?.moodByKind?.[d.kind] ?? 0;
    const verb = d.kind === 'quarrel' ? '拌嘴' : d.kind === 'gossip' ? '说八卦' : '聊天';
    cast.speakers.forEach((id, i) => {
        const s = state.survivors.find((x) => x.id === id);
        const other = cast.speakers[i === 0 ? 1 : 0];
        if (s) changeMood(state, s, mood, `和${name(other)}${verb}`, now);
    });
    state.stats.chats = (state.stats.chats ?? 0) + 1;
    return entry;
}

/** 推进到 now：到时间就聊一段 */
export function updateChatter(config: GameConfig, state: GameState, now: number): void {
    const cfg = config.chatter;
    if (!cfg || state.gameOver) return;
    const interval = cfg.intervalMinutes * 60_000;
    if (state.nextChatAt === undefined) state.nextChatAt = now + interval / 2;
    if (now < state.nextChatAt) return;
    state.nextChatAt = now + interval * (0.6 + 0.8 * nextRandom(state));
    chat(config, state, now);
}
