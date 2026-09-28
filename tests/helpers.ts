import balance from '../assets/resources/config/balance.json';
import resources from '../assets/resources/config/resources.json';
import buildings from '../assets/resources/config/buildings.json';
import survivors from '../assets/resources/config/survivors.json';
import events from '../assets/resources/config/events.json';
import episodes from '../assets/resources/config/episodes.json';
import units from '../assets/resources/config/units.json';
import skills from '../assets/resources/config/skills.json';
import statuses from '../assets/resources/config/statuses.json';
import locations from '../assets/resources/config/locations.json';
import raids from '../assets/resources/config/raids.json';
import seasons from '../assets/resources/config/seasons.json';
import items from '../assets/resources/config/items.json';
import bounties from '../assets/resources/config/bounties.json';
import achievements from '../assets/resources/config/achievements.json';
import sites from '../assets/resources/config/sites.json';
import wanderers from '../assets/resources/config/wanderers.json';
import pickups from '../assets/resources/config/pickups.json';
import daily from '../assets/resources/config/daily.json';
import trader from '../assets/resources/config/trader.json';
import { GameConfig } from '../assets/scripts/core/types';
import { expandConfig } from '../assets/scripts/core/configExpand';
import { KeyValueStorage } from '../assets/scripts/core/save';

/** 还没展开成长公式的原始配置（深拷贝） */
export function loadRawConfig(): GameConfig {
    return JSON.parse(
        JSON.stringify({ balance, resources, buildings, survivors, events, episodes, locations, raids, seasons, items, bounties, achievements, sites, wanderers, pickups, daily, trader, units, skills, statuses }),
    ) as GameConfig;
}

/** 每次返回一份深拷贝，测试之间互不影响；和游戏启动时一样，先展开建筑的成长公式 */
export function loadConfig(): GameConfig {
    return expandConfig(loadRawConfig());
}

export const T0 = 1_700_000_000_000;
export const MIN = 60_000;
export const HOUR = 60 * MIN;
/** 游戏里的一天（毫秒），跟着 balance.json 走 */
export const DAY = balance.dayLengthMinutes * MIN;
/** 尸潮间隔（毫秒） */
export const RAID = balance.raidIntervalMinutes * MIN;
/** 随机事件间隔（毫秒） */
export const EVENT = balance.eventIntervalMinutes * MIN;
/** 伤员自然痊愈时间（毫秒） */
export const INJURY = balance.injuryRecoveryMinutes * MIN;
/** 第 n 天（从 1 开始）的开头 */
export const dayStart = (n: number) => T0 + (n - 1) * DAY;

export class MemoryStorage implements KeyValueStorage {
    private data = new Map<string, string>();
    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
    removeItem(key: string): void {
        this.data.delete(key);
    }
}
