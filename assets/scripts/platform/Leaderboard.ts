// 排行榜：
//   好友榜：wx.setUserCloudStorage 写入成绩，开放数据域（build-templates/wechatgame/openDataContext）读好友数据并画出来。
//   全服榜：微信云开发的云函数 build-templates/wechatgame/cloudfunctions/leaderboard，服务器按真实时间校验天数，防止改存档刷榜。
// CLOUD_ENV_ID 填云开发环境 ID（开发者工具 → 云开发 → 设置里能看到）；没填或者不在微信里运行时用调试实现（只在本机记录）。

import { GlobalRanking, ScoreEntry } from '../core/leaderboard';

declare const wx: any;

export const CLOUD_ENV_ID = '';
const FRIEND_KEY = 'survival';

export interface LeaderboardService {
    /** 上报成绩；返回服务器认可的最长天数（调试实现直接返回本地的） */
    submit(entry: ScoreEntry): Promise<number>;
    /** 全服排行 */
    globalTop(): Promise<GlobalRanking>;
    /** 通知开放数据域刷新好友榜；返回 false 表示当前环境没有好友榜 */
    showFriends(): boolean;
}

class DebugLeaderboard implements LeaderboardService {
    private best = 0;

    submit(entry: ScoreEntry): Promise<number> {
        this.best = Math.max(this.best, entry.bestDays);
        return Promise.resolve(this.best);
    }

    globalTop(): Promise<GlobalRanking> {
        return Promise.resolve({ list: [{ name: '我（调试）', bestDays: this.best, me: true }], me: { bestDays: this.best, rank: 1 } });
    }

    showFriends(): boolean {
        return false;
    }
}

class WxLeaderboard implements LeaderboardService {
    constructor(env: string) {
        wx.cloud.init({ env, traceUser: true });
    }

    submit(entry: ScoreEntry): Promise<number> {
        wx.setUserCloudStorage({
            KVDataList: [
                {
                    key: FRIEND_KEY,
                    value: JSON.stringify({ wxgame: { score: entry.bestDays, update_time: Math.floor(Date.now() / 1000) }, days: entry.days }),
                },
            ],
            fail: () => {},
        });
        return this.call({ action: 'submit', runId: entry.runId, days: entry.days }).then((r: { bestDays?: number }) =>
            Math.max(entry.bestDays, r?.bestDays ?? 0),
        );
    }

    globalTop(): Promise<GlobalRanking> {
        return this.call({ action: 'top' }).then((r: GlobalRanking) => ({ list: r?.list ?? [], me: r?.me ?? null }));
    }

    showFriends(): boolean {
        wx.getOpenDataContext().postMessage({ type: 'showFriends' });
        return true;
    }

    private call(data: object): Promise<any> {
        return wx.cloud.callFunction({ name: 'leaderboard', data }).then((res: { result: any }) => res.result);
    }
}

export function createLeaderboard(): LeaderboardService {
    if (typeof wx !== 'undefined' && wx.cloud && CLOUD_ENV_ID) return new WxLeaderboard(CLOUD_ENV_ID);
    return new DebugLeaderboard();
}
