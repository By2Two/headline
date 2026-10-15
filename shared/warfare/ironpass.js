const mound = (positionX, positionZ, centerX, centerZ, rotationX, rotationZ = rotationX) =>
  Math.exp(-(((positionX - centerX) / rotationX) ** 2 + ((positionZ - centerZ) / rotationZ) ** 2));
const mesa = (positionX, positionZ, centerX, centerZ, rotationX, rotationZ, steps = 12) => {
  const depth = Math.hypot((positionX - centerX) / rotationX, (positionZ - centerZ) / rotationZ);
  return 1 / (1 + Math.exp((depth - 1) * steps));
};
export function ironHeight(positionX, positionZ, noise, half) {
  let height = 48 + 18 * noise(positionX / 480 + 31, positionZ / 480 - 9, 4, 211);
  height += 3 * (noise(positionX / 85, positionZ / 85, 3, 233) - 0.5);
  height += 80 * mesa(positionX, positionZ, -740, -60, 230, 440, 4);
  height += 70 * mesa(positionX, positionZ, 670, -200, 270, 280, 7);
  height += 24 * mesa(positionX, positionZ, 345, -85, 170, 180, 4);
  height += 20 * mesa(positionX, positionZ, -520, -430, 200, 165, 4);
  height += 70 * mound(positionX, positionZ, -830, 710, 190, 260);
  height += 55 * mound(positionX, positionZ, 820, -780, 220, 180);
  height += 25 * mound(positionX, positionZ, -235, -320, 155);
  height -= 35 * mound(positionX, positionZ, -235, -320, 88);
  const gorgeX = 65 + 100 * Math.sin(positionZ / 350);
  height -= 29 * Math.exp(-(((positionX - gorgeX) / 100) ** 2));
  height -= 9 * mound(positionX, positionZ, -370, 0, 200, 120);
  const edge = Math.max(Math.abs(positionX), Math.abs(positionZ));
  if (edge > half - 110) {
    height += 100 * ((edge - half + 110) / 110) ** 2;
  }
  return height;
}

export function buildIronLandmarks({
  boxes,
  lots,
  props,
  heightAt,
  box,
  house,
  warehouse,
  container,
  cylinder,
  bunker,
  guardTower,
  commTower,
  lineOf,
  structureBoxes,
  sectors,
  random,
}) {
  const add = (lot) => lot && lots.push(lot);
  const solid = (positionX, positionZ, width, depth, height, material = 'concrete', extra = {}) => {
    const positionY = heightAt(positionX, positionZ);
    boxes.push(
      box(
        positionX - width / 2,
        positionY - 1,
        positionZ - depth / 2,
        positionX + width / 2,
        positionY + height,
        positionZ + depth / 2,
        material,
        extra,
      ),
    );
    lots.push({ x: positionX, z: positionZ, w: width, d: depth });
  };
  for (const sector of sectors) {
    const { x: positionX, z: positionZ } = sector;
    if (sector.id === 'A') {
      add(house(boxes, positionX + 27, positionZ - 20, 0, 14, 18, 2, 'stone', false, random));
      for (const deltaX of [-48, 48]) {
        for (const deltaZ of [-44, 44]) {
          add(
            guardTower(boxes, positionX + deltaX, positionZ + deltaZ, deltaX < 0 ? 1 : 3, 'stone'),
          );
        }
      }
      lineOf(
        boxes,
        positionX - 56,
        positionZ - 50,
        positionX + 56,
        positionZ - 50,
        'stone',
        3.8,
        1.2,
        [[positionX - 18, positionX + 18]],
      );
      lineOf(
        boxes,
        positionX - 56,
        positionZ + 50,
        positionX + 56,
        positionZ + 50,
        'stone',
        2.4,
        1.2,
        [[positionX - 18, positionX + 18]],
      );
      lineOf(
        boxes,
        positionX - 56,
        positionZ - 50,
        positionX - 56,
        positionZ + 50,
        'stone',
        2.4,
        1.2,
        [[positionZ - 14, positionZ + 14]],
      );
      lineOf(
        boxes,
        positionX + 56,
        positionZ - 50,
        positionX + 56,
        positionZ + 50,
        'stone',
        3.1,
        1.2,
        [[positionZ - 14, positionZ + 14]],
      );
      add(bunker(boxes, positionX - 24, positionZ + 18, 2));
      for (const [deltaX, deltaZ] of [
        [-20, -20],
        [-12, -22],
        [18, 27],
        [26, 31],
      ]) {
        solid(positionX + deltaX, positionZ + deltaZ, 5, 3, 1.3, 'stone');
      }
    } else if (sector.id === 'F') {
      add(warehouse(boxes, positionX - 38, positionZ + 27, 1, 24, 14, 8, 'metal'));
      for (let steps = 0; steps < 5; steps++) {
        add(container(boxes, positionX + 25 + steps * 7, positionZ + 35, 0, 1, steps));
      }
      for (const [deltaX, deltaZ] of [
        [-32, -30],
        [32, -35],
        [50, 12],
      ]) {
        solid(positionX + deltaX, positionZ + deltaZ, 12, 8, 2.6, 'rock', { shape: 'rock' });
      }
      for (const deltaX of [-32, 32]) {
        solid(positionX + deltaX, positionZ - 28, 5, 5, 14, 'concrete');
      }
      const positionY = Math.max(
        heightAt(positionX - 32, positionZ - 28),
        heightAt(positionX + 32, positionZ - 28),
      );
      boxes.push(
        box(
          positionX - 35,
          positionY + 11,
          positionZ - 30,
          positionX + 35,
          positionY + 13,
          positionZ - 26,
          'metal',
        ),
      );
      add(guardTower(boxes, positionX + 48, positionZ + 48, 2, 'steel'));
    } else if (sector.id === 'B') {
      for (let row = 0; row < 3; row++) {
        for (let color = 0; color < 5; color++) {
          if (color === 2) {
            continue;
          }
          add(
            container(
              boxes,
              positionX - 44 + color * 22,
              positionZ - 35 + row * 28,
              row % 2,
              1 + ((row + color) % 2),
              (row + color) % 4,
            ),
          );
        }
      }
      add(warehouse(boxes, positionX + 64, positionZ + 14, 1, 30, 18, 9, 'metal'));
      add(house(boxes, positionX - 60, positionZ + 24, 1, 10, 9, 2, 'brick', false, random));
    } else if (sector.id === 'D') {
      add(bunker(boxes, positionX - 48, positionZ - 26, 1));
      add(bunker(boxes, positionX + 48, positionZ + 26, 3));
      add(warehouse(boxes, positionX - 60, positionZ + 40, 0, 18, 12, 6, 'concrete'));
      add(house(boxes, positionX + 56, positionZ - 38, 2, 10, 8, 2, 'brick', false, random));
      for (const [deltaX, deltaZ] of [
        [-38, 35],
        [38, -30],
        [-58, -40],
        [58, 40],
      ]) {
        boxes.push(
          ...structureBoxes(
            'sandbags',
            positionX + deltaX,
            heightAt(positionX + deltaX, positionZ + deltaZ),
            positionZ + deltaZ,
            deltaX < 0 ? 1 : 3,
          ),
        );
      }
    } else if (sector.id === 'C') {
      commTower(boxes, positionX + 24, positionZ - 18, 54);
      lots.push({ x: positionX + 24, z: positionZ - 18, w: 8, d: 8 });
      add(warehouse(boxes, positionX - 28, positionZ - 23, 0, 20, 12, 6, 'concrete'));
      add(bunker(boxes, positionX - 24, positionZ + 28, 2));
      add(bunker(boxes, positionX + 35, positionZ + 28, 2));
      lineOf(
        boxes,
        positionX - 45,
        positionZ - 46,
        positionX + 45,
        positionZ - 46,
        'concrete',
        2.0,
        0.8,
        [[positionX - 8, positionX + 8]],
      );
      for (const deltaX of [-15, 0, 15]) {
        boxes.push(
          ...structureBoxes(
            'sandbags',
            positionX + deltaX,
            heightAt(positionX + deltaX, positionZ + 42),
            positionZ + 42,
            0,
          ),
        );
      }
    } else if (sector.id === 'E') {
      for (let steps = 0; steps < 4; steps++) {
        add(
          cylinder(
            boxes,
            positionX - 38 + steps * 24,
            positionZ - 28,
            7,
            12 + (steps % 2) * 5,
            'tank',
          ),
        );
      }
      add(cylinder(boxes, positionX + 52, positionZ + 32, 3.5, 32, 'brick'));
      add(warehouse(boxes, positionX - 26, positionZ + 34, 0, 28, 16, 8, 'metal'));
      for (let steps = 0; steps < 4; steps++) {
        add(container(boxes, positionX + 20 + steps * 8, positionZ + 44, 1, 1, steps));
      }
      lineOf(
        boxes,
        positionX - 58,
        positionZ - 48,
        positionX + 58,
        positionZ - 48,
        'fence',
        2.0,
        0.12,
        [[positionX - 12, positionX + 12]],
      );
    } else if (sector.id === 'G') {
      add(warehouse(boxes, positionX - 38, positionZ - 28, 0, 22, 14, 6, 'concrete'));
      add(house(boxes, positionX + 35, positionZ - 25, 2, 14, 10, 2, 'concrete', false, random));
      add(guardTower(boxes, positionX - 52, positionZ + 38, 2, 'steel'));
      add(guardTower(boxes, positionX + 52, positionZ + 38, 2, 'steel'));
      for (const deltaZ of [-52, 52]) {
        lineOf(
          boxes,
          positionX - 64,
          positionZ + deltaZ,
          positionX + 64,
          positionZ + deltaZ,
          'hesco',
          2.2,
          1.1,
          [[positionX - 16, positionX + 16]],
        );
      }
      for (const deltaX of [-34, 34]) {
        add(bunker(boxes, positionX + deltaX, positionZ + 22, 2));
      }
    }
    props.push({
      kind: 'landmark',
      id: sector.id,
      x: positionX,
      y: heightAt(positionX, positionZ),
      z: positionZ,
    });
  }
}
