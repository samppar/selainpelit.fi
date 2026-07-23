/* Moottori-Mania -testibotti. Ajaa kentät ilman ihmistä ja nauhoittaa demot.
   Ks. CLAUDE.md: botin säännöt ja niiden perustelut. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const HTML=process.env.MM_HTML||path.join(__dirname,'..','index.html');
const html=fs.readFileSync(HTML,'utf8');
let src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
src+=';globalThis.__exp={game,LEVELS_PX};';
const ctxObj={ console, Math, alert:()=>{} };
ctxObj.globalThis=ctxObj; vm.createContext(ctxObj); vm.runInContext(src,ctxObj);
const {game,LEVELS_PX}=ctxObj.__exp;
const angDeg=b=>Math.atan2(b.w4.y-b.w2.y,b.w4.x-b.w2.x)*57.3;

// maanpinnan korkeus kohdassa x (ylin reuna lähellä nykyistä y:tä)
function groundY(polys,x,nearY){
  let best=null;
  for(const p of polys) for(let i=0;i<p.length;i++){
    const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length];
    if((x1<=x&&x2>=x)||(x2<=x&&x1>=x)){
      if(Math.abs(x2-x1)<1e-9)continue;
      const t=(x-x1)/(x2-x1), y=y1+t*(y2-y1);
      if(y<=nearY+1 && (best===null||y>best)) best=y;
    }
  }
  return best;
}

function botRun(lvl,maxSec){
  game.deaths=0; game.load(lvl);
  let prevA=0,f=0,af=0,stuck=0,backUntil=-1,airT=0,settleUntil=-1,lastAirVy=0,voltCd=0; let rec=[]; const deathSpots=[];
  for(f=0; f<maxSec*60; f++){
    if(game.state==='dead'){
      deathSpots.push((game.bike.body.x*34)|0+':'+game.level.apples.map(a=>a.taken?1:0).join(''));
      game.load(lvl); prevA=0; stuck=0; backUntil=-1; settleUntil=-1; airT=0; lastAirVy=0; af=0; voltCd=0; rec=[];
    }
    if(game.state==='finish') break;
    const b=game.bike, a=angDeg(b), av=a-prevA; prevA=a;
    const grounded=b.w2c||b.w4c;
    if(!grounded) lastAirVy=b.body.vy;
    if(grounded && airT>6 && lastAirVy<-8) settleUntil=af+18;  // kova alastulo: rauhoitu
    airT = grounded?0:airT+1;
    // jumissa seinän juurella? peruuta ja ota vauhtia
    if(grounded && Math.abs(b.body.vx)<0.8) stuck++; else stuck=Math.max(0,stuck-1);
    if(stuck>80){ backUntil=af+150; stuck=0; }
    let backing=af<backUntil;
    if(backing){ // älä peruuta jyrkänteeltä
      const gB=groundY(game.level.polys,b.body.x-4*b.dir,b.body.y+2);
      const gH0=groundY(game.level.polys,b.body.x,b.body.y);
      if(gB===null||(gH0!==null&&gB<gH0-4)){ backUntil=af; backing=false; }
    }
    const missing=game.level.apples.filter(ap=>!ap.taken);
    const tgt=missing.length
      ? missing.reduce((m,ap)=>Math.abs(ap.x-b.body.x)<Math.abs(m.x-b.body.x)?ap:m)
      : game.level.flowers[0];
    let want=Math.sign(tgt.x-b.body.x)||1;
    if(backing) want=-want;
    let didFlip=false;
    if(want!==b.dir && grounded && Math.abs(b.body.vx)<2){ game.flip(); didFlip=true; }
    else if(want!==b.dir && grounded && b.body.vx*want>4 && Math.abs(a)<25){ game.flip(); didFlip=true; } // selkä edellä
    const v=Math.hypot(b.body.vx,b.body.vy);
    // SEINÄTUTKA: tiheä pyyhkäisy 2-16 yks eteen, näyte / yksikkö
    const gHere=groundY(game.level.polys,b.body.x,b.body.y);
    let wallDist=null;
    {
      const gs=[];
      for(let d=0;d<=16;d++) gs[d]=groundY(game.level.polys,b.body.x+d*b.dir,b.body.y+18);
      for(let d=2;d<=14;d++){
        if(gs[d]!==null&&gs[d+2]!==null&&(gs[d+2]-gs[d])>3.5&&gHere!==null&&gs[d+2]>gHere+3){ wallDist=d; break; }
      }
    }
    const steepNear = wallDist!==null&&wallDist<=4;
    // KATTOTUTKA: matalin vapaa korkeus 0-14 yks edessä (katto vs. maa SAMASSA kohdassa)
    let ceilClear=99;
    for(let d=0;d<=14;d+=2){
      const cx=b.body.x+d*b.dir;
      const ys=[];
      for(const pl of game.level.polys) for(let i2=0;i2<pl.length;i2++){
        const [x1,y1]=pl[i2],[x2,y2]=pl[(i2+1)%pl.length];
        if((x1<=cx&&x2>=cx)||(x2<=cx&&x1>=cx)){
          if(Math.abs(x2-x1)<1e-9)continue;
          const t=(cx-x1)/(x2-x1); ys.push(y1+t*(y2-y1));
        }
      }
      // ajopinta = korkein reuna joka on pyörän tasolla tai alla; katto = ensimmäinen sen yllä
      let surf=null, ceil=null;
      for(const y of ys){ if(y<=b.body.y+0.5 && (surf===null||y>surf)) surf=y; }
      if(surf!==null) for(const y of ys){ if(y>surf+0.5 && (ceil===null||y<ceil)) ceil=y; }
      if(surf!==null && ceil!==null){ const c=ceil-surf; if(c<ceilClear) ceilClear=c; }
    }
    const g3=groundY(game.level.polys,b.body.x+3*b.dir,b.body.y+9);
    const gravNorm=game.grav.y===-1&&game.grav.x===0;
    const cliffAhead = grounded && gravNorm && (g3===null || (gHere!==null && g3<gHere-6)) && !(wallDist!==null && wallDist<12);
    const g7=groundY(game.level.polys,b.body.x+7*b.dir,b.body.y+9);
    const cliff7 = grounded && gravNorm && (g7===null || (gHere!==null && g7<gHere-6)) && !(wallDist!==null && wallDist<12);
    const steepFar  = wallDist!==null&&wallDist>4;
    const inp={gas:false,brake:false,voltL:false,voltR:false};
    if(cliff7 && Math.abs(a)<8 && v>21 && b.body.vx*b.dir>0 && (af%2)===0){
      inp.brake=true;   // tasamaan reuna liian lujaa: kevennä hyppyvauhtiin
    } else if(cliffAhead && v>6 && v<15 && b.body.vx*b.dir>0 && Math.abs(tgt.x-b.body.x)>8 && tgt.y > b.body.y-8){
      inp.brake=true;   // jyrkänne edessä eikä kohde ihan siinä: jarruta
    } else if(grounded && gravNorm && steepFar && !steepNear && v>21 && b.body.vx*b.dir>0){
      inp.brake=true;   // hidasta AIKAISIN pystyseinän edessä
    } else {
      const vCap = ceilClear<2.3?6 : ceilClear<3.9?11 : 44;  // matala katto: hiljaa
      inp.gas = b.dir===want && (a*b.dir)<75 && b.body.vx*b.dir<vCap &&
                !(steepFar && v>20);  // pystyseinälle sopiva vauhti ~20-21
      if(ceilClear<3.9 && v>vCap+3 && (b.dir>0?b.w2c:b.w4c)) inp.brake=true; // jarru vain takarenkaalla
      if(steepNear) inp.brake=false; // rullaa vapaana seinään kiinni
    }
    { // GLOBAALI LAKI: ei jarrua pelkän etupyörän varassa
      const rearNow = b.dir>0?b.w2c:b.w4c, frontNow = b.dir>0?b.w4c:b.w2c;
      if(inp.brake && !rearNow && frontNow) inp.brake=false;
      const slopeOk = gHere!==null && g3!==null && Math.abs(g3-gHere)<8;
      const slopeA = slopeOk ? Math.atan2((g3-gHere)*b.dir,3)*57.3 : 0;
      const rel=(a-slopeA)*b.dir; // asento suhteessa rinteeseen
      const wTh = slopeOk?40:75, nTh = slopeOk?60:85; // epäjatkuvuudessa väljät rajat
      if(grounded){
        if(rel>wTh && av*b.dir>1.2) inp.gas=false;             // wheelie-esto: kaasu pois
        if(a*b.dir>62 && av*b.dir>1.2) inp.gas=false;          // absoluuttinen katto (myös epäjatkuvuudessa)
        if(rel>nTh && av*b.dir>0){ if(b.dir>0)inp.voltR=true; else inp.voltL=true; } // hätänokka
        // etupyörä irti + nokka nousee => kiepsahdusvaara: nokka alas ajoissa
        if(!(b.dir>0?b.w4c:b.w2c) && rel>34 && av*b.dir>0.4){
          inp.gas=false; if(b.dir>0)inp.voltR=true; else inp.voltL=true; }
        if(a*b.dir>80 && av*b.dir>0){ if(b.dir>0)inp.voltR=true; else inp.voltL=true; }
        if(a*b.dir<-40 && av*b.dir<-0.8 && !(b.dir>0?b.w2c:b.w4c) && v>8 && voltCd<=0){ // etukeno-pelastus
          if(b.dir>0)inp.voltL=true; else inp.voltR=true; voltCd=10; }
      }
      if(!gravNorm && !(b.w2c&&b.w4c)) inp.gas=false; // flipissä ei kaasua irti maasta
    }
    const rearC = b.dir>0?b.w2c:b.w4c;
    if(want!==b.dir && b.body.vx*b.dir>2){ inp.brake = rearC; inp.gas=false; }
    if(!grounded && game.grav.y!==-1){ /* flipattu painovoima: ei voltteja */ }
    else if(!grounded && (airT>12||af<settleUntil) && Math.hypot(b.body.vx,b.body.vy)>6){
      // tähtää laskeutumispinnan kulmaan (missä ollaan ~0.4s päästä)
      const lx=b.body.x+b.body.vx*0.4;
      const gA=groundY(game.level.polys,lx-1.5,b.body.y+6);
      const gB2=groundY(game.level.polys,lx+1.5,b.body.y+6);
      let target=0;
      if(gA!==null&&gB2!==null) target=Math.atan2((gB2-gA)*b.dir,3)*57.3;
      if(b.body.vy<-9 && target>-8) target+=18;   // kova isku: takapyörä ensin (vain loivalle)
      target=Math.max(-35,Math.min(35,target));
      const err=(a*b.dir+av*b.dir*14)-target;
      const spin=av*b.dir;
      const nearG = gHere!==null && (b.body.y-gHere)<4.5 && b.body.vy<-3 && v<26;   // loppuflare tarkaksi
      const th=(airT<25||nearG)?26:45;
      const gate=airT>=25 && !nearG;
      if(voltCd>0) voltCd--;
      else if(airT<8 && Math.abs(b.body.vy)<6){} // mikropomput: ei ilmavoltteja
      else if(err>th && (!gate||spin>-3)){ inp.voltR=b.dir>0; inp.voltL=b.dir<0; if(gate)voltCd=4; }
      else if(err<-th && (!gate||spin<3)){ inp.voltL=b.dir>0; inp.voltR=b.dir<0; if(gate)voltCd=4; }
      inp.gas=false;
    } else if(!grounded){ inp.gas=false; }
    if(af<settleUntil && grounded){ inp.gas=false; }
    rec.push(String.fromCharCode(48+((inp.gas?1:0)|(inp.brake?2:0)|(inp.voltL?4:0)|(inp.voltR?8:0)|(didFlip?16:0))));
    af++;
    game.stepFrame(inp);
  }
  console.log('  loppu: x='+((game.bike.body.x*34)|0)+' y='+((-game.bike.body.y*34)|0)+' v='+Math.hypot(game.bike.body.vx,game.bike.body.vy).toFixed(1));
  return {nauha:rec.join(''), tila:game.state, aika:+game.simT.toFixed(1), kuolemat:game.deaths,
          omenat:game.got+'/'+game.level.apples.length,
          kuolinpaikat:deathSpots.slice(0,8)};
}
// --- CLI ---------------------------------------------------------------
// node tools/bot.js              kaikki kentät (regressio)
// node tools/bot.js 7            vain K8 (indeksi 7)
// node tools/bot.js 7 700        oma sekuntibudjetti
// node tools/bot.js --demo       kaikki kentät + DEMO-rivit stdoutiin
const argv=process.argv.slice(2);
const demo=argv.includes('--demo');
const nums=argv.filter(a=>/^\d+$/.test(a)).map(Number);
const BUDJETTI={7:700,8:700};                       // saaret ja painovoimaralli tarvitsevat enemmän
const lista = nums.length ? [[nums[0], nums[1]||BUDJETTI[nums[0]]||300]]
                          : [...Array(LEVELS_PX.length).keys()].map(i=>[i, BUDJETTI[i]||300]);
let laapi=0;
for(const [i,s] of lista){
  const r=botRun(i,s);
  if(r.tila==='finish') laapi++;
  console.log(`K${i+1} ${LEVELS_PX[i].name}: ${r.tila==='finish'?'LÄPI '+r.aika+'s':'EI ('+r.tila+')'} kuolemat=${r.kuolemat} omenat=${r.omenat} kuolinpaikat=${JSON.stringify(r.kuolinpaikat)}`);
  if(demo && r.tila==='finish') console.log('DEMO['+i+']="'+r.nauha+'"');
}
if(lista.length>1) console.log(`= ${laapi}/${lista.length} läpi`);
process.exit(laapi===lista.length ? 0 : 1);
