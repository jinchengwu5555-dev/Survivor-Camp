import { describe, expect, it } from 'vitest';
import { CampGame } from '../assets/scripts/core/CampGame';
import { rowOf, weaponRange } from '../assets/scripts/core/formation';
import { craftableGear } from '../assets/scripts/core/gear';
import { loadConfig, T0 } from './helpers';

describe('新武器：砍刀、长矛、弩、自制土枪', () => {
    it('都能在工坊打造；长矛够得远但还站前排，弩和土枪站后排', () => {
        const config = loadConfig();
        const ids = craftableGear(config).map((p) => p.id);
        for (const id of ['machete', 'spear', 'crossbow', 'pipe_gun']) expect(ids).toContain(id);
        const game = CampGame.newGame(config, T0, 1);
        const s = game.state.survivors[1];
        const rowWith = (weapon: string) => {
            s.gear = { weapon };
            return { row: rowOf(config, game.state, s.id), range: weaponRange(config, game.state, s.id) };
        };
        expect(rowWith('spear')).toEqual({ row: 'front', range: 1.8 });
        expect(rowWith('crossbow').row).toBe('back');
        expect(rowWith('pipe_gun').row).toBe('back');
        expect(rowWith('machete')).toEqual({ row: 'front', range: 0 });
    });
});
