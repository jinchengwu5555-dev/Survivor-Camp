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
import { GameConfig } from '../assets/scripts/core/types';
import { KeyValueStorage } from '../assets/scripts/core/save';

/** 每次返回一份深拷贝，测试之间互不影响 */
export function loadConfig(): GameConfig {
    return JSON.parse(JSON.stringify({ balance, resources, buildings, survivors, events, episodes, locations, raids, seasons, items, bounties, achievements, units, skills, statuses })) as GameConfig;
}

export const T0 = 1_700_000_000_000;
export const MIN = 60_000;

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
