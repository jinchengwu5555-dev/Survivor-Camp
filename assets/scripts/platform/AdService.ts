// 激励视频广告。开通微信“流量主”并创建广告位后，把广告位 ID 填到 REWARDED_AD_UNIT_ID。
// 没填或者不在微信里运行（比如编辑器预览）时，使用调试实现：直接当作看完广告。

declare const wx: any;

export const REWARDED_AD_UNIT_ID = '';

export interface AdService {
    /** 播放激励视频；玩家完整看完返回 true */
    showRewarded(): Promise<boolean>;
}

class DebugAdService implements AdService {
    showRewarded(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

class WxAdService implements AdService {
    private readonly ad: any;

    constructor(adUnitId: string) {
        this.ad = wx.createRewardedVideoAd({ adUnitId });
        this.ad.onError(() => {});
    }

    showRewarded(): Promise<boolean> {
        return new Promise((resolve) => {
            const onClose = (res?: { isEnded?: boolean }) => {
                this.ad.offClose(onClose);
                // 基础库 2.1.0 以下 res 为 undefined，视为看完
                resolve(!res || !!res.isEnded);
            };
            this.ad.onClose(onClose);
            this.ad
                .show()
                .catch(() => this.ad.load().then(() => this.ad.show()))
                .catch(() => {
                    this.ad.offClose(onClose);
                    resolve(false);
                });
        });
    }
}

export function createAdService(): AdService {
    if (typeof wx !== 'undefined' && REWARDED_AD_UNIT_ID) return new WxAdService(REWARDED_AD_UNIT_ID);
    return new DebugAdService();
}
