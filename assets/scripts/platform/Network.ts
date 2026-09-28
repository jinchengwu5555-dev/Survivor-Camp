// 联网检查：游戏需要联网（排行榜要上报成绩）。断网时界面暂停，恢复后继续。
// 不在微信里运行（编辑器预览）时用 navigator.onLine。

declare const wx: any;

export interface NetworkService {
    /** 当前是否联网 */
    check(): Promise<boolean>;
    /** 网络状态变化时回调 */
    onChange(cb: (online: boolean) => void): void;
}

class WxNetwork implements NetworkService {
    check(): Promise<boolean> {
        return new Promise((resolve) => {
            wx.getNetworkType({
                success: (res: { networkType: string }) => resolve(res.networkType !== 'none'),
                fail: () => resolve(false),
            });
        });
    }

    onChange(cb: (online: boolean) => void): void {
        wx.onNetworkStatusChange((res: { isConnected: boolean }) => cb(res.isConnected));
    }
}

class BrowserNetwork implements NetworkService {
    check(): Promise<boolean> {
        return Promise.resolve(typeof navigator === 'undefined' || navigator.onLine !== false);
    }

    onChange(cb: (online: boolean) => void): void {
        if (typeof window === 'undefined') return;
        window.addEventListener('online', () => cb(true));
        window.addEventListener('offline', () => cb(false));
    }
}

export function createNetworkService(): NetworkService {
    return typeof wx !== 'undefined' ? new WxNetwork() : new BrowserNetwork();
}
