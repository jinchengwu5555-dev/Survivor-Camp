import { describe, expect, it } from 'vitest';
import { validateConfig } from '../assets/scripts/core/validate';
import { loadConfig } from './helpers';

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
