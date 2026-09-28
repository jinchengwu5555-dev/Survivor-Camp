// 事件卡上的立绘：谁在说话。还没有美术时，界面用角色颜色画一个圆形头像，中间写名字的第一个字。

import { battleRegistry } from './combat';
import { survivorInfo } from './roster';
import { GameConfig, GameEventDef, GameState } from './types';

export interface Portrait {
    id: string;
    name: string;
    title: string;
    /** 头像底色（来自战斗角色的 appearance.color） */
    color: string;
    /** 以后有美术时用的图片名 */
    sprite: string;
}

const NARRATOR: Portrait = { id: 'narrator', name: '营地', title: '', color: '#5a5f55', sprite: 'narrator' };

export function portraitOf(config: GameConfig, state: GameState, id: string): Portrait | null {
    const info = survivorInfo(config, state, id);
    if (!info) return null;
    const reg = battleRegistry(config);
    const unit = info.battleUnit && reg.hasUnit(info.battleUnit) ? reg.unit(info.battleUnit) : null;
    return { id, name: info.name, title: info.title, color: unit?.appearance.color ?? '#6a6a6a', sprite: `portrait_${id}` };
}

/**
 * 事件的说话人：优先用事件里写的 speaker；没写就找正文里第一个提到的营地成员（或配置里的角色）；
 * 都没有就是“营地”旁白。
 */
export function eventSpeaker(config: GameConfig, state: GameState, ev: GameEventDef): Portrait {
    if (ev.speaker) return portraitOf(config, state, ev.speaker) ?? NARRATOR;
    const candidates = [...state.survivors.map((s) => s.id), ...config.survivors.map((s) => s.id)];
    let best: { id: string; pos: number } | null = null;
    for (const id of candidates) {
        const name = survivorInfo(config, state, id)?.name;
        const pos = name ? ev.text.indexOf(name) : -1;
        if (pos >= 0 && (!best || pos < best.pos)) best = { id, pos };
    }
    return (best && portraitOf(config, state, best.id)) || NARRATOR;
}
