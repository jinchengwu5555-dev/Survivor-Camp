import { describe, expect, it } from 'vitest';
import { validateConfig } from '../assets/scripts/core/validate';
import { expandConfig, niceRound } from '../assets/scripts/core/configExpand';
import { loadConfig, loadRawConfig } from './helpers';

describe('配置表', () => {
    it('当前配置没有错误', () => {
        expect(validateConfig(loadConfig())).toEqual([]);
    });

    it('能发现引用了不存在的幸存者和事件', () => {
        const config = loadConfig();
        config.events[0].choices[0].outcomes[0].effects.push({ type: 'addSurvivor', survivor: 'nobody' });
        config.episodes[0].startEvent = 'missing_event';
        const errors = validateConfig(config);
        expect(errors.some((e) => e.includes('nobody'))).toBe(true);
        expect(errors.some((e) => e.includes('missing_event'))).toBe(true);
    });
});

describe('建筑成长公式', () => {
    it('按公式展开到最高等级：花费、时间、产量逐级增长，其他建筑不能超过指挥部', () => {
        const config = loadConfig();
        const kitchen = config.buildings.find((b) => b.id === 'kitchen')!;
        expect(kitchen.levels).toHaveLength(kitchen.scaling!.maxLevel);
        const lv10 = kitchen.levels[9];
        expect(lv10.requiresHq).toBe(10);
        expect(lv10.cost.wood).toBe(niceRound(120 * Math.pow(1.5, 7)));
        expect(lv10.production!.food).toBeCloseTo(2.0 * Math.pow(1.1, 7), 1);
        expect(lv10.workerSlots).toBe(4 + Math.floor(7 / 3));
    });

    it('重复展开不会重复生成', () => {
        const config = loadConfig();
        const before = config.buildings.map((b) => b.levels.length);
        expandConfig(config);
        expect(config.buildings.map((b) => b.levels.length)).toEqual(before);
    });

    it('niceRound 保留两位有效数字', () => {
        expect([7, 99, 123, 1234, 56789].map(niceRound)).toEqual([7, 99, 120, 1200, 57000]);
    });

    it('仓库跟不上升级花费时会报“卡死”', () => {
        const raw = loadRawConfig();
        raw.buildings.find((b) => b.id === 'hq')!.scaling!.storageGrowth = 1.3;
        const errors = validateConfig(expandConfig(raw));
        expect(errors.some((e) => e.includes('会卡死'))).toBe(true);
    });
});
