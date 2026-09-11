// Offsets and shake use marble-radius units; rotation is in radians.
// Pure poses make pause, restoration and low-frame-rate playback deterministic.
const clamp = (value, min=0, max=1) => Math.max(min, Math.min(max, value));
const stable = () => ({ x:0, y:0, scale:1, rotation:0, shadow:1, opacity:1, impact:0, shakeX:0, shakeY:0 });

export function zumaSkullIntroPose(time, { reducedMotion=false }={}) {
  if(!Number.isFinite(time)||time>=1.8)return stable();
  const t=Math.max(0,time),pose=stable();
  if(reducedMotion){
    if(t>=.45)return pose;
    const progress=clamp(t/.45),remaining=(1-progress)**2;
    return {...pose,y:-.35*remaining,opacity:.65+.35*progress,shadow:1-.15*remaining};
  }
  if(t<1.05){
    const p=t/1.05,remaining=1-p;
    // Gravity-like descent accelerates into the landing; lateral drift and spin
    // ease out so the face arrives upright, instead of abruptly snapping there.
    pose.x=-3*remaining**2;
    pose.y=-13*(1-p*p);
    pose.scale=1+.8*remaining**2;
    pose.rotation=-Math.PI*2*remaining**2;
    pose.shadow=.12+.88*p*p;
    return pose;
  }
  const landed=t-1.05;
  if(t>=1.6)return pose;
  if(landed<.35){
    const p=landed/.35;
    pose.y=-.8*Math.sin(Math.PI*p)*(1-p)||0;
    pose.scale=1-.12*Math.exp(-12*p)*Math.cos(Math.PI*2*p)*(1-p);
    pose.shadow=1-.13*Math.sin(Math.PI*p)*(1-p);
  }
  // The envelope extends after contact to give a ring/dust time to dissipate.
  pose.impact=(1-clamp(landed/.55))**2;
  const shake=(1-clamp(landed/.3))**2;
  pose.shakeX=.09*Math.sin(landed*95)*shake||0;
  pose.shakeY=.13*Math.cos(landed*80)*shake||0;
  return pose;
}
