// 自动启动：场景里没有挂 GameRoot（新克隆的仓库、场景没提交、Canvas 被删了）时，
// 运行游戏的时候自动建一个 Canvas + 2D 相机，把 GameRoot 挂上去。
// 这样就算打开的是一个空场景，点预览也能直接进游戏，不会是一片灰屏。
// 只在运行时生效（EDITOR 下不动场景）；场景里已经有 GameRoot 就什么都不做。
//
// 竖屏适配也在这里用代码设好，不依赖“项目设置”里的设计分辨率（新项目默认是横屏 1280×720，界面会缩成一小块）：
//   设计分辨率 720×1280；屏幕比 9:16 更细长（全面屏手机）就适配宽度、上下多出来的地方留空，
//   比 9:16 更宽（iPad、电脑）就适配高度、左右留空。界面始终完整显示。

import { Camera, Canvas, Color, director, Director, Layers, Node, ResolutionPolicy, UITransform, view } from 'cc';
import { EDITOR } from 'cc/env';
import { GameRoot } from './GameRoot';

/** 场景里有没有 GameRoot */
function hasGameRoot(node: Node): boolean {
    if (node.getComponent(GameRoot)) return true;
    return node.children.some((c) => hasGameRoot(c));
}

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/** 按屏幕比例设好竖屏的设计分辨率 */
export function applyPortraitResolution(): void {
    const frame = view.getFrameSize();
    const tall = frame.width > 0 && frame.height / frame.width >= DESIGN_HEIGHT / DESIGN_WIDTH;
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, tall ? ResolutionPolicy.FIXED_WIDTH : ResolutionPolicy.FIXED_HEIGHT);
}

export function ensureGameRoot(): void {
    applyPortraitResolution();
    const scene = director.getScene();
    if (!scene || hasGameRoot(scene)) return;
    const size = view.getVisibleSize();

    const canvasNode = new Node('Canvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    scene.addChild(canvasNode);
    canvasNode.addComponent(UITransform).setContentSize(size.width, size.height);
    const canvas = canvasNode.addComponent(Canvas);

    const cameraNode = new Node('Camera');
    cameraNode.layer = Layers.Enum.UI_2D;
    canvasNode.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = size.height / 2;
    camera.visibility = Layers.Enum.UI_2D;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(28, 32, 30, 255);
    camera.priority = 100;
    canvas.cameraComponent = camera;

    canvasNode.addComponent(GameRoot);
    console.log('[末日营地] 场景里没有 GameRoot，已自动创建 Canvas 并启动游戏。');
}

if (!EDITOR) {
    try {
        applyPortraitResolution();
        // 浏览器窗口大小变了、预览里换了机型：重新适配
        view.setResizeCallback(applyPortraitResolution);
    } catch (e) {
        console.warn('设置竖屏分辨率失败', e);
    }
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, ensureGameRoot);
    // 脚本加载时场景可能已经启动了
    if (director.getScene()) setTimeout(ensureGameRoot, 0);
}
