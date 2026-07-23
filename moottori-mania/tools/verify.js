const fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(process.env.MM_HTML||path.join(__dirname,'..','index.html'),'utf8');
let src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
src+=';globalThis.__exp={game,DEMOS};';
const ctxObj={ console, Math, alert:()=>{} }; ctxObj.globalThis=ctxObj;
vm.createContext(ctxObj); vm.runInContext(src,ctxObj);
const {game,DEMOS}=ctxObj.__exp;
let ok=0;
for(let i=0;i<10;i++){
  game.load(i);
  const d=DEMOS[i];
  for(let f=0;f<d.length && game.state==='play';f++){
    const c=d.charCodeAt(f)-48;
    if(c&16) game.flip();
    game.stepFrame({gas:!!(c&1),brake:!!(c&2),voltL:!!(c&4),voltR:!!(c&8)});
  }
  const fin=game.state==='finish';
  if(fin)ok++;
  console.log(`K${i+1} ${game.level.name}: ${fin?'TOISTUU ✓ '+game.simT.toFixed(1)+'s':'EPÄONNISTUI ('+game.state+')'} omenat ${game.got}/${game.level.apples.length}`);
}
console.log(ok+'/10');
process.exit(ok===10 ? 0 : 1);
