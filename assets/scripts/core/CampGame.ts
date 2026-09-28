// 游戏总入口：界面层只和这个类打交道。

import { ActionResult, GameConfig, GameEventDef, GameState } from './types';
import { advanceEconomy } from './economy';
import { assignSurvivor, completeUpgrades, finishUpgradeNow, startUpgrade } from './buildings';
import { ChoiceResult, getEventDef, maybeTriggerRandomEvent, resolveChoice } from './events';
import { checkEpisode, startStory } from './story';
import { createNewState } from './state';

export class CampGame {
    constructor(readonly config: GameConfig, public state: GameState) {}

    static newGame(config: GameConfig, now: number, seed = Date.now()): CampGame {
        const game = new CampGame(config, createNewState(config, now, seed));
        startStory(config, game.state);
        return game;
    }

    /**
     * 推进时间到 now。离线回来时第一次调用会一次性结算离线收益（最多 offlineCapHours 小时）。
     * 生产按段结算：在每个升级完成的时间点切开，保证升级后的产量从完成那一刻开始计算。
     */
    tick(now: number): void {
        const s = this.state;
        if (now <= s.lastTickAt) return;
        const capMs = this.config.balance.offlineCapHours * 3_600_000;
        let t = Math.max(s.lastTickAt, now - capMs);

        const finishTimes = Object.values(s.buildings)
            .map((b) => b.upgradeEndsAt)
            .filter((at): at is number => at !== null && at > t && at <= now)
            .sort((a, b) => a - b);
        for (const at of [...finishTimes, now]) {
            advanceEconomy(this.config, s, (at - t) / 60_000);
            completeUpgrades(this.config, s, at);
            t = at;
        }

        s.lastTickAt = now;
        checkEpisode(this.config, s, now);
        maybeTriggerRandomEvent(this.config, s, now);
    }

    upgrade(buildingId: string, now: number): ActionResult {
        this.tick(now);
        return startUpgrade(this.config, this.state, buildingId, now);
    }

    /** 看完激励视频后调用 */
    speedUpUpgrade(buildingId: string, now: number): ActionResult {
        this.tick(now);
        const result = finishUpgradeNow(this.config, this.state, buildingId, now);
        if (result.ok) checkEpisode(this.config, this.state, now);
        return result;
    }

    assign(survivorId: string, buildingId: string | null, now: number): ActionResult {
        this.tick(now);
        return assignSurvivor(this.config, this.state, survivorId, buildingId);
    }

    get currentEvent(): GameEventDef | undefined {
        const id = this.state.eventQueue[0];
        return id ? getEventDef(this.config, id) : undefined;
    }

    choose(choiceIndex: number, now: number): ChoiceResult {
        this.tick(now);
        const result = resolveChoice(this.config, this.state, choiceIndex, now);
        if (result.ok) checkEpisode(this.config, this.state, now);
        return result;
    }
}
