export const HUNT_RULES=Object.freeze({players:6,rounds:5,duration:300,traits:4});
export function assertHuntLaunch(mode){
 if(!['hunt','boss','control','trials'].includes(mode))throw new Error('Choose a supported CHOG game mode.');
 // Local Hunt has its own rules; the legacy online relay stays disconnected.
 return true;
}

export function assertHuntIdentity(identity,{session,account,pending=false}={}){
 if(!identity||!['guest','wallet'].includes(identity.kind))throw Error('Connect your wallet or choose GUEST in Profile before playing.');
 if(pending)throw Error('Finish signing in before playing.');
 if(identity.kind==='wallet'&&(!session||account!==identity.address?.toLowerCase()))throw Error('Sign in with your wallet before playing.');
 return true;
}
