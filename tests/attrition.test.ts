import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { bedCount } from '../assets/scripts/core/economy';
import { recruitScale } from '../assets/scripts/core/recruits';
import { deathChance, resolveFallen } from '../assets/scripts/core/roster';
import { dayStart, loadConfig, T0 } from './helpers';

function newGame() {
    return CampGame.newGame(loadConfig(), T0, 7);
}

describe('招人的松紧', () => {
    it('前期照常；之后空床位多照常来人、只剩一两张打折、占满就不再来人', () => {
        const game = newGame();
        const { config, state } = game;
        const r = config.balance.recruit!;
        const later = dayStart(r.earlyDays + 2);
        const wait = (n: number) => (state.candidates = Array.from({ length: n }, (_, i) => ({ id: i + 1 }) as never));
        // 床位多腾一些
        state.buildings.dorm.level = Math.max(state.buildings.dorm.level, 6);
        const free = bedCount(config, state) - state.survivors.length;
        expect(free).toBeGreaterThanOrEqual(r.catchUp + 1);
        expect(recruitScale(config, state, dayStart(r.earlyDays))).toBe(1);
        expect(recruitScale(config, state, later)).toBe(1);
        // 门口等着的人也占床位
        wait(free - 1);
        expect(recruitScale(config, state, later)).toBe(r.lateScale);
        wait(free);
        expect(recruitScale(config, state, later)).toBe(0);
        // 前期床位满了也照样有人来
        expect(recruitScale(config, state, dayStart(1))).toBe(1);
    });
});

describe('战斗失败会死人', () => {
    it('守夜失守时倒下的人按完整的牺牲概率算（守住时才按 raidDeathScale 打折）', () => {
        const game = newGame();
        const { config, state } = game;
        const at = dayStart(config.balance.deathGraceDays + 2);
        const full = deathChance(config, state, at);
        expect(full).toBeGreaterThan(0);
        // 同样的人倒下 200 次：完整概率下死的人明显比打折时多
        let dieFull = 0;
        let dieScaled = 0;
        for (let i = 0; i < 200; i++) {
            const a = newGame();
            const b = newGame();
            a.state.rngState = b.state.rngState = 1000 + i;
            dieFull += resolveFallen(a.config, a.state, ['martha'], at, '测试', true, undefined, 1).dead.length;
            dieScaled += resolveFallen(b.config, b.state, ['martha'], at, '测试', true, undefined, config.balance.raidDeathScale ?? 1).dead.length;
        }
        expect(dieFull).toBeGreaterThan(dieScaled * 2);
        expect(dieFull / 200).toBeCloseTo(full, 1);
    });
});
