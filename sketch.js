/**
 * 可靠版 sketch.js
 * - 畫布為視窗 80%，會隨視窗縮放
 * - 開始畫面，按「開始測驗」才進入題目
 * - loadTable 優先，失敗時用 loadStrings fallback 並回報錯誤
 * - 捕捉 runtime error 並在畫面顯示錯誤提示與 console 訊息
 */

let table;
let questions = [];
let current = 0;
let score = 0;
let answered = false;
let selectedOption = null;
let rippleParticles = [];
let cursorTrail = [];
let confetti = [];
let balloons = [];
let stars = [];
let state = 'start'; // start | quiz | result
let randomSeedVal = 1;
let globalErrorMsg = ''; // 若發生錯誤會顯示在畫面
let loadLogs = [];

// 全域錯誤捕捉（顯示於畫面）
window.onerror = function (msg, src, line, col, err) {
  globalErrorMsg = `${msg} @ ${src}:${line}:${col}`;
  console.error('window.onerror:', globalErrorMsg, err);
};

// helper
function clean(s) {
  if (s === undefined || s === null) return '';
  return (s + '').replace(/^\uFEFF/, '').trim();
}

// preload 時嘗試 loadTable（header）
function preload() {
  try {
    table = loadTable('questions.csv', 'csv', 'header',
      () => { loadLogs.push('loadTable: questions.csv 載入完成'); },
      (err) => { loadLogs.push('loadTable 失敗，setup 會 fallback: ' + err); }
    );
  } catch (e) {
    console.error('preload error', e);
    globalErrorMsg = 'preload 發生錯誤：' + e.message;
  }
}

function canvasWidth() { return floor(windowWidth * 0.8); }
function canvasHeight() { return floor(windowHeight * 0.8); }

function setup() {
  try {
    createCanvas(canvasWidth(), canvasHeight());
    noCursor();
    textFont('Arial');
    textAlign(LEFT, CENTER);
    frameRate(60);
    randomSeedVal = floor(random(10000));

    // 優先 parse loadTable 的結果，否則用 loadStrings fallback
    if (table && table.getRowCount && table.getRowCount() > 0) {
      parseTable();
      postParseReport();
    } else {
      loadStrings('questions.csv',
        (lines) => {
          let res = parseCSVStrings(lines);
          questions = res.questions;
          if (res.errors.length) {
            res.errors.forEach((e, i) => {
              loadLogs.push(`解析錯誤 ${i+1}: ${e}`);
              console.warn(e);
            });
          } else {
            loadLogs.push(`loadStrings 解析成功，題目數：${questions.length}`);
          }
          postParseReport();
        },
        (err) => {
          loadLogs.push('loadStrings 讀取失敗：' + err);
          console.error('loadStrings 讀取 questions.csv 失敗：', err);
        }
      );
    }
  } catch (e) {
    console.error('setup 錯誤', e);
    globalErrorMsg = 'setup 發生錯誤：' + e.message;
  }
}

function windowResized() {
  resizeCanvas(canvasWidth(), canvasHeight());
}

function parseTable() {
  questions = [];
  if (!table || !table.getRowCount) return;
  for (let r = 0; r < table.getRowCount(); r++) {
    let row = table.getRow(r);
    let qTxt = clean(row.get(0));
    let opts = [clean(row.get(1)), clean(row.get(2)), clean(row.get(3)), clean(row.get(4))];
    let ans = clean(row.get(5)).toUpperCase();
    if (!ans) ans = 'A';
    // 若第一欄是 header-like，略過
    if (!qTxt) qTxt = '(題目缺失 — 請檢查 CSV 編碼或 header)';
    questions.push({ q: qTxt, opts: opts, answer: ans });
  }
  loadLogs.push(`parseTable 完成，題目數：${questions.length}`);
  console.log('parseTable result', questions.slice(0,6));
}

function parseCSVStrings(lines) {
  let qs = [];
  let errors = [];
  if (!lines || lines.length === 0) {
    errors.push('檔案為空或無可讀行');
    return { questions: qs, errors };
  }
  // 找 header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith('//')) continue;
    let ll = l.toLowerCase();
    if (ll.includes('question') && ll.includes('answer')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push('找不到 CSV 標頭 (question,A,B,C,D,answer)。請將第一有效行設為表頭且移除開頭註解。');
    return { questions: qs, errors };
  }
  for (let i = headerIdx + 1; i < lines.length; i++) {
    let raw = lines[i];
    if (!raw) continue;
    let l = raw.trim();
    if (!l) continue;
    if (l.startsWith('//')) continue;
    let parts = l.split(',');
    if (parts.length < 6) {
      errors.push(`第 ${i+1} 行欄位不足（預期 >=6）：${raw}`);
      continue;
    }
    let qTxt = clean(parts[0]);
    let opts = [clean(parts[1]), clean(parts[2]), clean(parts[3]), clean(parts[4])];
    let ans = clean(parts[5]).toUpperCase();
    if (!ans) { ans = 'A'; errors.push(`第 ${i+1} 行答案缺失，預設 A：${raw}`); }
    if (!qTxt) qTxt = '(題目缺失)';
    qs.push({ q: qTxt, opts: opts, answer: ans, rawLine: raw });
  }
  console.log('parseCSVStrings 完成', qs.slice(0,6));
  return { questions: qs, errors };
}

function postParseReport() {
  if (!questions || questions.length === 0) {
    loadLogs.push('目前題庫為空。請檢查 questions.csv 是否存在、第一有效行為 header、並移除註解行或 BOM。');
    console.warn('題庫為空', loadLogs);
  } else {
    loadLogs.push('題庫載入成功，題目數：' + questions.length);
  }
}

// 畫面主循環
function draw() {
  background(18, 20, 26);

  // 若有 runtime 錯誤，顯示在畫面
  if (globalErrorMsg) {
    fill(220, 80, 80);
    textSize(18);
    textAlign(CENTER, CENTER);
    text('程式發生錯誤，請查看 Console（F12）', width/2, height/2 - 40);
    fill(200);
    textSize(12);
    text(globalErrorMsg, width/2, height/2, width*0.9, 200);
    return;
  }

  // 若題庫為空，顯示提示及載入日誌
  if (!questions || questions.length === 0) {
    fill(255, 200, 80);
    textSize(18);
    textAlign(CENTER, TOP);
    text('目前未載入到題庫（questions.csv）。請確認：', width/2, height*0.22);
    textSize(14);
    textAlign(CENTER, TOP);
    text('1) 使用本機 HTTP server（py -m http.server 8000）\n2) questions.csv 第一有效行為：question,A,B,C,D,answer\n3) 移除檔案開頭的註解行與 BOM，儲存為 UTF-8', width/2, height*0.28, width*0.9, 200);

    // 顯示載入 logs（方便偵錯）
    fill(200);
    textAlign(LEFT, TOP);
    textSize(12);
    for (let i = 0; i < loadLogs.length; i++) {
      text(loadLogs[i], 20, height*0.55 + i*16);
    }
    drawCustomCursor();
    return;
  }

  // 正常流程：start / quiz / result
  if (state === 'start') {
    drawStartScreen();
  } else if (state === 'quiz') {
    drawQuizTop(); // 題目固定在上方
  } else if (state === 'result') {
    drawResult();
  }

  updateRipples();
  updateConfetti();
  updateBalloons();
  updateStars();
  drawCustomCursor();
}

// 開始畫面
function drawStartScreen() {
  fill(240);
  textAlign(CENTER, CENTER);
  textSize(44);
  text('有趣法律小測驗', width/2, height*0.22);

  textSize(16);
  fill(200);
  text('題庫：各國有趣的法律規範  •  按開始測驗以進入', width/2, height*0.3);

  // 按鈕
  let btnW = min(520, floor(width*0.45));
  let btnH = 72;
  let bx = width/2 - btnW/2;
  let by = height*0.46;
  let hovered = mouseX > bx && mouseX < bx+btnW && mouseY > by && mouseY < by+btnH;
  push();
  if (hovered) { fill(70,140,240); stroke(140,200,255); } else { fill(48,90,160); stroke(90,140,200); }
  strokeWeight(2);
  rect(bx, by, btnW, btnH, 12);
  pop();
  fill(255);
  textSize(20);
  text('開始測驗', width/2, by + btnH/2);

  fill(170);
  textSize(12);
  textAlign(CENTER, TOP);
  text('請用本機 HTTP server 避免 CORS 問題（範例：在資料夾執行 py -m http.server 8000）', width/2, height - 40, width*0.9);

  updateCursorTrail();
  drawCustomCursor();
}

function drawQuizTop() {
  let padding = 30;
  let boxW = width - padding*2;

  // 題目區（固定在上方）
  let qBoxY = 18;
  let qBoxH = 140;
  push();
  fill(30,34,46,240);
  stroke(90);
  rect(padding, qBoxY, boxW, qBoxH, 12);
  pop();

  // 題號與題目
  let q = questions[current] || { q: '(無題目)', opts: ['','','',''], answer:'A' };
  fill(200);
  textSize(16);
  textAlign(LEFT, TOP);
  text(`題目 ${current+1} / ${questions.length}`, padding + 16, qBoxY + 10);
  textSize(24);
  fill(245);
  text(q.q, padding + 16, qBoxY + 38, boxW - 32, qBoxH - 46);

  // 選項區（從題目區下面開始）
  let optStartY = qBoxY + qBoxH + 18;
  let optH = 70;
  for (let i = 0; i < 4; i++) {
    let x = padding;
    let y = optStartY + i*(optH + 14);
    let w = boxW;
    let h = optH;
    let hovered = mouseX > x && mouseX < x+w && mouseY > y && mouseY < y+h;
    if (hovered && !answered) { fill(70,120,200); stroke(120,180,255); } else { fill(36); stroke(70); }
    strokeWeight(2);
    rect(x, y, w, h, 10);

    noStroke();
    fill(220);
    textSize(18);
    let optText = (q.opts && q.opts[i])? q.opts[i] : '(選項缺失)';
    text(`${String.fromCharCode(65+i)}. ${optText}`, x + 18, y + h/2);
    if (answered) {
      let correctLetter = q.answer || 'A';
      if (String.fromCharCode(65+i) === correctLetter) {
        push(); noStroke(); fill(0,200,100,170); rect(x+w-140,y+12,120,40,8); fill(255); textSize(14); text('正確', x+w-80, y+h/2); pop();
      } else if (selectedOption === i) {
        push(); noStroke(); fill(220,50,50,180); rect(x+w-140,y+12,120,40,8); fill(255); textSize(14); text('錯誤', x+w-80, y+h/2); pop();
      }
    }
  }

  // 說明與進度
  fill(180);
  textSize(14);
  text('點選選項作答。', padding, height - 60);
  let pbX = padding; let pbY = height - 40; let pbW = width - padding*2;
  noStroke(); fill(60); rect(pbX,pbY,pbW,12,6); fill(100,180,255); rect(pbX,pbY,pbW * (current / questions.length), 12, 6);
}

// 點擊事件
function mousePressed() {
  // start 畫面按鈕
  if (state === 'start') {
    let btnW = min(520, floor(width*0.45));
    let btnH = 72;
    let bx = width/2 - btnW/2;
    let by = height*0.46;
    if (mouseX > bx && mouseX < bx+btnW && mouseY > by && mouseY < by+btnH) {
      // 若題庫為空嘗試再次解析
      if (!questions || questions.length === 0) {
        if (table && table.getRowCount && table.getRowCount() > 0) parseTable();
      }
      state = 'quiz';
      current = 0;
      score = 0;
      answered = false;
      selectedOption = null;
      loadLogs.push('使用者開始測驗');
    }
    return;
  }

  if (!questions || questions.length === 0) return;

  if (state === 'quiz' && !answered) {
    // 與 drawQuizTop 同步選項 Y 計算
    let padding = 30;
    let qBoxY = 18;
    let qBoxH = 140;
    let optStartY = qBoxY + qBoxH + 18;
    let boxW = width - padding*2;
    let optH = 70;
    for (let i = 0; i < 4; i++) {
      let x = padding;
      let y = optStartY + i*(optH + 14);
      if (mouseX > x && mouseX < x + boxW && mouseY > y && mouseY < y + optH) {
        selectedOption = i;
        answered = true;
        let correct = (String.fromCharCode(65+i) === questions[current].answer);
        if (correct) score++;
        createRipple(mouseX, mouseY, correct);
        setTimeout(() => {
          current++;
          selectedOption = null;
          answered = false;
          if (current >= questions.length) {
            state = 'result';
            setupResultParticles();
          }
        }, 800);
        return;
      }
    }
  } else if (state === 'result') {
    // 回到開始畫面
    resetQuiz();
    state = 'start';
  }
}

function createRipple(x,y,correct) { rippleParticles.push({x,y,r:10,alpha:200,correct}); }
function updateRipples() {
  for (let i = rippleParticles.length-1; i>=0; i--) {
    let p = rippleParticles[i];
    push(); noFill(); strokeWeight(3); if (p.correct) stroke(100,255,160,p.alpha); else stroke(255,80,80,p.alpha); ellipse(p.x,p.y,p.r*2); pop();
    p.r += 10; p.alpha -= 12; if (p.alpha <= 0) rippleParticles.splice(i,1);
  }
}

function updateCursorTrail() {
  cursorTrail.push({x: mouseX, y: mouseY, a: 255, s: random(4,12)});
  if (cursorTrail.length > 20) cursorTrail.shift();
}
function drawCustomCursor() {
  noStroke();
  for (let i = 0; i < cursorTrail.length; i++) {
    let t = cursorTrail[i];
    fill(120,180,255,t.a);
    ellipse(t.x,t.y,t.s);
    t.a -= 10;
  }
  push(); stroke(255); strokeWeight(2); noFill(); ellipse(mouseX, mouseY, 18); pop();
}

function drawResult() {
  let ratio = score / questions.length;
  fill(240); textSize(30); textAlign(CENTER, CENTER);
  text(`成績：${score}/${questions.length} (${nf(ratio*100,1,0)}%)`, width/2, 100);
  textSize(18); textAlign(CENTER, CENTER);
  text('點擊任意處回到開始', width/2, height - 40);
  if (ratio >= 0.8) { textSize(20); fill(180,255,200); text('太棒了！', width/2, 150); } 
  else if (ratio >= 0.5) { textSize(20); fill(240,240,190); text('不錯！繼續保持！', width/2, 150); } 
  else { textSize(20); fill(255,220,220); text('加油！再試一次！', width/2, 150); }
  push(); translate(width/2, height/2 + 40); noFill(); stroke(255,255,255,30); ellipse(0,0,420); pop();
}

function setupResultParticles() {
  randomSeed(randomSeedVal);
  let ratio = score / questions.length;
  confetti = []; balloons = []; stars = [];
  if (ratio >= 0.8) {
    for (let i=0;i<80;i++) confetti.push({x:random(width),y:random(-200,-10),vx:random(-1,1),vy:random(1,4),size:random(6,12),c:color(random(50,255),random(50,255),random(50,255))});
  } else if (ratio >= 0.5) {
    for (let i=0;i<60;i++) stars.push({x:random(width),y:random(80,height-80),s:random(2,5),tw:random(0.01,0.08),a:random(120,255)});
  } else {
    for (let i=0;i<8;i++) balloons.push({x:random(80,width-80),y:random(height+20,height+200),vx:random(-0.5,0.5),vy:random(-1.5,-0.6),color:color(random(150,255),random(100,220),random(150,255)),sway:random(0,TWO_PI)});
  }
}

function updateConfetti() {
  if (!confetti || confetti.length===0) return;
  for (let i=confetti.length-1;i>=0;i--) {
    let p = confetti[i];
    push(); translate(p.x,p.y); rotate(frameCount*0.03 + i); noStroke(); fill(p.c); rect(-p.size/2,-p.size/2,p.size,p.size); pop();
    p.x += p.vx; p.y += p.vy; p.vy += 0.03;
    if (p.y > height + 50) { p.y = random(-200,-10); p.x = random(width); p.vy = random(1,4); }
  }
}
function updateBalloons() {
  if (!balloons || balloons.length===0) return;
  for (let i=0;i<balloons.length;i++) {
    let b = balloons[i]; b.x += b.vx + sin(frameCount*0.02 + b.sway)*0.5; b.y += b.vy;
    push(); translate(b.x,b.y); noStroke(); fill(b.color); ellipse(0,0,48,64); fill(30,30,30,40); ellipse(10,6,18,10); stroke(120); line(0,34,0,60); pop();
    if (b.y < -80) { b.y = random(height+20,height+160); b.x = random(80,width-80); }
  }
}
function updateStars() {
  if (!stars || stars.length===0) return;
  for (let i=0;i<stars.length;i++) {
    let s = stars[i]; s.a = 180 + 75 * sin(frameCount * s.tw + i);
    push(); translate(s.x,s.y); noStroke(); fill(255,240,120,s.a); ellipse(0,0,s.s); pop();
  }
}

function resetQuiz() {
  current = 0; score = 0; answered = false; selectedOption = null;
  rippleParticles = []; confetti = []; balloons = []; stars = [];
  randomSeedVal = floor(random(10000));
  loadLogs.push('Quiz 已重設');
}
