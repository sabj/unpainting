// Set-like cell membership with O(1) clear and separate generations per owner.
// Iteration retains insertion order for backwards-compatible aware checkpoints.
export class EpochCells {
  constructor(capacity = 0, values = []) {
    this.stamps = new Uint32Array(capacity);
    this.members = new Uint32Array(capacity);
    this.epoch = 1; this.size = 0;
    for (const i of values) this.add(i);
  }
  reserve(capacity) {
    if (capacity <= this.stamps.length) return;
    const stamps = new Uint32Array(capacity), members = new Uint32Array(capacity);
    stamps.set(this.stamps); members.set(this.members.subarray(0, this.size));
    this.stamps = stamps; this.members = members;
  }
  has(i) { return this.stamps[i] === this.epoch; }
  add(i) {
    if (!Number.isInteger(i) || i < 0) throw RangeError('Invalid contact cell');
    if (i >= this.stamps.length) this.reserve(Math.max(i + 1, this.stamps.length * 2, 16));
    if (!this.has(i)) { this.stamps[i] = this.epoch; this.members[this.size++] = i; }
    return this;
  }
  clear() {
    this.size = 0; this.epoch = (this.epoch + 1) >>> 0;
    if (!this.epoch) { this.stamps.fill(0); this.epoch = 1; }
  }
  *[Symbol.iterator]() { for (let j = 0; j < this.size; j++) yield this.members[j]; }
}
