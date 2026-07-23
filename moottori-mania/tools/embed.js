/* Nauhoittaa demot botilla ja upottaa ne HTML:n DEMOS-vakioon.
   node tools/embed.js        (aja tämän jälkeen aina node tools/verify.js) */
const { execFileSync } = require('child_process');
const fs=require('fs'), path=require('path');
const HTML=process.env.MM_HTML||path.join(__dirname,'..','index.html');

const ulos=execFileSync(process.execPath,[path.join(__dirname,'bot.js'),'--demo'],{encoding:'utf8',maxBuffer:64*1024*1024});
const rivit=ulos.split('\n').filter(r=>r.startsWith('DEMO['));
if(!rivit.length){ console.error('Yhtään demoa ei syntynyt — botti ei päässyt maaliin.'); process.exit(1); }

const osat=rivit.map(r=>{
  const m=r.match(/^DEMO\[(\d+)\]="(.*)"$/);
  if(!m) throw new Error('outo rivi: '+r.slice(0,40));
  return `${m[1]}:"${m[2]}"`;
});
const demos='const DEMOS={'+osat.join(',')+'};';

const html=fs.readFileSync(HTML,'utf8');
if(!/const DEMOS=\{[\s\S]*?\};/.test(html)) throw new Error('DEMOS-vakiota ei löytynyt HTML:stä');
fs.writeFileSync(HTML, html.replace(/const DEMOS=\{[\s\S]*?\};/, () => demos));
console.log(`${osat.length} demoa upotettu (${demos.length} merkkiä). Aja seuraavaksi: node tools/verify.js`);
