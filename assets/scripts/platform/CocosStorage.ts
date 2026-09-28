// 用 Cocos 的 sys.localStorage 存档；发布到微信后会自动走微信的本地存储。

import { sys } from 'cc';
import { KeyValueStorage } from '../core/save';

export class CocosStorage implements KeyValueStorage {
    getItem(key: string): string | null {
        return sys.localStorage.getItem(key);
    }
    setItem(key: string, value: string): void {
        sys.localStorage.setItem(key, value);
    }
    removeItem(key: string): void {
        sys.localStorage.removeItem(key);
    }
}
