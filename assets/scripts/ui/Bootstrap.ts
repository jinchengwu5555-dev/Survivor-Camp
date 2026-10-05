// 自动启动：场景里没有挂 GameRoot（新克隆的仓库、场景没提交、Canvas 被删了）时，
// 运行游戏的时候自动建一个 Canvas + 2D 相机，把 GameRoot 挂上去。
// 这样就算打开的是一个空场景，点预览也能直接进游戏，不会是一片灰屏。
// 只在运行时生效（EDITOR 下不动场景）；场景里已经有 GameRoot 就什么都不做。

import { Camera, Canvas, Color, director, Director, Layers, Node, UITransform, view } from 'cc';
import { EDITOR } from 'cc/env';
import { GameRoot } from './GameRoot';

/** 场景里有没有 GameRoot */
function hasGameRoot(node: Node): boolean {
    if (node.getComponent(GameRoot)) return true;
    return node.children.some((c) => hasGameRoot(c));
}

export function ensureGameRoot(): void {
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
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, ensureGameRoot);
    // 脚本加载时场景可能已经启动了
    if (director.getScene()) setTimeout(ensureGameRoot, 0);
}
