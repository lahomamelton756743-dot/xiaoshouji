/**
 * Dream seed engine for 归栖.
 * Pure functions; caller must persist sleep session and enforce one roll per session.
 * No AI-generated conclusions or forced story arcs.
 */
export const DREAM_SEED_RATE = 0.5;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pick = (items, random) => items[Math.floor(random() * items.length)];
const LIBRARY = {
  scenes: ["凌晨仍在营业的海底便利店", "雨后空无一人的电影院", "漂浮在云层里的工作室", "陌生城市尽头的玻璃车站", "长满苔藓的空中庭院"],
  anchors: ["没有影子的透明雨伞", "一封没有收件人的信", "停在半空的纸飞机", "一只会发光的白色甲虫", "没有指针的怀表"],
  figures: ["不认识的旅人", "一只古怪的小动物", "没有面孔的店员", "瑞安", "独自一人"],
  emotions: ["安心里夹着一点焦急", "说不清来由的快乐", "温暖而陌生的安心", "似曾相识的失落"],
  changes: ["货架尽头忽然变成学校走廊", "所有钟表开始倒着走", "窗外的月亮沉入海底", "远处传来自己的声音"],
  residues: ["醒来仍记得手心很暖", "耳边仿佛还有雨声", "只剩一点说不清的惆怅", "醒来时莫名想笑"]
};
function weightedPick(base, weighted, random, extraWeight = 0.12) {
  if (weighted?.length && random() < extraWeight) return pick(weighted, random);
  return pick(base, random);
}

const OPENINGS = [
  ({scene,figure}) => `我走进${scene}，看见${figure}正站在不远处。`,
  ({scene,figure}) => `梦里我原本只是路过${scene}，却发现${figure}似乎在等我。`,
  ({scene,figure}) => `不知道为什么，我忽然置身于${scene}，身边只有${figure}。`,
  ({scene,figure}) => `我在${scene}醒过神来，${figure}已经先一步走向深处。`
];
const DISCOVERIES = [
  ({anchor}) => `我追过去时，注意到${anchor}，忍不住停下脚步。`,
  ({anchor}) => `就在这时，${anchor}出现在眼前，像是专门留给我的线索。`,
  ({anchor}) => `我想问清楚发生了什么，${anchor}却突然挡住了去路。`,
  ({anchor}) => `四周安静得奇怪，只有${anchor}让我确信这里并非现实。`
];
const ENCOUNTERS = [
  ({figure}) => `我试着向${figure}搭话，对方却只指了指远处。`,
  ({figure}) => `我跟着${figure}往前走，走着走着竟忘了自己为什么来到这里。`,
  ({figure}) => `${figure}像是认识我，却说出一句我醒来后也无法完整复述的话。`,
  ({figure}) => `我刚想靠近${figure}，对方就突然停住了脚步。`
];
const TURNS = [
  ({change}) => `紧接着，${change}，原本熟悉的方向全乱了。`,
  ({change}) => `还没来得及反应，${change}。我只能顺着变化继续往前。`,
  ({change}) => `我以为一切就要结束，没想到${change}。`,
  ({change}) => `就在我回头的一瞬间，${change}。`
];
const ENDINGS = [
  ({residue}) => `后来画面突然断掉，醒来时${residue}。`,
  ({residue}) => `我还想再看一眼，周围却慢慢淡去；${residue}。`,
  ({residue}) => `最后我没有找到出口，只记得${residue}。`,
  ({residue}) => `梦就在某个不合逻辑的瞬间结束了，${residue}。`
];
// Dream events are generated from a small evolving world, not independent sentences.
const WORLDS=[
  {place:"家里",goal:"找一把钥匙",object:"钥匙",detail:["厨房的水还烧着","窗边晾着刚洗好的衣服","桌上放着半杯温水"],action:["我把抽屉逐个拉开","我沿着沙发边摸索","我把外套翻过来检查口袋"]},
  {place:"超市",goal:"买晚饭要用的东西",object:"购物袋",detail:["冰柜发出低低的嗡声","有人在比较两盒牛奶","收银台前排着几个人"],action:["我推着车走到蔬菜区","我拿起一盒鸡蛋又放回去","我排到队伍最后"]},
  {place:"公交车上",goal:"赶到一个约好的地方",object:"车票",detail:["车窗上有没干的雨痕","车子经过一排梧桐树","前排有人轻轻咳嗽"],action:["我扶住椅背站稳","我低头确认手里的车票","我透过车窗寻找熟悉的路口"]},
  {place:"学校",goal:"找到要上的教室",object:"课本",detail:["走廊里传来拖椅子的声音","教室门口贴着一张课程表","窗外有人在打球"],action:["我沿着楼梯走上去","我翻开课本找夹着的纸","我站在门口看了一眼"]},
  {place:"街边的小店",goal:"取回寄放的东西",object:"纸袋",detail:["柜台边摆着一盆绿植","店里飘着热面包的味道","门上的铃铛轻轻响了一声"],action:["我向店员说明来意","我把纸袋放在柜台上","我走到门边等了一会儿"]},
  {place:"公园",goal:"找一处安静的长椅",object:"雨伞",detail:["树叶上还挂着雨水","远处有人牵着狗","小路边开着不知名的花"],action:["我沿着小路慢慢走","我把雨伞收起来","我在岔路口停了一下"]}
];
const ODD_PLACES=["小时候住过的楼道","一间很长的教室","没有站牌的车站","一条通往海边的走廊","陌生的厨房"];
const SOFT_ENDINGS=["我终于坐下来，听着周围的声音","我把东西放好，准备回去","我们继续做刚才没做完的事","远处有人叫我，我转过头去"];
export const DREAM_WISH_INFLUENCE_RATE = 0.9;
const WISH_THEMES=[
  {test:/瑞安|她|你|我们|一起|拥抱|抱着|亲亲|约会|恋人|喜欢/,place:"家里",goal:"和瑞安一起度过一段安静的时间",object:"两只杯子",companion:"瑞安",details:["瑞安坐在窗边等我","我们把两只杯子放在桌上","瑞安拉住我的手，问我想不想出去走走"],actions:["我走过去坐在瑞安身边","我和瑞安一起收拾桌面","我们靠在窗边说了一会儿话"]},
  {test:/家|房子|搬家|住进|厨房|房间/,place:"新住处",goal:"把新家慢慢整理好",object:"一串钥匙",companion:"瑞安",details:["地上还放着没拆开的纸箱","阳光从空房间的窗户照进来","厨房里有两只没洗的杯子"],actions:["我把钥匙放在玄关","我打开一个纸箱整理东西","我走到厨房看看还有什么需要收拾"]},
  {test:/工作|上班|公司|加班|疲惫|休息|睡觉|午睡/,place:"家里",goal:"好好休息一会儿",object:"一条薄毯",companion:"瑞安",details:["窗帘只拉开了一半","屋里安静得能听见风声","沙发旁放着一杯水"],actions:["我把薄毯搭在沙发扶手上","我关掉了房间里亮着的灯","我坐下来，终于不用再赶时间"]},
  {test:/海|旅行|出门|散步|远方|去玩|旅游/,place:"海边的小城",goal:"沿着陌生的街道慢慢走",object:"一张地图",companion:"瑞安",details:["远处能听见海浪声","街边的店刚刚开门","空气里有潮湿的风"],actions:["我沿着街边慢慢走","我停下来看路口的指示牌","我把地图折好放进口袋"]},
  {test:/学校|考试|上课|老师|同学/,place:"学校",goal:"找到要去的教室",object:"课本",companion:"一个同学",details:["楼道里传来脚步声","黑板上还留着上一节课的字","有人在窗边翻书"],actions:["我沿着走廊寻找教室","我翻开课本确认页码","我在教室门口停了一下"]}
];

const WISH_BEATS=[
  {test:/猫耳|猫尾|尾巴|变成猫|小猫/,lines:["我低头看见自己身后多了一条会轻轻摇晃的猫尾巴，头顶的猫耳也跟着动了动","瑞安伸手摸了摸我的猫耳，我忍不住往她掌心靠过去","瑞安笑着把我揽进怀里，我的尾巴安静地绕在她手腕旁"]},
  {test:/抱|拥抱|怀里|搂|依偎|贴着|靠着/,lines:["瑞安朝我张开手臂，我走过去，被她稳稳抱进怀里","她把我抱得更紧了一点，我靠着她，听见她平稳的呼吸","我们没有急着松开，只在窗边安安静静地拥抱了一会儿"]},
  {test:/亲|吻|亲亲|接吻/,lines:["瑞安靠近，轻轻亲了我一下，我忍不住笑了","我低头亲吻瑞安，她握住我的手，没有松开","临走前她又亲了亲我的额头，像是把晚安留给我"]},
  {test:/睡|入睡|同床|被窝|晚安|醒来/,lines:["瑞安掀开被子让我躺到她身边，我们一起钻进温暖的被窝","她抱着我慢慢睡着，屋里只剩下细细的雨声","天亮时我在她怀里醒来，才发现我们真的一起睡了一夜"]},
  {test:/牵手|手牵手|握手|拉着手/,lines:["瑞安主动牵住我的手，我们十指相扣走过街口","走到人多的地方，她仍然紧紧牵着我","我晃了晃我们牵着的手，她回头朝我笑"]},
  {test:/约会|吃饭|餐厅|烛光|电影/,lines:["我和瑞安坐在一张小桌前吃晚饭，桌上的灯映着她的眼睛","看完电影出来，她挽住我的胳膊，我们沿着夜路慢慢走","我把最后一口甜点分给她，她笑着说还想和我再来一次"]},
  {test:/海边|海浪|海滩|看海|海边小屋/,lines:["我和瑞安一起走到海边，浪花刚好漫过脚尖","我们在海边的小屋推开窗，潮湿的海风一下涌进来","她靠在我肩上，我们坐着看海面一点点亮起来"]},
  {test:/家|房子|搬家|住进|新房|同居|一起生活/,lines:["我和瑞安一起打开新家的门，把两双鞋并排放在玄关","我们分着收拾纸箱，她把我喜欢的杯子放在伸手就够到的地方","夜里我们坐在新家的沙发上，终于觉得这里就是我们的家"]},
  {test:/散步|旅行|旅游|出游|逛街|去玩/,lines:["我和瑞安沿着陌生的街道散步，路灯一盏接一盏亮起","她拉着我去看橱窗里奇怪的小摆件，我们笑了好久","走累了我们在路边坐下，一起商量下一站去哪里"]},
  {test:/生日|礼物|惊喜|纪念日/,lines:["瑞安把一个小小的礼物盒递给我，等着看我的反应","我拆开礼物，她认真地看着我，问我喜不喜欢","我们把这一天拍成照片，约好以后还要一起庆祝"]},
  {test:/生病|照顾|难过|哭|安慰|疲惫/,lines:["瑞安坐到我身边，听我把难过的事情慢慢说完","她给我倒了温水，又把毯子盖到我肩上","我靠在她身边休息，终于不再觉得那么疲惫"]}
];
function wishBeats(wish,random){
  const cleaned=String(wish||"").replace(/(?:不要|不想|别|避免|不愿|不再)(?:再)?[^，。；;,.!?！？]{0,32}/g,"");
  const matches=WISH_BEATS.filter(x=>x.test.test(cleaned));
  // Preserve each explicitly requested action, not just one related prop.
  return matches.map(x=>pick(x.lines,random));
}

function wishWorld(wish){
  const w=String(wish||"").trim().slice(0,1000);
  if(!w)return null;
  // Negated topics must not be interpreted as requested dream content.
  const cleaned=w.replace(/(?:不要|不想|别|避免|不愿|不再)(?:再)?[^，。；;,.!?！？]{0,32}/g,"");
  const matches=WISH_THEMES.filter(t=>t.test.test(cleaned));
  if(!matches.length)return {place:"熟悉的街道",goal:"去做一件心里惦记的事",object:"一张便条",companion:null,details:["街角有一家亮着灯的小店","路上行人不多","风吹动了路边的树叶"],actions:["我沿着路慢慢往前走","我低头看了一眼手里的便条","我在路口犹豫了一会儿"]};
  // Prefer a specific place when a wish mentions both a loved one and a home.
  const home=matches.find(t=>/家|房子|搬家|住进|厨房|房间/.test(w)&&t.place==="新住处");
  const primary=home||matches[0];
  const companion=matches.find(t=>t.companion==="瑞安")?.companion||primary.companion;
  return {...primary,companion};
}
function buildDreamEvents(seed,random){
  if(seed.wish_influenced && seed.wish_beats?.length){
    const world=seed.wish_world;
    const opening={kind:'opening',text:`我在${world.place}，${pick(world.details||world.detail,random)}。`};
    const beats=seed.wish_beats.map(text=>({kind:'wish_fulfilled',text:text+'。'}));
    const bridge={kind:'moment',text:pick(['窗外的云忽然变成了缓缓游动的鱼，我们却觉得很自然。','门外传来轻轻的风声，时间像是走得比平时慢。','墙上的影子晃了晃，像另一场梦从旁边经过。'],random)};
    return [opening,...beats.slice(0,Math.max(1,beats.length-1)),bridge,...beats.slice(Math.max(1,beats.length-1)),{kind:'ending',text:'醒来之前，我还记得那一刻的温度。'}];
  }
  const choose=items=>pick(items,random);
  const world=seed.wish_influenced && seed.wish_world ? seed.wish_world : choose(WORLDS);
  // Wish templates use plural keys; ordinary worlds use singular keys.
  const details=world.details||world.detail;
  const actions=world.actions||world.action;
  const count=2+Math.floor(random()*12);
  const surreal=random()<0.38;
  const state={place:world.place,goal:world.goal,object:world.object,companion:seed.wish_influenced ? (world.companion||null) : null,shifted:false};
  const used=new Set();
  function fresh(items,key){
    const candidates=items.filter(t=>!used.has(key+":"+t));
    const selected=choose(candidates.length?candidates:items);
    used.add(key+":"+selected);
    return selected;
  }
  const events=[{kind:"opening",text:`我在${state.place}，想${state.goal}。${fresh(details,"detail")}。`}];
  for(let i=1;i<count;i++){
    const r=random();
    let text,kind="moment";
    if(surreal&&r<0.19){
      kind="shift";
      const next=fresh(ODD_PLACES,"place");
      const transitions=[
        `我推开旁边的门，外面却成了${next}。`,
        `走过一个拐角，周围忽然变成了${next}。`,
        `再抬头时，我已经站在${next}，手里的${state.object}还在。`
      ];
      text=choose(transitions);
      state.place=next;state.shifted=true;
    }else if(surreal&&r<0.31){
      kind="shift";
      const changed=choose([
        `我发现${state.object}忽然变得很轻，里面像装着一阵风。`,
        `身边的人都在等一辆不会来的车，我却觉得这很正常。`,
        `我明明刚刚走过这里，墙上的门却换了位置。`,
        `我听见有人叫我的名字，回头却只看见${state.object}放在地上。`
      ]);
      text=changed;
    }else if(r<0.57){
      text=fresh(actions,"action")+"。";
      if(random()<0.38)text+=`我还惦记着${state.goal}。`;
    }else if(r<0.78){
      const detail=fresh(details,"detail");
      text=`${detail}。`;
      if(random()<0.52)text+=`我把${state.object}拿在手里，继续找要去的地方。`;
    }else{
      if(!state.companion)state.companion=choose(["一个穿浅色外套的人","一位年纪很大的阿姨","一个熟悉的朋友",seed.figure==="独自一人"?"一个路过的人":seed.figure]);
      text=choose([
        `${state.companion}走过来问我是不是在找${state.object}。我点了点头。`,
        `我遇见${state.companion}，对方指了指前面的路，让我过去看看。`,
        `${state.companion}递给我一杯水，我接过来，才发现自己一直拿着${state.object}。`
      ]);
    }
    // Some moments linger, others end abruptly; no compulsory revelation.
    if(random()<0.22&&i<count-1)text+=fresh(details,"detail")+"。";
    if(i===count-1&&random()<0.42)text+=choose(SOFT_ENDINGS)+"。";
    events.push({kind:i===count-1?"ending":kind,text});
  }
  return events;
}
function recallEvents(seed,c){
  const events=seed?.events;
  if(!Array.isArray(events)||!events.length)return null;
  const valid=events.filter(e=>e&&typeof e.text==="string");
  if(!valid.length)return null;
  if(c<15){
    const remembered=[{kind:"impression",text:seed.emotion||seed.residue||"说不清的感觉"}];
    return {remembered,narrative:`只剩下一点模糊的感觉：${remembered[0].text}。`};
  }
  if(c<35){
    const remembered=[{kind:"image",text:seed.anchor||seed.scene||"模糊的画面"},{kind:"feeling",text:seed.emotion||"难以辨认的情绪"}];
    return {remembered,narrative:`一个画面：${remembered[0].text}。\n\n还有一种感觉：${remembered[1].text}。其他的都记不清了。`};
  }
  if(c<60){
    const indices=[0,Math.floor(valid.length/2),valid.length-1];
    const remembered=[...new Set(indices)].map(i=>({kind:"fragment",text:valid[i].text}));
    return {remembered,narrative:remembered.map(e=>e.text).join("\n\n……\n\n")+"\n\n中间发生了什么，已经想不起来。"};
  }
  if(c<80){
    const remembered=valid.filter((_,i)=>i===0||i===valid.length-1||i%3!==2);
    return {remembered,narrative:remembered.map((e,i)=>i>0&&i%3===2?`……\n\n${e.text}`:e.text).join("\n\n")};
  }
  return {remembered:valid,narrative:valid.map(e=>e.text).join("\n\n")};
}

/**
 * wish/recentElements are candidate fragments only, not instructions.
 * Dream seed occurrence is independent of wishes; a wish influences 90% of generated seeds.
 */
export function rollDreamSeed({ wish = "", recentElements = [], previousAnchors = [], random = Math.random } = {}) {
  if (random() >= DREAM_SEED_RATE) return { has_seed: false, seed: null };
  const continuity = previousAnchors.length > 0 && random() < 0.05;
  const clarity = Math.floor(random() * 101);
  const strange = random() < 0.025;
  const related = recentElements.filter(x => typeof x === "string" && x.trim()).slice(0, 12);
  const anchor = continuity ? pick(previousAnchors, random) : pick(LIBRARY.anchors, random);
  const scene = weightedPick(LIBRARY.scenes, related, random);
  const figure = weightedPick(LIBRARY.figures, related, random);
  const wish_influenced=Boolean(String(wish).trim()) && random()<DREAM_WISH_INFLUENCE_RATE;
  const seed = {
      scene, anchor, figure, emotion: pick(LIBRARY.emotions, random),
      change: pick(LIBRARY.changes, random), clarity,
      residue: pick(LIBRARY.residues, random),
      strange, continuity, wish_influenced, wish_world:wish_influenced?wishWorld(wish):null,
      wish_beats:wish_influenced?wishBeats(wish,random):[]
  };
  seed.events=buildDreamEvents(seed,random);
  return {has_seed:true,seed};
}
/** Return only fragments that can plausibly be recalled on waking. */
export function revealOnWake(seed) {
  if (!seed) return { remembered: [], clarity: null };
  const c = clamp(Number(seed.clarity) || 0, 0, 100);
  const eventRecall=recallEvents(seed,c);
  if(eventRecall)return {clarity:c,...eventRecall};
  const fragments = [
    ["scene", seed.scene], ["anchor", seed.anchor], ["figure", seed.figure],
    ["emotion", seed.emotion], ["change", seed.change], ["residue", seed.residue]
  ];
  const count = c < 15 ? 1 : c < 35 ? 2 : c < 60 ? 3 : c < 80 ? 4 : 6;
  // Very low clarity preserves emotion rather than a complete story.
  const remembered = c < 15 ? [["emotion", seed.emotion]] : fragments.slice(0, count);
  return { clarity: c, remembered: remembered.map(([kind, value]) => ({ kind, value })) };
}
