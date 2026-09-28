import { describe, expect, it } from 'vitest';
import { acceptScore } from '../build-templates/wechatgame/cloudfunctions/leaderboard/rules';
import cloudConfig from '../build-templates/wechatgame/cloudfunctions/leaderboard/config.json';
import { CampGame } from '../assets/scripts/core/CampGame';
import { scoreEntry } from '../assets/scripts/core/leaderboard';
import { emptyRecords } from '../assets/scripts/core/records';
import { DAY, loadConfig, MIN, T0 } from './helpers';

const config = loadConfig();
/** 在线玩一天最快需要的真实时间 */
const REAL_DAY = (config.balance.dayLengthMinutes * MIN) / config.balance.clock.onlineTimeScale;

describe('排行榜', () => {
    it('云函数的时间参数和 balance.json 一致（改了时钟要同步改 build-templates/wechatgame/cloudfunctions/leaderboard/config.json）', () => {
        expect(cloudConfig.dayLengthMinutes).toBe(config.balance.dayLengthMinutes);
        expect(cloudConfig.onlineTimeScale).toBe(config.balance.clock.onlineTimeScale);
    });

    it('上报这一局的天数和历史最长', () => {
        const game = CampGame.newGame(loadConfig(), T0, 1);
        const records = { ...emptyRecords(), bestDays: 30 };
        expect(scoreEntry(game.config, game.state, records, T0 + 5 * DAY)).toEqual({ runId: T0, days: 6, bestDays: 30 });
        game.state.gameOver = { at: T0, day: 40, cause: '测试' };
        expect(scoreEntry(game.config, game.state, records, T0 + 5 * DAY).bestDays).toBe(40);
    });

    it('正常在线玩的天数全部认可', () => {
        let rec = acceptScore(null, { runId: 1, days: 1 }, 0, cloudConfig);
        rec = acceptScore(rec, { runId: 1, days: 11 }, 10 * REAL_DAY, cloudConfig);
        expect(rec).toMatchObject({ runDays: 11, bestDays: 11, clamped: false });
    });

    it('改存档刷天数会被截到真实时间最多能玩出来的天数', () => {
        let rec = acceptScore(null, { runId: 1, days: 1 }, 0, cloudConfig);
        rec = acceptScore(rec, { runId: 1, days: 500 }, 10 * REAL_DAY, cloudConfig);
        expect(rec.clamped).toBe(true);
        expect(rec.runDays).toBe(Math.floor(10 * cloudConfig.tolerance) + cloudConfig.graceDays);
        const fresh = acceptScore(rec, { runId: 2, days: 300 }, 20 * REAL_DAY, cloudConfig);
        expect(fresh.runDays).toBe(cloudConfig.graceDays);
        expect(fresh.bestDays).toBe(rec.bestDays);
    });

    it('天数不会倒退，最长纪录跨局保留', () => {
        let rec = acceptScore(null, { runId: 1, days: 1 }, 0, cloudConfig);
        rec = acceptScore(rec, { runId: 1, days: 8 }, 10 * REAL_DAY, cloudConfig);
        rec = acceptScore(rec, { runId: 1, days: 3 }, 11 * REAL_DAY, cloudConfig);
        expect(rec.runDays).toBe(8);
        rec = acceptScore(rec, { runId: 2, days: 1 }, 12 * REAL_DAY, cloudConfig);
        expect(rec).toMatchObject({ runDays: 1, bestDays: 8 });
    });
});
