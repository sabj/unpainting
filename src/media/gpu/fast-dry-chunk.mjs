export function fastDryChunk(value=50){const n=Number(value);if(n!==50&&n!==200)throw new RangeError('Fast dry chunk must be50 (original) or200 (opt-in)');return n;}
