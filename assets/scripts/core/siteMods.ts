// 当前营地地点的效果（只读，不依赖其他模块，经济、战斗都可以直接用）。

import { GameConfig, GameState, ResourceId, SiteDef, SiteModifiers } from './types';

export function getSite(config: GameConfig, id: string): SiteDef | undefined {
    return config.sites.find((s) => s.id === id);
}

export function currentSite(config: GameConfig, state: GameState): SiteDef | undefined {
    return getSite(config, state.siteId);
}

function mods(config: GameConfig, state: GameState): SiteModifiers {
    return currentSite(config, state)?.modifiers ?? {};
}

export const siteProduction = (config: GameConfig, state: GameState, id: ResourceId): number => mods(config, state).production?.[id] ?? 1;
export const sitePassive = (config: GameConfig, state: GameState, id: ResourceId): number => mods(config, state).passive?.[id] ?? 0;
export const siteSafety = (config: GameConfig, state: GameState): number => mods(config, state).safety ?? 1;
export const siteBeds = (config: GameConfig, state: GameState): number => mods(config, state).beds ?? 0;
export const siteSpoil = (config: GameConfig, state: GameState): number => mods(config, state).spoil ?? 1;
export const siteInjuryRecovery = (config: GameConfig, state: GameState): number => mods(config, state).injuryRecovery ?? 1;
export const siteDeathChance = (config: GameConfig, state: GameState): number => mods(config, state).deathChance ?? 1;
export const siteRaidLevel = (config: GameConfig, state: GameState): number => mods(config, state).raidLevel ?? 0;
export const siteBattleLevel = (config: GameConfig, state: GameState): number => mods(config, state).battleLevel ?? 0;
