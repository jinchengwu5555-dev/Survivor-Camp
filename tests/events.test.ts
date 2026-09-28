// 每个事件的每个选项都能正常结算（不会因为配置写错而卡住玩家）。
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { choiceHints } from '../assets/scripts/core/events';
import { loadConfig, T0 } from './helpers';

describe('所有事件', () => {
    it('每个选项都能正常结算', () => {
        const config = loadConfig();
        for (const e of config.events) {
            e.choices.forEach((_, i) => {
                const game = CampGame.newGame(loadConfig(), T0, 7);
                game.state.resources = { food: 200, wood: 200, parts: 100, medicine: 50, cans: 50 };
                for (const id of ['leo', 'hank', 'rosa', 'nora', 'joe']) game.state.survivors.push({ id, mood: 50, injured: false, recoverAt: null, assignment: null });
                game.state.eventQueue = [e.id];
                expect(game.choose(i, T0), `${e.id} 选项 ${i + 1}`).toMatchObject({ ok: true });
            });
        }
    });

    it('从资料库采用的事件都注明了来源点子', () => {
        const config = loadConfig();
        for (const e of config.events as (typeof config.events[number] & { _idea?: string })[]) {
            if (e._idea !== undefined) expect(e._idea, e.id).toMatch(/^R\d{2}/);
        }
    });

    it('随机事件至少有 3 个选项（日记这类剧情事件除外），而且有带随机后果的选项', () => {
        const config = loadConfig();
        for (const e of config.events) {
            if (e.weight > 0 && !e.id.startsWith('diary_')) expect(e.choices.length, e.id).toBeGreaterThanOrEqual(3);
        }
        const random = config.events.flatMap((e) => e.choices).filter((c) => c.outcomes.length > 1);
        expect(random.length).toBeGreaterThanOrEqual(25);
    });
});

describe('选项提示和结果', () => {
    const config = loadConfig();
    const knock = config.events.find((e) => e.id === 'stranger_knock')!;
    const split = config.events.find((e) => e.id === 'food_split')!;

    it('选项旁边标出花费、随机、风险、收获', () => {
        expect(choiceHints(config, knock.choices[0])).toEqual(['🎲结果随机', '⚠️有风险', '🎁可能有收获']);
        expect(choiceHints(config, split.choices[2])[0]).toMatch(/^💰花费 .*20$/);
        expect(choiceHints(config, split.choices[0])).toEqual(['⚠️有风险']);
    });

    it('选完之后返回实际得失', () => {
        const game = CampGame.newGame(loadConfig(), T0, 7);
        game.state.eventQueue = ['food_split'];
        const food = game.state.resources.food;
        const res = game.choose(2, T0);
        expect(game.state.resources.food).toBe(food - 20);
        expect(res.effectsText).toMatch(/-20/);
        expect(res.effectsText).toMatch(/心情\+\d/);

        game.state.eventQueue = ['stranger_knock'];
        const r2 = game.choose(0, T0);
        expect(r2.effectsText).toContain('汉克加入');
    });
});
