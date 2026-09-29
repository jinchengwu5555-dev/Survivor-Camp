import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { allDialogues, availableDialogues, chat } from '../assets/scripts/core/chatter';
import { seasonAt } from '../assets/scripts/core/seasons';
import { loadConfig, MIN, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 11);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('营地闲聊', () => {
    it('台词足够多：手写至少 180 段，加上寒暄组合超过 450 段', () => {
        const config = loadConfig();
        expect(config.chatter!.dialogues.length).toBeGreaterThanOrEqual(180);
        expect(allDialogues(config).length).toBeGreaterThan(450);
    });

    it('寒暄：{a}{b}换成说话人的名字，季节话题只在那个季节出现', () => {
        const game = newGame();
        const { config, state } = game;
        const season = seasonAt(config, state, T0).season.id;
        const pool = availableDialogues(config, state, T0);
        expect(pool.some((d) => d.id.startsWith('st_morning'))).toBe(true);
        for (const d of pool) if (d.season) expect(d.season).toBe(season);
        for (let i = 0; i < 60; i++) {
            const c = chat(config, state, T0)!;
            for (const l of c.lines) expect(l.text).not.toMatch(/\{[abx]\}|\{town\}/);
        }
    });

    it('能说的对话全部说完之前不会重复；说话的人都在营地、互不相同；{x} 换成了名字', () => {
        const game = newGame();
        const { config, state } = game;
        const total = availableDialogues(config, state, T0).length;
        expect(total).toBeGreaterThan(40);
        const ids: string[] = [];
        for (let i = 0; i < total; i++) {
            const c = chat(config, state, T0)!;
            expect(c).toBeTruthy();
            ids.push(c.id);
            const who = new Set(c.lines.map((l) => l.who));
            for (const id of who) expect(state.survivors.some((s) => s.id === id)).toBe(true);
            for (const l of c.lines) expect(l.text).not.toContain('{x}');
            expect(c.lines.every((l) => l.who)).toBe(true);
        }
        expect(new Set(ids).size).toBe(total);
        // 全部说完后重新开始一轮
        expect(chat(config, state, T0)).toBeTruthy();
    });

    it('指定了人的对话，那个人不在就不会出现', () => {
        const game = newGame();
        const { config, state } = game;
        state.survivors = state.survivors.filter((s) => s.id !== 'martha');
        expect(availableDialogues(config, state, T0).some((d) => d.who.includes('martha'))).toBe(false);
    });

    it('游戏里隔一会儿就聊一段，最近的记在 state.chatter', () => {
        const game = newGame();
        game.state.resources.food = 10_000;
        for (let m = 1; m <= 60; m++) game.tick(T0 + m * MIN);
        expect((game.state.chatter ?? []).length).toBeGreaterThan(3);
        expect(game.state.stats.chats).toBeGreaterThan(3);
    });
});
