// 图片加载：美术图放在 assets/resources/sprites/ 下（文件名见 docs/art-assets.md）。
// 有图就用图，没有图就继续用代码画的色块——缺图不会报错，做好一张换一张。
//
// 用 ImageAsset 加载再生成 SpriteFrame，不管 Cocos 里图片的导入类型是 texture 还是 sprite-frame 都能用。
// 美术是像素风：贴图一律用“最近邻”缩放（PIXEL_ART），放大显示时像素边缘保持锐利，不会糊成一片。

import { ImageAsset, Node, resources, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';

/** 像素风：放大缩小都不插值 */
export const PIXEL_ART = true;
import { makeNode } from './widgets';

/** null = 确认没有这张图；undefined = 还没查过 / 正在加载 */
const cache = new Map<string, SpriteFrame | null>();
const loading = new Set<string>();
/** 有新图加载完成时加一，界面可以据此决定要不要重画 */
export let spriteVersion = 0;

/**
 * 取一张图：已经加载好就返回 SpriteFrame；没有这张图返回 null；
 * 第一次调用会开始加载并返回 undefined（加载完成后下一次调用就能拿到）。
 * path 相对于 resources，不带扩展名，比如 'sprites/units/unit_ethan'
 */
export function getSprite(path: string): SpriteFrame | null | undefined {
    if (cache.has(path)) return cache.get(path);
    if (loading.has(path)) return undefined;
    // 资源包里没有这个文件：直接记成没有，不去加载（避免控制台一堆报错）
    if (!resources.getInfoWithPath(path, ImageAsset)) {
        cache.set(path, null);
        return null;
    }
    loading.add(path);
    resources.load(path, ImageAsset, (err, image) => {
        loading.delete(path);
        if (err || !image) {
            cache.set(path, null);
        } else {
            const frame = SpriteFrame.createWithImage(image);
            const tex = frame.texture;
            if (PIXEL_ART && tex instanceof Texture2D) {
                tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                tex.setMipFilter(Texture2D.Filter.NONE);
            }
            cache.set(path, frame);
        }
        spriteVersion++;
    });
    return undefined;
}

/** 提前加载一批图（进战斗前调用，减少第一帧没图的情况） */
export function preloadSprites(paths: string[]): void {
    for (const p of paths) getSprite(p);
}

/** 在 parent 下放一张图，按 width × height 显示（锚点在中心） */
export function addSprite(parent: Node, frame: SpriteFrame, width: number, height: number): Node {
    const node = makeNode('Sprite', parent, width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setContentSize(width, height);
    return node;
}

/** 按图片原始比例，算出放进 maxWidth × maxHeight 框里的大小 */
export function fitSize(frame: SpriteFrame, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const rect = frame.rect;
    const w = rect.width || 1;
    const h = rect.height || 1;
    const scale = Math.min(maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export const SPRITE_DIRS = {
    units: 'sprites/units/',
    portraits: 'sprites/portraits/',
    buildings: 'sprites/buildings/',
    bg: 'sprites/bg/',
};
