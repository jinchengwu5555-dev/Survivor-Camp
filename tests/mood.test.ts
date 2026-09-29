import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { buildingLabel, buildingStage, nextBuildingStage } from '../assets/scripts/core/buildings';
import { getBuildingDef, productionPerMinute } from '../assets/scripts/core/economy';
import { changeMood, moodTier } from '../assets/scripts/core/mood';
import { killSurvivor } from '../assets/scripts/core/roster';
import { planWatch } from '../assets/scripts/core/watch';
import { dayStart, loadConfig, T0 } from './helpers';

function newGame() {
    const game = CampGame.newGame(loadConfig(), T0, 42);
    game.state.eventQueue = [];
    game.state.nextRandomEventAt = Number.MAX_SAFE_INTEGER;
    game.state.nextRaidAt = Number.MAX_SAFE_INTEGER;
    return game;
}

describe('心情系统', () => {
    it('分五档，低落干活变慢，崩溃不干活也不守夜', () => {
        const game = newGame();
        const { config, state } = game;
        expect(moodTier(90).name).toBe('开心');
        expect(moodTier(5).name).toBe('崩溃');
        for (const s of state.survivors) game.assign(s.id, null, T0);
        state.survivors.forEach((s) => (s.mood = 50));
        game.assign('martha', 'kitchen', T0);
        const normal = productionPerMinute(config, state).food;
        const martha = state.survivors.find((s) => s.id === 'martha')!;
        martha.mood = 20;
        // 平均心情（士气）也跟着变，只比较个人档位的影响
        const morale = (m: number) => 0.75 + m / 200;
        const avg = state.survivors.reduce((n, s) => n + s.mood, 0) / state.survivors.length;
        expect(productionPerMinute(config, state).food).toBeCloseTo((normal / morale(50)) * morale(avg) * 0.85);
        martha.mood = 5;
        expect(productionPerMinute(config, state).food).toBe(0);
        game.setWatch('martha', 'always', T0);
        expect(planWatch(config, state)).not.toContain('martha');
    });

    it('心情变化会记下原因，同一个原因连着发生会合并', () => {
        const game = newGame();
        const { state } = game;
        const s = state.survivors[0];
        s.mood = 50;
        changeMood(state, s, -5, '守夜太累', T0);
        changeMood(state, s, -5, '守夜太累', T0);
        changeMood(state, s, 8, '事件：星空', T0);
        expect(s.moodNotes).toEqual([
            { at: T0, text: '守夜太累', amount: -10 },
            { at: T0, text: '事件：星空', amount: 8 },
        ]);
    });

    it('事件改心情时记在事件名下；有人牺牲大家都难过', () => {
        const game = newGame();
        const { config, state } = game;
        state.survivors.forEach((s) => (s.mood = 50));
        state.eventQueue = ['food_split'];
        game.choose(0, T0);
        expect(state.survivors[0].moodNotes?.[0].text).toBe('事件：不够分的晚饭');
        killSurvivor(config, state, 'toby', dayStart(10), '牺牲了');
        expect(state.survivors[0].moodNotes?.some((n) => n.text === '失去了托比')).toBe(true);
    });
});

describe('设施升级阶段', () => {
    it('厨房从篝火开始，升级变成烤架、厨房；栅栏升级变成围墙', () => {
        const config = loadConfig();
        const kitchen = getBuildingDef(config, 'kitchen')!;
        expect(buildingStage(kitchen, 1).name).toBe('篝火');
        expect(buildingStage(kitchen, 3).name).toBe('烤架');
        expect(buildingStage(kitchen, 7).name).toBe('厨房');
        expect(nextBuildingStage(kitchen, 1)?.name).toBe('烤架');
        const wall = getBuildingDef(config, 'wall')!;
        expect(buildingLabel(wall, 1)).toContain('木栅栏');
        expect(buildingStage(wall, 20).name).toContain('围墙');
    });

    it('升到新阶段时日志里写出变化', () => {
        const game = newGame();
        const { state } = game;
        state.buildings.kitchen.level = 2;
        state.buildings.kitchen.upgradeEndsAt = T0;
        game.tick(T0 + 1000);
        expect(state.log.some((l) => l.text.includes('烤架'))).toBe(true);
    });
});
