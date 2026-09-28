// 离线挂机收益：离线时营地“停在原地”，不吃饭、不守夜、不死人，只按当前工人的产量发一小笔物资。

import { GameConfig, GameState, ResourceBag } from './types';
import { grantResources, productionPerMinute } from './economy';
import { addLog, addStat } from './state';
import { formatBag } from './combat';

/** 离线 offlineMs 毫秒（真实时间）能拿多少物资（还没按仓库上限截断） */
export function offlineRewardPreview(config: GameConfig, state: GameState, offlineMs: number): ResourceBag {
    const o = config.balance.offline;
    const realMinutes = Math.min(offlineMs / 60_000, o.capHours * 60);
    if (realMinutes < o.minMinutes) return {};
    const gameMinutes = realMinutes * o.gameMinutesPerRealMinute;
    const rates = productionPerMinute(config, state);
    const bag: ResourceBag = {};
    for (const id of o.resources) {
        const amount = Math.floor(rates[id] * gameMinutes);
        if (amount > 0) bag[id] = amount;
    }
    return bag;
}

/** 发放离线收益，返回实际到手的数量；没有收益时返回 null */
export function grantOfflineReward(config: GameConfig, state: GameState, offlineMs: number, now: number): ResourceBag | null {
    if (state.gameOver) return null;
    const gained = grantResources(config, state, offlineRewardPreview(config, state, offlineMs));
    if (Object.keys(gained).length === 0) return null;
    const hours = Math.min(offlineMs / 3_600_000, config.balance.offline.capHours);
    addStat(state, 'offline_rewards');
    addLog(state, now, `离线 ${hours.toFixed(1)} 小时，留守的人攒下了 ${formatBag(config, gained)}`);
    return gained;
}
