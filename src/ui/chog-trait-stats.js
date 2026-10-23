// Counts are a complete snapshot of the 1,969 mainnet Genesis metadata files.
export function withTraitCounts(attributes,snapshot){
  if(snapshot?.metadataCount!==1969||snapshot?.supply!==1969)throw new Error('Incomplete Genesis trait snapshot.');
  return attributes.map(attribute=>{
    const count=snapshot.counts?.[String(attribute.trait_type)]?.[String(attribute.value)];
    return {...attribute,count:Number.isInteger(count)?count:null,percent:Number.isInteger(count)?Math.round(count/snapshot.supply*100):null};
  });
}
