
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
        _midiPlaybackBuf=bytes.buffer.slice(0);
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
            _midiPlaybackBuf=buf.slice(0);
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
// 🎹 MIDI 播放 (Web MIDI API)
// ═══════════════════════════════════════════════════════════════
let _midiOutput=null,_midiPlayTimer=null,_midiPlayEvents=[];
let _midiPlayIdx=0,_midiPlayStart=0,_midiPausedAt=0,_midiPlaybackBuf=null;
let _midiPlaying=false,_midiPaused=false;

async function midiInitOutput(){
    if(_midiOutput)return true;
    try{const a=await navigator.requestMIDIAccess();const outs=[...a.outputs.values()];if(outs.length){_midiOutput=outs[0];return true}}
    catch(e){console.warn('Web MIDI:',e)}return false;
}

function parseMidiTimedEvents(buf){
    const dv=new DataView(buf),events=[];
    let pos=0;
    if(dv.getUint32(pos)!==0x4D546864)throw new Error('不是标准 MIDI 文件');
    pos+=4;const hdrLen=dv.getUint32(pos);pos+=4;
    const format=dv.getUint16(pos);pos+=2;
    const tracks=dv.getUint16(pos);pos+=2;
    const division=dv.getUint16(pos);pos+=2;
    const tpqn=(division&0x8000)?480:division;
    let usPerQuarter=500000;
    pos+=hdrLen-6;
    while(pos<buf.byteLength){
        if(dv.getUint32(pos)!==0x4D54726B)break;
        pos+=4;const trackLen=dv.getUint32(pos);pos+=4;
        const trackEnd=pos+trackLen;
        let runningStatus=0,tickTime=0;
        while(pos<trackEnd){
            let delta=0,b;
            do{b=dv.getUint8(pos++);delta=(delta<<7)|(b&0x7f)}while(b&0x80);
            tickTime+=delta;
            let status=dv.getUint8(pos);
            if(status<0x80){status=runningStatus;pos--;}
            else{pos++;runningStatus=status;}
            const cmd=status&0xF0;
            if(cmd===0x90||cmd===0x80){
                const note=dv.getUint8(pos++);
                const vel=dv.getUint8(pos++);
                const ms=tickTime*usPerQuarter/tpqn/1000;
                events.push({time:ms,bytes:[status,note,vel]});
            }else if(cmd===0xC0||cmd===0xD0){pos++}
            else if(cmd===0xF0){
                if(status===0xFF){
                    const type=dv.getUint8(pos++);
                    let len=0;do{b=dv.getUint8(pos++);len=(len<<7)|(b&0x7f)}while(b&0x80);
                    if(type===0x51&&len===3){usPerQuarter=(dv.getUint8(pos)<<16)|(dv.getUint8(pos+1)<<8)|dv.getUint8(pos+2)}
                    pos+=len;
                }else{pos++;while(dv.getUint8(pos++)&0x80);}
            }else{pos+=2}
        }
        pos=trackEnd;
    }
    events.sort((a,b)=>a.time-b.time);
    return events;
}

function _midiSchedule(){
    if(!_midiOutput||_midiPlayIdx>=_midiPlayEvents.length){midiStop();return}
    const now=performance.now(),elapsed=now-_midiPlayStart;
    while(_midiPlayIdx<_midiPlayEvents.length){
        const evt=_midiPlayEvents[_midiPlayIdx];
        if(evt.time+_midiPausedAt-elapsed>60)break;
        const t=now+Math.max(0,evt.time+_midiPausedAt-elapsed);
        _midiOutput.send(evt.bytes,t);
        _midiPlayIdx++;
    }
    if(_midiPlayIdx>=_midiPlayEvents.length){
        // All notes off after last event
        const lastT=_midiPlayEvents[_midiPlayEvents.length-1].time+_midiPausedAt;
        _midiPlayTimer=setTimeout(()=>midiStop(),Math.max(0,lastT-elapsed+200));
    }else{
        _midiPlayTimer=setTimeout(_midiSchedule,30);
    }
}

async function midiPlay(buf){
    if(!buf)return;
    midiStop();
    if(!await midiInitOutput()){t('⚠️ 需 Chrome + MIDI 输出设备（Windows 自带软波表）');return}
    _midiPlaybackBuf=buf;_midiPlayEvents=parseMidiTimedEvents(buf);
    _midiPlayIdx=0;_midiPlayStart=performance.now();_midiPausedAt=0;
    _midiPlaying=true;_midiPaused=false;
    _updatePlayBtn();
    _midiSchedule();
}

function midiTogglePlay(){
    if(_midiPaused)midiResume();else if(_midiPlaying)midiPause();else midiPlay(_midiPlaybackBuf);
}

function midiPause(){
    if(!_midiPlaying||_midiPaused)return;
    _midiPausedAt+=performance.now()-_midiPlayStart;
    if(_midiPlayTimer){clearTimeout(_midiPlayTimer);_midiPlayTimer=null}
    if(_midiOutput)_midiOutput.clear();
    _midiPaused=true;
    _updatePlayBtn();
}

function midiResume(){
    if(!_midiPaused)return;
    _midiPlayStart=performance.now();_midiPaused=false;
    _updatePlayBtn();
    _midiSchedule();
}

function midiStop(){
    if(_midiPlayTimer){clearTimeout(_midiPlayTimer);_midiPlayTimer=null}
    if(_midiOutput){_midiOutput.send([0xB0,0x7B,0x00]);_midiOutput.clear()}
    _midiPlayEvents=[];_midiPlayIdx=0;_midiPausedAt=0;
    _midiPlaying=false;_midiPaused=false;
    _updatePlayBtn();
}

function _updatePlayBtn(){
    const btn=document.getElementById('midiPlayBtn');
    if(!btn)return;
    const row=document.getElementById('midiPlayRow');
    if(_midiPlaying&&!_midiPaused){btn.textContent='⏸️ 暂停';row.style.display=''}
    else if(_midiPaused){btn.textContent='▶️ 继续';row.style.display=''}
    else{btn.textContent='▶️ 播放';if(!_midiPlaybackBuf)row.style.display='none'}
}
