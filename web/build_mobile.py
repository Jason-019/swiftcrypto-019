"""
build_mobile.py — 生成内嵌全部歌词的移动版 HTML
用法: python build_mobile.py
输出: encrypt_chat_mobile_full.html
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, 'lyrics.csv')
OUT = os.path.join(HERE, 'encrypt_chat_mobile_full.html')

# ── 读取 CSV，去重整理为紧凑管道格式 ──
data = {}  # album -> song -> [lyrics]
with open(CSV, 'r', encoding='utf-8', errors='replace') as f:
    for row in csv.reader(f):
        if len(row) >= 3 and row[0] and row[1] and row[2]:
            s, a, l = row[0].strip(), row[1].strip(), row[2].strip()
            data.setdefault(a, {}).setdefault(s, [])
            if l not in data[a][s]:
                data[a][s].append(l)

# 生成紧凑数据块: album|song|lyric 每行
lyric_lines = []
for a in sorted(data):
    if a.lower() in ('album', 'unknown', ''):
        continue
    for s in sorted(data[a]):
        for l in data[a][s]:
            esc = l.replace('\\', '\\\\').replace('`', '\\`')
            lyric_lines.append(f"{a}|{s}|{esc}")

embedded = '\\n'.join(lyric_lines)
total_songs = sum(len(v) for v in data.values())
total_lyrics = len(lyric_lines)

# ── HTML 模板 ──
HTML = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>🔐 SwiftCrypto</title>
<style>
:root{{
    --bg:#0a0a0f;--card:rgba(20,20,40,0.8);--accent:#a78bfa;--accent2:#7c3aed;
    --text:#e2e0e7;--dim:#8888a0;--border:rgba(255,255,255,0.07);--r:14px;--rs:10px;
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{
    font-family:-apple-system,'PingFang SC',system-ui,sans-serif;
    background:var(--bg);color:var(--text);min-height:100vh;min-height:100dvh;
    display:flex;flex-direction:column;color-scheme:dark;transition:background 0.5s;
}}
.topbar{{
    display:flex;align-items:center;gap:8px;padding:10px 12px;
    background:rgba(10,10,20,0.9);border-bottom:1px solid var(--border);
    position:sticky;top:0;z-index:10;backdrop-filter:blur(12px);
}}
.topbar h1{{font-size:1rem;font-weight:700;flex:1;
    background:linear-gradient(135deg,var(--accent),#e879f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
}}
.topbar .badge{{font-size:0.65rem;color:var(--dim);border:1px solid var(--border);border-radius:6px;padding:2px 6px;}}
.icon-btn{{
    width:34px;height:34px;border-radius:var(--rs);border:1px solid var(--border);
    background:rgba(255,255,255,0.04);color:var(--text);font-size:1rem;
    display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;
}}
.icon-btn:active{{background:var(--accent2)}}
.pwd-row{{display:flex;gap:6px;padding:10px 12px;align-items:center;}}
.pwd-row input{{
    flex:1;padding:10px 12px;border-radius:var(--rs);border:1px solid var(--border);
    background:rgba(255,255,255,0.04);color:var(--text);font-size:0.9rem;outline:none;min-width:0;
}}
.pwd-row input:focus{{border-color:var(--accent)}}
.tabs{{display:flex;border-bottom:1px solid var(--border);margin:0 12px}}
.tab{{
    flex:1;text-align:center;padding:10px;font-size:0.85rem;font-weight:600;
    color:var(--dim);cursor:pointer;border-bottom:2px solid transparent;transition:.2s;
}}
.tab.active{{color:var(--accent);border-bottom-color:var(--accent)}}
.content{{flex:1;display:flex;flex-direction:column;padding:10px 12px;gap:10px;overflow-y:auto}}
.panel{{display:none;flex-direction:column;gap:8px;flex:1}}
.panel.active{{display:flex}}
textarea{{
    flex:1;min-height:140px;padding:12px;border-radius:var(--rs);border:1px solid var(--border);
    background:rgba(0,0,0,0.25);color:var(--text);font-size:0.9rem;line-height:1.55;
    resize:none;outline:none;font-family:inherit;
}}
textarea:focus{{border-color:var(--accent)}}
textarea[readonly]{{background:rgba(0,0,0,0.15)}}
.btn-row{{display:flex;gap:6px;flex-wrap:wrap}}
.btn{{
    padding:10px 16px;border-radius:var(--rs);border:none;font-size:0.82rem;font-weight:600;
    cursor:pointer;display:flex;align-items:center;gap:5px;transition:.15s;
}}
.btn-primary{{background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff;flex:1;justify-content:center}}
.btn-primary:active{{opacity:.85}}
.btn-copy{{background:rgba(16,185,129,0.18);color:#6ee7b7;border:1px solid rgba(16,185,129,0.25)}}
.btn-outline{{background:transparent;color:var(--dim);border:1px solid var(--border)}}
.char-count{{font-size:0.7rem;color:var(--dim);text-align:right}}
#lyricModal{{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.75);
    backdrop-filter:blur(4px);justify-content:flex-end;align-items:stretch}}
#lyricModal.show{{display:flex}}
#lyricModal .sheet{{
    background:rgba(20,20,45,0.98);border-radius:16px 16px 0 0;padding:16px;
    max-height:75vh;width:100%;overflow-y:auto;display:flex;flex-direction:column;gap:10px;
}}
#lyricModal .sheet h3{{font-size:1rem;text-align:center}}
#lyricModal select{{
    padding:10px;border-radius:var(--rs);border:1px solid var(--border);
    background:rgba(255,255,255,0.05);color:var(--text);font-size:0.85rem;outline:none;color-scheme:dark;
}}
#lyricModal select:disabled{{opacity:.35}}
/* 自定义下拉替换原生 select */
.lyric-custom-select {{
    position:relative;
}}
.lyric-custom-select .lcs-trigger {{
    width:100%;padding:10px;border-radius:var(--rs);border:1px solid var(--border);
    background:rgba(255,255,255,0.05);color:var(--dim);font-size:0.85rem;
    text-align:left;outline:none;cursor:pointer;
}}
.lyric-custom-select .lcs-trigger:not(:disabled){{color:var(--text)}}
.lyric-custom-select .lcs-options {{
    display:none;position:absolute;left:0;right:0;top:100%;
    max-height:180px;overflow-y:auto;border-radius:var(--rs);
    border:1px solid var(--border);background:rgba(20,20,45,0.98);
    z-index:10;margin-top:2px;
}}
.lyric-custom-select.open .lcs-options{{display:block}}
.lyric-custom-select .lcs-opt {{
    padding:10px 12px;cursor:pointer;font-size:0.82rem;color:var(--text);
}}
.lyric-custom-select .lcs-opt:hover,.lyric-custom-select .lcs-opt:active{{background:rgba(167,139,250,0.25)}}
#lyricModal .preview{{padding:10px;border-radius:var(--rs);background:rgba(0,0,0,0.3);border:1px solid var(--border);font-size:0.85rem;font-style:italic;line-height:1.4}}
#lyricModal .modal-btns{{display:flex;gap:8px}}
#lyricModal .modal-btns .btn{{flex:1;justify-content:center}}
.toast{{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#10b981;
    color:#fff;padding:8px 18px;border-radius:18px;font-size:0.8rem;z-index:200;
    opacity:0;pointer-events:none;transition:opacity .3s}}
.toast.show{{opacity:1}}
</style>
</head>
<body>

<div class="topbar">
    <h1>SwiftCrypto</h1>
    <span class="badge">AES-256</span>
</div>

<div class="pwd-row">
    <input type="password" id="password" placeholder="共享密码…" autocomplete="off">
    <button class="icon-btn" id="togglePwd" onclick="togglePwd()">👁</button>
    <button class="icon-btn" onclick="genPwd()" title="生成随机密码" style="color:#fbbf24;">🎲</button>
    <button class="icon-btn" onclick="openLyricPicker()" title="从歌词挑选" style="color:var(--accent)">📜</button>
</div>

<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;font-size:0.75rem;color:var(--dim);">
    <span>🎨</span>
    <button class="icon-btn" onclick="prevTheme()" style="width:28px;height:28px;font-size:0.7rem;">◀</button>
    <span id="themeName" style="min-width:90px;text-align:center;font-size:0.78rem;">1989</span>
    <button class="icon-btn" onclick="nextTheme()" style="width:28px;height:28px;font-size:0.7rem;">▶</button>
    <span style="margin-left:8px;">🌓</span>
    <input type="range" id="bgOpacity" min="0" max="100" value="60" oninput="updateBgOpacity(this.value)" style="flex:1;max-width:80px;accent-color:var(--accent);">
    <span id="bgOpacityVal" style="min-width:28px;">60%</span>
</div>

<div class="tabs">
    <div class="tab active" onclick="switchTab('enc')">🔒 加密</div>
    <div class="tab" onclick="switchTab('dec')">🔓 解密</div>
</div>

<div class="content">
    <div class="panel active" id="panelEnc">
        <textarea id="plainInput" placeholder="输入明文…"></textarea>
        <div class="btn-row">
            <button class="btn btn-primary" onclick="doEncrypt()">🔒 加密</button>
            <button class="btn btn-outline" onclick="clearArea('plainInput')">清空</button>
        </div>
        <textarea id="cipherOutput" placeholder="密文…" readonly></textarea>
        <div class="btn-row">
            <button class="btn btn-copy" onclick="copyText('cipherOutput')">📋 复制密文</button>
        </div>
        <div class="char-count" id="cipherCount">密文: 0 字</div>
    </div>
    <div class="panel" id="panelDec">
        <textarea id="cipherInput" placeholder="粘贴密文…"></textarea>
        <div class="btn-row">
            <button class="btn btn-primary" onclick="doDecrypt()">🔓 解密</button>
            <button class="btn btn-outline" onclick="clearArea('cipherInput')">清空</button>
        </div>
        <textarea id="plainOutput" placeholder="明文…" readonly></textarea>
        <div class="btn-row">
            <button class="btn btn-copy" onclick="copyText('plainOutput')">📋 复制明文</button>
        </div>
        <div class="char-count" id="plainCount">明文: 0 字</div>
    </div>
</div>

<div class="toast" id="toast"></div>

<div id="lyricModal">
    <div class="sheet">
        <h3>📜 挑选歌词作密码</h3>
        <div class="lyric-custom-select" id="csAlbum">
            <button class="lcs-trigger" id="trigAlbum" onclick="toggleCS('csAlbum')" disabled>— 专辑 —</button>
            <div class="lcs-options" id="optsAlbum"></div>
        </div>
        <div class="lyric-custom-select" id="csSong">
            <button class="lcs-trigger" id="trigSong" onclick="toggleCS('csSong')" disabled>— 歌曲 —</button>
            <div class="lcs-options" id="optsSong"></div>
        </div>
        <div class="lyric-custom-select" id="csLyric">
            <button class="lcs-trigger" id="trigLyric" onclick="toggleCS('csLyric')" disabled>— 歌词 —</button>
            <div class="lcs-options" id="optsLyric"></div>
        </div>
        <div class="preview" id="lyricPreview">选择后预览…</div>
        <div class="modal-btns">
            <button class="btn btn-outline" onclick="closeLyricPicker()">取消</button>
            <button class="btn btn-primary" id="useLyricBtn" onclick="useLyric()" disabled>🔑 用作密码</button>
        </div>
    </div>
</div>

<script>
// Crypto
const NS=12,KS=256,IT=600000,ST=new TextEncoder().encode('SCMobile_v1');
async function dk(p){{const m=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({{name:'PBKDF2',salt:ST,iterations:IT,hash:'SHA-256'}},m,{{name:'AES-GCM',length:KS}},false,['encrypt','decrypt'])}}
async function doEncrypt(){{
    const p=document.getElementById('plainInput').value;if(!p)return t('请输入明文');
    try{{const k=await dk(gp()),n=crypto.getRandomValues(new Uint8Array(NS)),c=await crypto.subtle.encrypt({{name:'AES-GCM',iv:n}},k,new TextEncoder().encode(p)),m=new Uint8Array(n.length+c.byteLength);m.set(n);m.set(new Uint8Array(c),n.length);document.getElementById('cipherOutput').value=btoa(String.fromCharCode(...m));uc();t('✅ 加密完成')}}catch(e){{t('❌ '+e.message)}}
}}
async function doDecrypt(){{
    const b=document.getElementById('cipherInput').value.trim();if(!b)return t('请输入密文');
    try{{const k=await dk(gp()),r=Uint8Array.from(atob(b),c=>c.charCodeAt(0)),p=await crypto.subtle.decrypt({{name:'AES-GCM',iv:r.slice(0,NS)}},k,r.slice(NS));document.getElementById('plainOutput').value=new TextDecoder().decode(p);uc();t('✅ 解密成功')}}catch(e){{t(e.name==='OperationError'?'❌ 密码错误':'❌ '+e.message)}}
}}
function gp(){{return document.getElementById('password').value}}
function togglePwd(){{const e=document.getElementById('password'),b=document.getElementById('togglePwd');if(e.type==='password'){{e.type='text';b.textContent='🙈'}}else{{e.type='password';b.textContent='👁'}}}}
function switchTab(tab){{document.querySelectorAll('.tab,.panel').forEach(e=>e.classList.remove('active'));if(tab==='enc'){{document.querySelector('.tab:nth-child(1)').classList.add('active');document.getElementById('panelEnc').classList.add('active')}}else{{document.querySelector('.tab:nth-child(2)').classList.add('active');document.getElementById('panelDec').classList.add('active')}}}}
function t(m){{const e=document.getElementById('toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}}
function clearArea(id){{document.getElementById(id).value='';uc()}}
async function copyText(id){{const v=document.getElementById(id).value;if(!v)return t('⚠️ 无内容');try{{await navigator.clipboard.writeText(v);t('✅ 已复制')}}catch{{document.getElementById(id).select();document.execCommand('copy');t('✅ 已复制')}}}}
function uc(){{document.getElementById('cipherCount').textContent='密文: '+document.getElementById('cipherOutput').value.length+' 字';document.getElementById('plainCount').textContent='明文: '+document.getElementById('plainOutput').value.length+' 字'}}
function genPwd(){{
    const w='starlight wonder midnight crystal velvet golden crimson silver whisper shadow dawn autumn winter summer thunder lightning rainbow phoenix dragon eagle ocean river mountain forest meadow garden castle bridge tower mirror'.split(' ');
    const p=w[Math.floor(Math.random()*w.length)]+'-'+Math.floor(Math.random()*900+100)+'-'+w[Math.floor(Math.random()*w.length)];
    document.getElementById('password').value=p;document.getElementById('password').type='text';
    document.getElementById('togglePwd').textContent='🙈';t('🎲 '+p);
}}
// Theme gradients (inspired by album color palettes)
const THEMES=[
    {{name:'纯黑',grad:''}},
    {{name:'Debut',grad:'linear-gradient(135deg,#0a4a3a,#1a6b5a,#0d5c8a)'}},
    {{name:'Fearless',grad:'linear-gradient(135deg,#3d2b0a,#6b4c1a,#c4942a)'}},
    {{name:'Speak Now',grad:'linear-gradient(135deg,#2a0a3d,#5c1a6b,#c94aa4)'}},
    {{name:'Red',grad:'linear-gradient(135deg,#3d0a0a,#8b1a1a,#d44a2a)'}},
    {{name:'1989',grad:'linear-gradient(135deg,#1a3a5c,#4a8ab5,#c4ddf0)'}},
    {{name:'Reputation',grad:'linear-gradient(135deg,#0a0a0a,#2a2a2a,#5a5a5a)'}},
    {{name:'Lover',grad:'linear-gradient(135deg,#4a2a5c,#8b6ab5,#f0c4e0)'}},
    {{name:'Folklore',grad:'linear-gradient(135deg,#1a2a1a,#3a5a3a,#8a9a7a)'}},
    {{name:'Evermore',grad:'linear-gradient(135deg,#3d2a1a,#6b4a2a,#c48a4a)'}},
    {{name:'Midnights',grad:'linear-gradient(135deg,#0a0a2a,#1a1a5c,#4a3a8b)'}},
    {{name:'TTPD',grad:'linear-gradient(135deg,#3d3a2a,#8b8a6a,#d4c4a0)'}},
    {{name:'Showgirl',grad:'linear-gradient(135deg,#2a0a1a,#8b1a4a,#d4a43a)'}},
];
let themeIdx=5;
function setTheme(){{
    const t=THEMES[themeIdx];document.getElementById('themeName').textContent=t.name;
    document.body.style.background=t.grad||'var(--bg)';
}}
function prevTheme(){{themeIdx=(themeIdx-1+THEMES.length)%THEMES.length;setTheme();}}
function nextTheme(){{themeIdx=(themeIdx+1)%THEMES.length;setTheme();}}
function updateBgOpacity(v){{
    document.body.style.opacity=v/100;document.getElementById('bgOpacityVal').textContent=v+'%';
}}

// Lyrics Picker (full embedded data, custom selects)
const LYRIC_DATA=`{embedded}`;
let am={{}},_selectedLyric='';
// 自定义下拉工具
function toggleCS(id){{document.querySelectorAll('.lyric-custom-select').forEach(e=>{{if(e.id!==id)e.classList.remove('open')}});document.getElementById(id).classList.toggle('open')}}
document.addEventListener('click',e=>{{if(!e.target.closest('.lyric-custom-select'))document.querySelectorAll('.lyric-custom-select').forEach(el=>el.classList.remove('open'))}});
(function initLyrics(){{
    const lines=LYRIC_DATA.trim().split('\\n');
    for(const line of lines){{
        const parts=line.split('|');
        if(parts.length>=3){{
            const a=parts[0],s=parts[1],l=parts.slice(2).join('|');
            if(!am[a])am[a]={{}};if(!am[a][s])am[a][s]=[];if(!am[a][s].includes(l))am[a][s].push(l);
        }}
    }}
    const o=document.getElementById('optsAlbum');
    o.innerHTML=Object.keys(am).sort().map(a=>`<div class="lcs-opt" data-v="${{eh(a)}}" onclick="pickAlbum(this)">${{eh(a)}}</div>`).join('');
    document.getElementById('trigAlbum').disabled=false;
}})();
function pickAlbum(el){{
    const v=el.dataset.v;document.getElementById('trigAlbum').textContent=v;toggleCS('csAlbum');
    const ss=document.getElementById('trigSong');const o=document.getElementById('optsSong');
    ss.disabled=false;ss.textContent='— 歌曲 —';
    o.innerHTML=Object.keys(am[v]||{{}}).sort().map(s=>`<div class="lcs-opt" data-v="${{eh(s)}}" onclick="pickSong(this)">${{eh(s)}}</div>`).join('');
    document.getElementById('trigLyric').disabled=true;document.getElementById('trigLyric').textContent='— 歌词 —';
    document.getElementById('optsLyric').innerHTML='';document.getElementById('lyricPreview').textContent='选择后预览…';document.getElementById('useLyricBtn').disabled=true;
}}
function pickSong(el){{
    const v=el.dataset.v;document.getElementById('trigSong').textContent=v;toggleCS('csSong');
    const a=document.getElementById('trigAlbum').textContent;const ls=document.getElementById('trigLyric');const o=document.getElementById('optsLyric');
    ls.disabled=false;ls.textContent='— 歌词 —';
    o.innerHTML=(am[a][v]||[]).map((l,i)=>`<div class="lcs-opt" data-v="${{i}}" onclick="pickLyric(this)">${{eh(l.length>50?l.slice(0,50)+'…':l)}}</div>`).join('');
    document.getElementById('lyricPreview').textContent='选择后预览…';document.getElementById('useLyricBtn').disabled=true;
}}
function pickLyric(el){{
    const i=el.dataset.v;document.getElementById('trigLyric').textContent=el.textContent;toggleCS('csLyric');
    const a=document.getElementById('trigAlbum').textContent;const s=document.getElementById('trigSong').textContent;
    _selectedLyric=am[a][s][parseInt(i)];document.getElementById('lyricPreview').textContent=`"${{_selectedLyric}}"`;document.getElementById('useLyricBtn').disabled=false;
}}
function openLyricPicker(){{document.getElementById('lyricModal').classList.add('show')}}
function closeLyricPicker(){{document.getElementById('lyricModal').classList.remove('show')}}
function useLyric(){{
    const pw=document.getElementById('password');pw.value=_selectedLyric;pw.type='text';
    document.getElementById('togglePwd').textContent='🙈';closeLyricPicker();t('✅ 歌词已填入')
}}
function eh(s){{return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}}
document.getElementById('lyricModal').addEventListener('click',function(e){{if(e.target===this)closeLyricPicker()}});
setTheme();updateBgOpacity(60);uc();
</script>
</body>
</html>
'''

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(HTML)

sz_kb = os.path.getsize(OUT) / 1024
print(f"✅ 生成: {OUT}")
print(f"   专辑: {len(data)}, 歌曲: {total_songs}, 歌词行: {total_lyrics}")
print(f"   文件大小: {sz_kb:.0f} KB")
