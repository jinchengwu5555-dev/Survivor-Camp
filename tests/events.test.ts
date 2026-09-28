// 每个事件的每个选项都能正常结算（不会因为配置写错而卡住玩家）。
import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
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
});
