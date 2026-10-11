// Passage progress is measured at completed boundaries, never by wall time.
// Keep drawing/material stages for galleries and the first wash for the process map.
export function framePolicy({ video = false, keepAll = false } = {}) {
  const all = Boolean(video || keepAll), goals = [0.1, 0.25, 0.5, 0.75, 1];
  let next = 0, firstWash = false, last = null;
  return {
    all,
    keep(stage) {
      if (all) return true;
      const key = JSON.stringify(stage);
      if (key === last) return false;
      if (stage.stage === 'paint') {
        if (stage.laying || !stage.of) return false;
        const progress = stage.pass / stage.of;
        const crossed = next < goals.length && progress >= goals[next];
        if (firstWash && !crossed) return false;
        while (next < goals.length && progress >= goals[next]) next++;
        firstWash = true;
      }
      last = key;
      return true;
    },
  };
}
