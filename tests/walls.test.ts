import { describe, expect, it } from "vitest";
import { Battle } from "../assets/scripts/core/battle/Battle";
import { battleRegistry, raidSetup } from "../assets/scripts/core/combat";
import {
  buildingRect,
  campBounds,
  insideCamp,
} from "../assets/scripts/core/battle/geometry";
import { loadConfig } from "./helpers";
describe("守夜不穿墙", () => {
  it("人整个身子都在墙里、不进建筑；门没破时丧尸进不了围墙", () => {
    const config = loadConfig();
    const member = (id: string) => ({
      id,
      unit: config.survivors.find((d) => d.id === id)!.battleUnit!,
    });
    const defenders = ["derek", "ethan", "martha", "toby", "sophie"].map(
      member,
    );
    const buildings = [
      { x: -3, y: 2, w: 3, h: 2, icon: "a", name: "a" },
      { x: 2.5, y: -2, w: 3.5, h: 2.5, icon: "b", name: "b" },
      { x: 0, y: 3.5, w: 4, h: 2, icon: "c", name: "c" },
    ];
    const bad = { allyOut: 0, inBuilding: 0, zombieInWall: 0, steps: 0 };
    for (const raid of config.raids)
      for (let seed = 1; seed <= 2; seed++) {
        const setup = raidSetup(config, raid, defenders, 300, 2, seed, {
          camp: { rect: { x1: -6, x2: 6, y1: -6, y2: 6 }, buildings },
        });
        const b = new Battle(battleRegistry(config), setup);
        const camp = setup.camp!;
        const r = campBounds(camp);
        const rects = buildings.map((x) => buildingRect(x));
        while (b.result === "ongoing" && b.time < 300) {
          b.step();
          bad.steps++;
          for (const u of b.units) {
            if (!u.alive || u.def.faction === "structure") continue;
            if (
              u.side === "ally" &&
              (u.x < r.x1 + u.radius - 1e-6 ||
                u.x > r.x2 - u.radius + 1e-6 ||
                u.y < r.y1 + u.radius - 1e-6 ||
                u.y > r.y2 - u.radius + 1e-6)
            )
              bad.allyOut++;
            for (const q of rects)
              if (u.x > q.x1 && u.x < q.x2 && u.y > q.y1 && u.y < q.y2)
                bad.inBuilding++;
            if (
              u.side === "enemy" &&
              !u.ignoreStructures &&
              insideCamp(camp, u)
            ) {
              // 墙内的丧尸只能是从破了的门进来的
              const broken = camp.gates.some(
                (g, i) => b.gateUnit(i)?.alive === false,
              );
              if (!broken) bad.zombieInWall++;
            }
          }
        }
      }
    expect(bad).toMatchObject({ allyOut: 0, inBuilding: 0, zombieInWall: 0 });
  });
});
