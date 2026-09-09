// Keep saveSchema 1 readable by older classic-only snake plugins.
export function arenaProgress(snapshot,joystick='floating') {
  const player=snapshot.snakes[0];
  return {snake:[{x:10,y:10},{x:9,y:10},{x:8,y:10}],dir:{x:1,y:0},next:{x:1,y:0},food:{x:15,y:10},
    score:Math.round(player.length),controlMode:'swipe',controlsHidden:true,
    arena:snapshot,joystick:joystick==='fixed'?'fixed':'floating',
    details:{fruits:player.eaten,eliminations:player.kills,maxLength:Math.round(player.best),arenaSeconds:Math.round(snapshot.ticks/60),mode:snapshot.mode}};
}
