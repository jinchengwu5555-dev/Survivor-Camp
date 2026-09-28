// 检查 docs/reference/candidate-events.json 里的候选事件和当前配置兼容：
// 采用时复制进 events.json 就能直接用，不会引用不存在的幸存者、资源或事件。

import { describe, expect, it } from 'vitest';
import candidates from '../docs/reference/candidate-events.json';
import { CampGame } from '../assets/scripts/core/CampGame';
import { GameEventDef } from '../assets/scripts/core/types';
import { validateConfig } from '../assets/scripts/core/validate';
import { loadConfig, T0 } from './helpers';

const events = candidates as unknown as (GameEventDef & { _idea: string })[];

describe('备用资料库：候选事件', () => {
    it('合并进当前配置后没有错误，也不和已有事件重名', () => {
        const config = loadConfig();
        const existing = new Set(config.events.map((e) => e.id));
        for (const e of events) expect(existing.has(e.id), `事件 id 重名：${e.id}`).toBe(false);
        config.events.push(...events);
        expect(validateConfig(config)).toEqual([]);
    });

    it('每个事件都注明了来源点子', () => {
        for (const e of events) expect(e._idea, e.id).toMatch(/^R\d{2}/);
    });

    it('每个选项都能正常结算', () => {
        for (const e of events) {
            e.choices.forEach((_, i) => {
                const config = loadConfig();
                config.events.push(...events);
                const game = CampGame.newGame(config, T0, 7);
                game.state.resources = { food: 200, wood: 200, parts: 100, medicine: 50, cans: 10 };
                for (const id of ['leo', 'hank', 'rosa', 'nora']) game.state.survivors.push({ id, mood: 50, injured: false, recoverAt: null, assignment: null });
                game.state.eventQueue = [e.id];
                expect(game.choose(i, T0), `${e.id} 选项 ${i + 1}`).toMatchObject({ ok: true });
            });
        }
    });
});
