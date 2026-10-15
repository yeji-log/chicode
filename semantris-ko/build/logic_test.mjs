import fs from 'fs';
const D = JSON.parse(fs.readFileSync('dist/game.json','utf8'));
const SIM = new Uint8Array(fs.readFileSync('dist/sim.bin'));
if (SIM.length !== D.rows*D.cols) throw new Error('size mismatch');
const clueIndex = new Map(D.clues.map((c,i)=>[c,i]));
const sim = (row,t)=>SIM[row*D.cols+t];
const MATCH_MIN=130, P1=215, P2=248;

const PARTICLES=["으로서","으로써","이라고","이라는","에서는","에게는","한테는","으로는","라고","라는",
 "에서","에게","한테","께서","보다","처럼","마다","조차","밖에","이나","부터","까지","으로","이란",
 "라도","이야","은","는","이","가","을","를","의","에","와","과","도","만","로","나","란","야","께"];
function resolve(raw){
  const w=raw.trim().replace(/\s+/g,''); if(!w) return null;
  if(clueIndex.has(w)) return {word:w,row:clueIndex.get(w)};
  const s=D.surface[w]; if(s&&clueIndex.has(s)) return {word:s,row:clueIndex.get(s)};
  for(const p of PARTICLES) if(w.length-p.length>=2&&w.endsWith(p)){
    const b=w.slice(0,-p.length); if(clueIndex.has(b)) return {word:b,row:clueIndex.get(b)};
  }
  for(const e of ["어요","아요","습니다","하다","다"]) if(w.endsWith(e)){
    const st=w.slice(0,-e.length);
    for(const c of [st+"다",st]) if(c.length>=2&&clueIndex.has(c)) return {word:c,row:clueIndex.get(c)};
  }
  return null;
}
console.log('--- 입력 해석 (조사/활용 처리) ---');
for(const q of ['모래','모래가','파도를','등산은','뜨거워요','무서워하다','야옹','건반','월드컵','ㅁㄴㅇ','해변에서','까마귀처럼']){
  const r=resolve(q);
  console.log(`  "${q}" -> ${r?r.word:'(없음)'}`);
}

const ti=new Map(D.targets.map((t,i)=>[t,i]));
function guessArcade(row, tiles){
  let bi=-1,bs=-1;
  tiles.forEach((t,i)=>{const s=sim(row,t.id); if(s>bs){bs=s;bi=i;}});
  if(bi<0||bs<MATCH_MIN) return null;
  const extra = bs>=P2?2 : bs>=P1?1 : 0;
  const g=[bi];
  for(const i of [bi-1,bi+1,bi-2,bi+2]){
    if(g.length>=1+extra) break;
    if(i>=0&&i<tiles.length&&!g.includes(i)) g.push(i);
  }
  g.sort((a,b)=>a-b);
  const depth=g.reduce((a,i)=>a+(tiles.length-i),0)/g.length;
  return {words:g.map(i=>tiles[i].word), gain:Math.round((60+depth*8)*g.length), strength:bs};
}
console.log('\n--- 아케이드 보드 판정 ---');
const board=['해변','피아노','고양이','축구','커피','병원','겨울','비행기','김치','바다'].map(w=>({word:w,id:ti.get(w)}));
console.log('  보드:', board.map(b=>b.word).join(' / '));
for(const q of ['모래','건반','야옹','카페인','월드컵','주사','파도','눈사람','배추','활주로','바보','사랑','컴퓨터','ㅋㅋㅋ']){
  const r=resolve(q); if(!r){console.log(`  ${q.padEnd(6)} -> 어휘 없음`);continue;}
  const o=guessArcade(r.row,board);
  console.log(`  ${q.padEnd(6)} -> ${o?o.words.join('+')+`  (강도 ${o.strength}, +${o.gain})`:'매칭 없음'}`);
}
console.log('\n--- 정확도별 동시 제거 수 ---');
const samples=[['야옹','고양이'],['카페인','커피'],['모래','해변'],['눈사람','겨울'],['주사','병원'],['활주로','비행기'],['배추','김치'],['건반','피아노']];
const b2=['해변','피아노','고양이','축구','커피','병원','겨울','비행기','김치','바다'].map(w=>({word:w,id:ti.get(w)}));
for(const [q] of samples){
  const r=resolve(q); const o=guessArcade(r.row,b2);
  const pct=Math.round(o.strength/255*100);
  console.log(`  ${q.padEnd(6)} 정확도 ${String(pct).padStart(3)}% -> ${String(o.words.length)}개 제거  (${o.words.join(' + ')})  +${o.gain}`);
}
