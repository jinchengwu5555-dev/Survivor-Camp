// 季节循环（夏 → 秋 → 冬 → 春 → 夏……），按营地存活天数计算。
// 季节影响食物产量、腐烂速度，冬天还要烧木材取暖。

import { queueEvent } from './events';
import { addLog, addStat, currentDay } from './state';
import { GameConfig, GameState, SeasonDef } from './types';

function cycleDays(config: GameConfig): number {
    return config.seasons.reduce((sum, s) => sum + s.days, 0);
}

/** now 这一刻的季节，以及在这个季节里是第几天（从 1 开始） */
export function seasonAt(config: GameConfig, state: GameState, now: number): { season: SeasonDef; dayInSeason: number } {
    const total = cycleDays(config);
    let day = (currentDay(config, state, now) - 1) % total;
    for (const season of config.seasons) {
        if (day < season.days) return { season, dayInSeason: day + 1 };
        day -= season.days;
    }
    return { season: config.seasons[0], dayInSeason: 1 };
}

/** 换季时写日志、触发季节事件；熬过冬天记一次统计 */
export function checkSeasonChange(config: GameConfig, state: GameState, now: number): void {
    const { season } = seasonAt(config, state, now);
    if (season.id === state.seasonId) return;
    const previous = state.seasonId;
    state.seasonId = season.id;
    if (previous === 'winter') addStat(state, 'winters_survived');
    addLog(state, now, `${season.icon}${season.name}天到了。${season.description}`);
    if (season.startEvent) queueEvent(state, season.startEvent);
}
