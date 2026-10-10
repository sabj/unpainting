// Drier production load than the scrap calibration; pigment per load is unchanged.
export function productionWaterLoad(load, factor = 1, {authored = false} = {}) {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1) throw Error('productionwater must be in (0,1]');
  if (!Number.isFinite(load.water) || load.water < 0 || !load.conc.every(v => Number.isFinite(v) && v >= 0)) throw Error('invalid production water load');
  // Authored calibration and scene already own their declared finite water/concentration.
  if (factor === 1 || authored) return load;
  return {...load, water:load.water * factor, conc:load.conc.map(v => v / factor)};
}
