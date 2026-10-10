// Optional startup metadata on its own channel, separate from error/note bytes.
export function writeAdapterEvidence(buffer,evidence){if(!buffer)return false;const bytes=new TextEncoder().encode(JSON.stringify(evidence));buffer.fill(0);if(bytes.length>=buffer.length)return false;buffer.set(bytes);return true;}
export function readAdapterEvidence(buffer){if(!buffer)return null;const end=buffer.indexOf(0);try{return JSON.parse(new TextDecoder().decode(buffer.subarray(0,end<0?buffer.length:end)));}catch{return null;}}
