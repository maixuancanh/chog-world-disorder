import snapshot from '../../assets/chog-simulation-colliders.json' with {type:'json'};
// Generated from the exact normal prop definitions and deterministic placements.
// Build-time source fingerprint checks must pass before shipping this snapshot.
export function simulationColliders(layoutId,mode){
 const entries=snapshot.layouts[layoutId];if(snapshot.version!==1||!entries||!['hunt','boss','control','trials'].includes(mode))throw Error('No verified simulation collider snapshot for '+layoutId+'/'+mode);
 // Level is allowed to annotate its own boxes, so every world gets fresh values.
 return entries.filter(entry=>entry.modes.includes(mode)).flatMap(entry=>entry.colliders.map(box=>structuredClone(box)));
}
