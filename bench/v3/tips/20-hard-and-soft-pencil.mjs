// A hard grade against a soft one: HB and 2B, each at half and at full pressure.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const hard = kit.createPencil({ grade: 'HB' }), soft = kit.createPencil({ grade: '2B' });
const line = (y, p) => [{ x: 40, y, p }, { x: 160, y: y - 8, p }, { x: W - 40, y, p }];
kit.pencilStroke(hard, sheet, line(40, 0.5)); kit.pencilStroke(soft, sheet, line(75, 0.5));   // half pressure: HB, then 2B
kit.pencilStroke(hard, sheet, line(125, 1));  kit.pencilStroke(soft, sheet, line(160, 1));    // full pressure: HB, then 2B
await kit.finish('hard and soft pencil');
