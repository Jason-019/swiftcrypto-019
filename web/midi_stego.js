
// ═══════════════════════════════════════════════════════════════
// 🎵 MIDI 隐写传输 (Velocity LSB 编码)
// ═══════════════════════════════════════════════════════════════
let _midiMeta=null;
const _midiMetaUrl='midi_meta.json?v=3';

async function initMidiTab(){
    if(_midiMeta){return} // Already loaded
    try{
        const r=await fetch(_midiMetaUrl);
        if(!r.ok)throw new Error('HTTP '+r.status);
        _midiMeta=await r.json();
    }catch(e){console.warn('initMidiTab:',e)}
}

// ─── 🎹 MIDI 挑选 Modal ───
let _midiPendingSong=null;  // {id, name, encodable, base64}

function openMidiPicker(){
    if(!_midiMeta){t('⚠️ 歌曲列表加载中…');return}
    renderMidiAlbumList();
    // Reset
    _midiPendingSong=null;
    document.getElementById('midiTrigSong').disabled=true;
    document.getElementById('midiTrigSong').textContent='— 歌曲 —';
    document.getElementById('midiOptsSong').innerHTML='';
    document.getElementById('midiPickerPreview').textContent='';
    document.getElementById('midiConfirmBtn').disabled=true;
    document.getElementById('midiPickerModal').style.display='flex';
}
function closeMidiPicker(){
    document.getElementById('midiPickerModal').style.display='none';
}
document.addEventListener('DOMContentLoaded',function(){
    document.getElementById('midiPickerModal').addEventListener('click',function(e){
        if(e.target===this)closeMidiPicker();
    });
});

function midiToggleCS(id){
    document.querySelectorAll('#midiPickerModal .lyric-custom-select').forEach(e=>{if(e.id!==id)e.classList.remove('open')});
    document.getElementById(id).classList.toggle('open');
}
document.addEventListener('click',e=>{
    if(!e.target.closest('#midiPickerModal .lyric-custom-select')){
        document.querySelectorAll('#midiPickerModal .lyric-custom-select').forEach(el=>el.classList.remove('open'));
    }
});

function renderMidiAlbumList(){
    const o=document.getElementById('midiOptsAlbum');
    if(!_midiMeta||!_midiMeta.songs)return;
    const albums={};
    for(const [id,s] of Object.entries(_midiMeta.songs)){
        if(!albums[s.album])albums[s.album]={count:0};
        albums[s.album].count++;
    }
    o.innerHTML=Object.keys(albums).sort().map(a=>
        `<div class="lcs-opt" data-v="${eh(a)}" onclick="midiPickAlbum(this)">${eh(a)} (${albums[a].count}首)</div>`
    ).join('');
    document.getElementById('midiTrigAlbum').disabled=false;
}
function midiPickAlbum(el){
    const v=el.dataset.v;
    document.getElementById('midiTrigAlbum').textContent=v;
    midiToggleCS('midiCsAlbum');
    
    const trig=document.getElementById('midiTrigSong');
    const o=document.getElementById('midiOptsSong');
    trig.disabled=false;trig.textContent='— 歌曲 —';
    
    const songs=[];
    for(const [id,s] of Object.entries(_midiMeta.songs)){
        if(s.album===v)songs.push({id,name:s.name,encodable:s.encodable,base64:s.base64_chars});
    }
    songs.sort((a,b)=>a.name.localeCompare(b.name));
    o.innerHTML=songs.map(s=>
        `<div class="lcs-opt" data-v="${eh(s.id)}" data-name="${eh(s.name)}" data-enc="${s.encodable}" data-b64="${s.base64}" onclick="midiPickSong(this)">${eh(s.name)} (${s.encodable}bit)</div>`
    ).join('');
    
    _midiPendingSong=null;
    document.getElementById('midiPickerPreview').textContent='';
    document.getElementById('midiConfirmBtn').disabled=true;
}
function midiPickSong(el){
    _midiPendingSong={
        id:el.dataset.v,
        name:el.dataset.name,
        encodable:parseInt(el.dataset.enc),
        base64:parseInt(el.dataset.b64)
    };
    document.getElementById('midiTrigSong').textContent=_midiPendingSong.name;
    document.getElementById('midiPickerPreview').textContent=
        `📊 ${_midiPendingSong.encodable} 可编码 bit | ≈${_midiPendingSong.base64} Base64 字符`;
    document.getElementById('midiConfirmBtn').disabled=false;
    midiToggleCS('midiCsSong');
}
function confirmMidiPick(){
    if(!_midiPendingSong)return;
    const s=_midiPendingSong;
    document.getElementById('midiSongSelect').value=s.id;
    document.getElementById('midiSongInfo').textContent=
        `📊 ${s.encodable} 可编码 bit | ≈${s.base64} Base64 字符 | ${s.name}`;
    closeMidiPicker();
    updateMidiCapacity();
}

// ─── 📊 剩余容量进度条 ───
let _midiCapTimer=null;
function updateMidiCapacity(){
    // Debounce: coalesce rapid input events into one update per ~50ms
    if(_midiCapTimer){clearTimeout(_midiCapTimer);_midiCapTimer=null}
    _midiCapTimer=setTimeout(_updateMidiCapacityNow,50);
}
function _updateMidiCapacityNow(){
    const bar=document.getElementById('midiCapBar'),lbl=document.getElementById('midiCapLabel');
    const plain=document.getElementById('midiPlainInput').value;
    const songId=document.getElementById('midiSongSelect').value;
    if(!songId||!_midiMeta||!_midiMeta.songs[songId]){
        bar.style.width='0';lbl.textContent='';return;
    }
    const totalBits=_midiMeta.songs[songId].encodable;
    const totalB64=_midiMeta.songs[songId].base64_chars;
    // Empty text → show 0 usage, full remaining
    if(!plain.trim()){
        bar.style.width='0';bar.style.background='var(--accent)';
        lbl.textContent=`0/${totalB64} B64字符 | 剩余 ≈${totalB64} 字符`;
        return;
    }
    // Estimate: plaintext → AES-GCM → Base64 → bits
    // AES-GCM overhead: 12 byte nonce + 16 byte tag = 28 bytes
    const plainBytes=new TextEncoder().encode(plain).length;
    const cipherBytes=plainBytes+28;
    // Number of data (non-padding) Base64 chars: ceil(N * 4/3)
    const b64Used=Math.ceil(cipherBytes*4/3);
    // Each Base64 char = 6 bits, plus 16-bit length header
    const bitsNeeded=b64Used*6+16;
    // totalBits = encodable notes = max bits the song can hold
    // totalB64  = (totalBits - 16) // 6 = max Base64 chars the song can hold

    const pct=Math.min(bitsNeeded/totalBits*100,100);
    bar.style.width=pct+'%';
    if(pct>90)bar.style.background='#ef4444';
    else if(pct>60)bar.style.background='#eab308';
    else bar.style.background='var(--accent)';

    const cappedUsed=Math.min(b64Used,totalB64);
    const remainingB64=totalB64-cappedUsed;
    lbl.textContent=`${cappedUsed}/${totalB64} B64字符 | 剩余 ≈${Math.max(0,remainingB64)} 字符`;
    if(b64Used>totalB64)lbl.textContent+=` ⚠️`;
}
async function loadMidiOriginal(songId){
    if(!_midiMeta||!_midiMeta.songs[songId])throw new Error('未知歌曲');
    const s=_midiMeta.songs[songId];
    const r=await fetch(s.file);
    if(!r.ok)throw new Error('MIDI加载失败: '+r.status);
    return await r.arrayBuffer();
}

// ─── MIDI 二进制解析 ───
function parseMidiNotes(buf){
    const dv=new DataView(buf),notes=[];
    let pos=0;
    if(dv.getUint32(pos)!==0x4D546864)throw new Error('不是标准 MIDI 文件');
    pos+=4;
    const hdrLen=dv.getUint32(pos);pos+=4+hdrLen;
    while(pos<buf.byteLength){
        if(dv.getUint32(pos)!==0x4D54726B)break;
        pos+=4;
        const trackLen=dv.getUint32(pos);pos+=4;
        const trackEnd=pos+trackLen;
        let runningStatus=0;
        while(pos<trackEnd){
            let delta=0,b;
            do{b=dv.getUint8(pos++);delta=(delta<<7)|(b&0x7f)}while(b&0x80);
            let status=dv.getUint8(pos);
            if(status<0x80){status=runningStatus;pos--;}
            else{pos++;runningStatus=status;}
            const cmd=status&0xF0;
            if(cmd===0x90||cmd===0x80){
                const pitch=dv.getUint8(pos++);
                const velocity=dv.getUint8(pos++);
                notes.push({pitch,velocity,status,pos:pos-2});
            }else if(cmd===0xC0||cmd===0xD0){pos++}
            else if(cmd===0xF0){
                if(status===0xFF){
                    const type=dv.getUint8(pos++);
                    let len=0;do{b=dv.getUint8(pos++);len=(len<<7)|(b&0x7f)}while(b&0x80);
                    pos+=len;
                }else{pos++;while(dv.getUint8(pos++)&0x80);}
            }else{pos+=2} // 0xA0/0xB0/0xE0: 2 data bytes
        }
        pos=trackEnd;
    }
    return notes;
}

// ─── Velocity LSB 编码 ───
function midiEncode(buf,bits){
    const bytes=new Uint8Array(buf);
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let pos=0,bitIdx=0;
    if(dv.getUint32(0)!==0x4D546864)throw new Error('不是标准 MIDI 文件');
    pos+=4;pos+=4+dv.getUint32(pos);
    while(pos<bytes.length&&bitIdx<bits.length){
        if(dv.getUint32(pos)!==0x4D54726B)break;
        pos+=4;const trackLen=dv.getUint32(pos);pos+=4;
        const trackEnd=pos+trackLen;
        let runningStatus=0;
        while(pos<trackEnd&&bitIdx<bits.length){
            let delta=0,b;
            do{b=bytes[pos++];delta=(delta<<7)|(b&0x7f)}while(b&0x80);
            let status=bytes[pos];
            if(status<0x80){status=runningStatus;pos--;}
            else{pos++;runningStatus=status;}
            const cmd=status&0xF0;
            if(cmd===0x90||cmd===0x80){
                const pitch=bytes[pos++];
                const velPos=pos;
                const vel=bytes[pos++];
                if(vel>1&&bitIdx<bits.length){
                    const newVel=((vel&0xFE)|bits[bitIdx])||1;
                    bytes[velPos]=newVel;
                    bitIdx++;
                }
            }else if(cmd===0xC0||cmd===0xD0){pos++}
            else if(cmd===0xF0){
                if(status===0xFF){const type=bytes[pos++];let len=0;do{b=bytes[pos++];len=(len<<7)|(b&0x7f)}while(b&0x80);pos+=len;}
                else{pos++;while(bytes[pos++]&0x80);}
            }else{pos+=2}
        }
        pos=trackEnd;
    }
    return {bytes,encodedBits:bitIdx};
}

// ─── Velocity LSB 解码 ───
function midiDecode(buf){
    const notes=parseMidiNotes(buf);
    const bits=[];
    for(const n of notes){
        if(n.velocity>1)bits.push(n.velocity&1);
    }
    return bits;
}

// ─── 发送方：加密 + 编码 → 分享 .mid ───
async function midiEncodeAndShare(){
    const songId=document.getElementById('midiSongSelect').value;
    const plain=document.getElementById('midiPlainInput').value.trim();
    const pw=gp();
    const status=document.getElementById('midiEncodeStatus');
    if(!songId){status.textContent='⚠️ 请先选择歌曲';return t('请先选择歌曲');}
    if(!plain){status.textContent='⚠️ 请输入明文';return t('请输入明文');}
    if(!pw){status.textContent='⚠️ 请先设置共享密码';return t('请先设置共享密码');}
    if(!_midiMeta||!_midiMeta.songs[songId]){status.textContent='⚠️ 歌曲元数据未加载';return t('歌曲元数据未加载');}
    const song=_midiMeta.songs[songId];
    status.textContent='🔒 正在加密…';
    try{
        const k=await dk(pw);
        const n=crypto.getRandomValues(new Uint8Array(NS));
        const c=await crypto.subtle.encrypt({name:'AES-GCM',iv:n},k,new TextEncoder().encode(plain));
        const m=new Uint8Array(n.length+c.byteLength);m.set(n);m.set(new Uint8Array(c),n.length);
        const b64=btoa(String.fromCharCode(...m));
        const bits=[];
        for(const ch of b64){
            const idx=B64.indexOf(ch);
            if(idx<0)continue;
            for(let j=5;j>=0;j--)bits.push((idx>>j)&1);
        }
        // Prepend 16-bit length header (big-endian)
        const headerLen = bits.length;
        const headerBits = [];
        for(let j=15; j>=0; j--) headerBits.push((headerLen >> j) & 1);
        const fullBits = headerBits.concat(bits);

        if(fullBits.length>song.encodable){
            status.textContent=`⚠️ 密文+头需要 ${fullBits.length} bits，歌曲只有 ${song.encodable} bits`;
            return;
        }
        status.textContent='🎹 正在加载原始 MIDI…';
        const origBuf=await loadMidiOriginal(songId);
        status.textContent='🔐 正在编码…';
        const {bytes,encodedBits}=midiEncode(origBuf,fullBits);
        status.textContent=`📦 已编码 ${encodedBits} bits，正在生成文件…`;
        const blob=new Blob([bytes],{type:'audio/midi'});
        // 文件名带时间戳：SongName_20260627_143021.mid
        const now=new Date();
        const ts=now.getFullYear()+
            String(now.getMonth()+1).padStart(2,'0')+
            String(now.getDate()).padStart(2,'0')+'_'+
            String(now.getHours()).padStart(2,'0')+
            String(now.getMinutes()).padStart(2,'0')+
            String(now.getSeconds()).padStart(2,'0');
        const fileName=song.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff _-]/g,'')+'_'+ts+'.mid';
        const file=new File([blob],fileName,{type:'audio/midi'});
        // 优先 Web Share API（手机端弹出系统分享面板），桌面端自动回退下载
        if(navigator.share){
            try{
                await navigator.share({title:'SwiftCrypto MIDI',text:song.name, files:[file]});
                t('✅ 已分享 .mid 文件！');
            }catch(e){
                if(e.name==='AbortError'){t('👋 已取消分享'); return;}
                midiDownloadFallback(blob,fileName,status,encodedBits,song);
            }
        }else{
            midiDownloadFallback(blob,fileName,status,encodedBits,song);
        }
        status.textContent=`✅ 编码完成 — ${encodedBits} bits 已嵌入 "${song.name}"`;
        // 存储编码后的 MIDI 数据供播放
        _acPlaybackBuf=bytes.buffer.slice(0);
        document.getElementById('midiPlayRow').style.display='';
        _updatePlayBtn();
        autoSavePwd();
    }catch(e){
        status.textContent='❌ '+e.message;
        t('❌ '+e.message);
    }
}
function midiDownloadFallback(blob,fileName,status,encodedBits,song){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=fileName;a.click();
    URL.revokeObjectURL(url);
    t('📥 已下载 .mid 文件，请发送给接收方');
}

// ─── 接收方：打开 .mid → 解码 → 解密 ───
function midiDecodeFromFile(){
    const file=document.getElementById('midiFileInput').files[0];
    if(!file)return;
    const songId=document.getElementById('midiSongSelect').value;
    const pw=gp();
    const status=document.getElementById('midiDecodeStatus');
    if(!songId){status.textContent='⚠️ 请先选择与发送方相同的歌曲';return t('请先选择与发送方相同的歌曲');}
    if(!pw){status.textContent='⚠️ 请先设置共享密码';return t('请先设置共享密码');}
    status.textContent='📖 正在读取文件…';
    const reader=new FileReader();
    reader.onload=async function(){
        try{
            const buf=reader.result;
            
            // ── SHA-256 哈希校验：对比原始 MIDI，确认文件确实被修改过 ──
            status.textContent='🔍 正在校验文件完整性…';
            const origBuf=await loadMidiOriginal(songId);
            const [recvHash,origHash]=await Promise.all([
                crypto.subtle.digest('SHA-256',buf),
                crypto.subtle.digest('SHA-256',origBuf)
            ]);
            const hashMatch=compareArrayBuffers(recvHash,origHash);
            if(hashMatch){
                status.textContent='⚠️ 此文件与原始 MIDI 完全相同，未检测到隐写数据';
                t('⚠️ 文件未修改，没有隐藏信息');
                return;
            }
            
            status.textContent='🔍 正在提取比特…';
            const bits=midiDecode(buf);

            // Read 16-bit length header
            let dataLen = 0;
            for(let j=0; j<16; j++) dataLen = (dataLen << 1) | (bits[j] || 0);

            // Validate
            if(dataLen < 1 || dataLen > bits.length - 16) {
                status.textContent='❌ 未识别的 MIDI 隐写格式（长度头无效）';
                return;
            }

            // Extract only the data bits
            let b64='';
            const dataBits = bits.slice(16, 16 + dataLen);
            for(let i=0;i+5<dataBits.length;i+=6){
                let idx=0;
                for(let j=0;j<6;j++)idx=(idx<<1)|(dataBits[i+j]||0);
                b64+=B64[idx];
            }
            while(b64.length%4)b64+='=';
            status.textContent='🔓 正在解密…';
            const k=await dk(pw);
            const r=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
            const p=await crypto.subtle.decrypt({name:'AES-GCM',iv:r.slice(0,NS)},k,r.slice(NS));
            let pt=new TextDecoder().decode(p);
            const sd=checkSelfDestruct(pt);
            document.getElementById('midiPlainOutput').value=sd.message;
            status.textContent=sd.wasSD?`✅ 解码成功！(🔥 剩余 ${fmtRemaining(sd.remaining)} 后焚毁)`:'✅ 解码成功！';
            // 存储解码的 MIDI 数据供播放
            _acPlaybackBuf=buf.slice(0);
            document.getElementById('midiPlayRow').style.display='';
            _updatePlayBtn();
            t(sd.wasSD?'🔥 解密成功，剩余 '+fmtRemaining(sd.remaining)+' 后焚毁':'✅ 解密成功');
            autoSavePwd();
        }catch(e){
            status.textContent='❌ '+e.message;
            t(e.name==='OperationError'?'❌ 密码错误，请确认与发送方使用相同密码':'❌ '+e.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ─── 工具：比较两个 ArrayBuffer ───
function compareArrayBuffers(a,b){
    if(a.byteLength!==b.byteLength)return false;
    const ua=new Uint8Array(a),ub=new Uint8Array(b);
    for(let i=0;i<ua.length;i++)if(ua[i]!==ub[i])return false;
    return true;
}

// ═══════════════════════════════════════════════════════════════
// 🎹 音频播放 + 🎧 WAV导出 (AudioContext 加法合成钢琴)
// ═══════════════════════════════════════════════════════════════
let _acCtx=null,_acTimer=null,_acEvents=[],_acComp=null,_acMaster=null;
let _acIdx=0,_acStart=0,_acPausedAt=0,_acPlaybackBuf=null;
let _acPlaying=false,_acPaused=false;

function _acComputeDurations(events){
    for(let i=0;i<events.length;i++){
        const e=events[i];
        if((e.bytes[0]&0xF0)===0x90&&e.bytes[2]>0){
            const note=e.bytes[1];let endT=e.time/1000+2;
            for(let j=i+1;j<events.length;j++){
                const ej=events[j];
                if(((ej.bytes[0]&0xF0)===0x80||((ej.bytes[0]&0xF0)===0x90&&ej.bytes[2]===0))&&ej.bytes[1]===note){
                    endT=ej.time/1000;break;
                }
            }
            events[i].duration=Math.max(0.15,endT-e.time/1000);
        }
    }
}

function _acEnsureCtx(){
    if(_acCtx&&_acCtx.state!=='closed')return;
    _acCtx=new AudioContext();
    _acMaster=_acCtx.createGain();_acMaster.gain.value=0.5;_acMaster.connect(_acCtx.destination);
    _acComp=_acCtx.createDynamicsCompressor();
    _acComp.threshold.value=-22;_acComp.knee.value=6;_acComp.ratio.value=3.5;
    _acComp.attack.value=0.002;_acComp.release.value=0.2;
    _acComp.connect(_acMaster);
}

function _acSchedule(){
    if(!_acCtx||_acIdx>=_acEvents.length){audioStop();return}
    const now=_acCtx.currentTime,elapsed=now-_acStart;
    while(_acIdx<_acEvents.length){
        const evt=_acEvents[_acIdx];
        const evtT=evt.time/1000+_acPausedAt;
        if(evtT-elapsed>0.12)break;
        if((evt.bytes[0]&0xF0)===0x90&&evt.bytes[2]>0){
            const freq=440*Math.pow(2,(evt.bytes[1]-69)/12);
            const startT=now+Math.max(0,evtT-elapsed);
            _createPianoVoice(_acCtx,freq,evt.bytes[2]/127,startT,evt.duration||0.8,_acComp);
        }
        _acIdx++;
    }
    if(_acIdx>=_acEvents.length){
        const last=_acEvents[_acEvents.length-1];
        const endT=last.time/1000+(last.duration||1)+_acPausedAt+0.5;
        _acTimer=setTimeout(()=>audioStop(),Math.max(500,(endT-elapsed)*1000));
    }else{
        _acTimer=setTimeout(_acSchedule,60);
    }
}

function audioPlay(buf){
    if(!buf)return;
    audioStop();
    _acEnsureCtx();
    _acPlaybackBuf=buf;
    _acEvents=parseMidiTimedEvents(buf);
    _acComputeDurations(_acEvents);
    _acIdx=0;_acStart=_acCtx.currentTime;_acPausedAt=0;
    _acPlaying=true;_acPaused=false;
    _updatePlayBtn();
    _acSchedule();
}

function audioPause(){
    if(!_acPlaying||_acPaused)return;
    _acPausedAt+=_acCtx.currentTime-_acStart;
    if(_acTimer){clearTimeout(_acTimer);_acTimer=null}
    _acCtx.suspend();
    _acPaused=true;_updatePlayBtn();
}

function audioResume(){
    if(!_acPaused)return;
    _acCtx.resume();
    _acStart=_acCtx.currentTime;_acPaused=false;
    _updatePlayBtn();_acSchedule();
}

function audioStop(){
    if(_acTimer){clearTimeout(_acTimer);_acTimer=null}
    if(_acCtx&&_acCtx.state!=='closed'){
        try{_acCtx.close()}catch(e){}
        _acCtx=null;_acComp=null;_acMaster=null;
    }
    _acEvents=[];_acIdx=0;_acPausedAt=0;
    _acPlaying=false;_acPaused=false;
    _updatePlayBtn();
}

function midiTogglePlay(){audioTogglePlay()}
function midiStop(){audioStop()}
function midiPlay(buf){audioPlay(buf)}
function midiPause(){audioPause()}
function midiResume(){audioResume()}
function audioTogglePlay(){
    if(_acPaused)audioResume();else if(_acPlaying)audioPause();else audioPlay(_acPlaybackBuf);
}

function _updatePlayBtn(){
    const btn=document.getElementById('midiPlayBtn');
    if(!btn)return;
    const row=document.getElementById('midiPlayRow');
    if(_acPlaying&&!_acPaused){btn.textContent='⏸️ 暂停';row.style.display=''}
    else if(_acPaused){btn.textContent='▶️ 继续';row.style.display=''}
    else{btn.textContent='▶️ 播放';if(!_acPlaybackBuf)row.style.display='none'}
}

// ─── 🎧 WAV 导出（轻量版：限制时长防卡死）───
async function midiExportWav(){
    if(!_acPlaybackBuf){t('⚠️ 请先编码或解码 MIDI');return}
    const status=document.getElementById('midiEncodeStatus');
    try{
        status.textContent='🎧 正在合成音频…';
        // 限制最长 5 分钟（300s），防止超大文件卡死
        const MAX_DURATION=300;
        const rawEvents=parseMidiTimedEvents(_acPlaybackBuf);
        if(!rawEvents.length)throw new Error('MIDI 无音符');
        _acComputeDurations(rawEvents);
        const lastEvt=rawEvents[rawEvents.length-1];
        const totalDuration=Math.min(lastEvt.time/1000+(lastEvt.duration||1)+1.5,MAX_DURATION);
        const sampleRate=44100;
        const ctx=new OfflineAudioContext(2,Math.ceil(sampleRate*totalDuration),sampleRate);
        const master=ctx.createGain();master.gain.value=0.5;master.connect(ctx.destination);
        const comp=ctx.createDynamicsCompressor();
        comp.threshold.value=-22;comp.knee.value=6;comp.ratio.value=3.5;
        comp.attack.value=0.002;comp.release.value=0.2;
        comp.connect(master);
        // 仅渲染时长内的音符
        let voiceCount=0;
        for(const evt of rawEvents){
            if(evt.time/1000>totalDuration)break;
            if((evt.bytes[0]&0xF0)===0x90&&evt.bytes[2]>0){
                const freq=440*Math.pow(2,(evt.bytes[1]-69)/12);
                const dur=Math.min(evt.duration||0.8,totalDuration-evt.time/1000+0.5);
                _createPianoVoice(ctx,freq,evt.bytes[2]/127,evt.time/1000,dur,comp);
                voiceCount++;
            }
        }
        status.textContent=`🎧 合成 ${voiceCount} 个音符…`;
        const rendered=await ctx.startRendering();
        const wav=_audioBufferToWav(rendered);
        const blob=new Blob([wav],{type:'audio/wav'});
        const name=(document.getElementById('midiSongInfo')?.textContent?.split('|').pop()?.trim()||'midi')+'.wav';
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff _.-]/g,'');a.click();
        URL.revokeObjectURL(url);
        t('✅ WAV 已导出');
        status.textContent='✅ WAV 导出完成';
    }catch(e){
        status.textContent='❌ '+e.message;
        t('❌ '+e.message);
    }
}

function _createPianoVoice(ctx,freq,velocity,startTime,duration,dest){
    const harmonics=[1,0.5,0.2,0.07,0.025,0.01];
    for(let h=0;h<harmonics.length;h++){
        const osc=ctx.createOscillator();
        const env=ctx.createGain();
        osc.type=h===0?'sine':(h===1?'triangle':'sine');
        // 跳过超出奈奎斯特频率的泛音
        const hFreq=freq*(h+1);
        if(hFreq>20000)continue;
        osc.frequency.value=hFreq*((h>0)?1.0005:1);
        const now=startTime;
        const attack=0.006+velocity*0.012;
        const decay=h===0?0.28:0.1;
        const sustain=h===0?0.55*velocity:0.3*velocity;
        const release=Math.min(duration*0.28,1.0);
        env.gain.setValueAtTime(0,now);
        env.gain.linearRampToValueAtTime(harmonics[h]*velocity,now+attack);
        env.gain.linearRampToValueAtTime(harmonics[h]*sustain,now+attack+decay);
        env.gain.setValueAtTime(harmonics[h]*sustain,now+duration);
        env.gain.linearRampToValueAtTime(0,now+duration+release);
        osc.connect(env);env.connect(dest);
        osc.start(now);osc.stop(now+duration+release+0.05);
    }
}

function _audioBufferToWav(buffer){
    const nc=buffer.numberOfChannels,sr=buffer.sampleRate,len=buffer.length;
    const bps=2,ba=nc*bps,ds=len*ba,buf=new ArrayBuffer(44+ds);
    const v=new DataView(buf);
    const ws=(off,s)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i))};
    ws(0,'RIFF');v.setUint32(4,36+ds,true);ws(8,'WAVE');
    ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
    v.setUint16(22,nc,true);v.setUint32(24,sr,true);
    v.setUint32(28,sr*ba,true);v.setUint16(32,ba,true);v.setUint16(34,bps*8,true);
    ws(36,'data');v.setUint32(40,ds,true);
    let off=44;
    for(let i=0;i<len;i++)for(let ch=0;ch<nc;ch++){
        const s=Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));
        v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
    }
    return buf;
}
