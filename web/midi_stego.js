
// ═══════════════════════════════════════════════════════════════
// 🎵 MIDI 隐写传输 (Velocity LSB 编码)
// ═══════════════════════════════════════════════════════════════
let _midiMeta=null;
let _midiSDTimer=null;
let _midiRecvBuf=null; // 接收到的MIDI文件buffer，用于试听
let _midiRecvPlaying=false; // 接收文件独立播放状态
const _midiMetaUrl='midi_meta.json?v=3';

async function initMidiTab(){
    if(_midiMeta){return} // Already loaded
    try{
        const r=await fetch(_midiMetaUrl);
        if(!r.ok)throw new Error('HTTP '+r.status);
        _midiMeta=await r.json();
        if(typeof showMidiCacheStatus==='function') showMidiCacheStatus();
    }catch(e){console.warn('initMidiTab:',e)}
}

// ─── 🎹 MIDI 挑选 Modal ───
let _midiPendingSong=null;  // {id, name, encodable, base64}
let _midiLastAlbum='';       // 记住上次选的专辑

function openMidiPicker(){
    if(!_midiMeta){t('⚠️ 歌曲列表加载中…');return}
    renderMidiAlbumList();
    // Reset
    _midiPendingSong=null;
    const trigSong=document.getElementById('midiTrigSong');
    trigSong.disabled=true;
    trigSong.textContent='— 歌曲 —';
    document.getElementById('midiOptsSong').innerHTML='';
    document.getElementById('midiPickerPreview').textContent='';
    document.getElementById('midiConfirmBtn').disabled=true;
    document.getElementById('midiPickerModal').style.display='flex';
    // 恢复上次选择的专辑
    if(_midiLastAlbum&&_midiMeta.songs){
        const trigAlbum=document.getElementById('midiTrigAlbum');
        trigAlbum.textContent=_midiLastAlbum;
        populateMidiSongs(_midiLastAlbum);
        // 恢复上次选的歌曲
        const songId=document.getElementById('midiSongSelect').value;
        if(songId&&_midiMeta.songs[songId]&&_midiMeta.songs[songId].album===_midiLastAlbum){
            const s=_midiMeta.songs[songId];
            _midiPendingSong={id:songId,name:s.name,bits:s.bits,base64:s.base64_chars};
            trigSong.textContent=s.name;
            document.getElementById('midiPickerPreview').textContent=
                `📊 ${s.bits} bit | ≈${s.base64_chars} B64字符 | ≈${Math.max(0,Math.floor((s.base64_chars*3/4-28)/3))} 汉字`;
            document.getElementById('midiConfirmBtn').disabled=false;
        }
    }
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
    _midiLastAlbum=v;
    document.getElementById('midiTrigAlbum').textContent=v;
    midiToggleCS('midiCsAlbum');
    populateMidiSongs(v);
    _midiPendingSong=null;
    document.getElementById('midiPickerPreview').textContent='';
    document.getElementById('midiConfirmBtn').disabled=true;
}
function populateMidiSongs(album){
    const trig=document.getElementById('midiTrigSong');
    const o=document.getElementById('midiOptsSong');
    trig.disabled=false;trig.textContent='— 歌曲 —';
    const songs=[];
    for(const [id,s] of Object.entries(_midiMeta.songs)){
        if(s.album===album)songs.push({id,name:s.name,bits:s.bits,base64:s.base64_chars});
    }
    songs.sort((a,b)=>a.name.localeCompare(b.name));
    o.innerHTML=songs.map(s=>{
        const cn=Math.max(0,Math.floor((s.base64*3/4-28)/3));
        return `<div class="lcs-opt" data-v="${eh(s.id)}" data-name="${eh(s.name)}" data-bits="${s.bits}" data-b64="${s.base64}" onclick="midiPickSong(this)">${eh(s.name)} (${s.bits}bit ≈${cn}汉字)</div>`;
    }).join('');
}
function midiPickSong(el){
    _midiPendingSong={
        id:el.dataset.v,
        name:el.dataset.name,
        bits:parseInt(el.dataset.bits),
        base64:parseInt(el.dataset.b64)
    };
    document.getElementById('midiTrigSong').textContent=_midiPendingSong.name;
    document.getElementById('midiPickerPreview').textContent=
        `📊 ${_midiPendingSong.bits} bit | ≈${_midiPendingSong.base64} B64字符 | ≈${Math.max(0,Math.floor((_midiPendingSong.base64*3/4-28)/3))} 汉字`;
    document.getElementById('midiConfirmBtn').disabled=false;
    midiToggleCS('midiCsSong');
}
function confirmMidiPick(){
    if(!_midiPendingSong)return;
    const s=_midiPendingSong;
    document.getElementById('midiSongSelect').value=s.id;
    document.getElementById('midiSongInfo').textContent=
        `📊 ${s.bits} bit | ≈${s.base64} B64字符 | ≈${Math.max(0,Math.floor((s.base64*3/4-28)/3))} 汉字 | ${s.name}`;
    closeMidiPicker();
    updateMidiCapacity();
    // 清除接收缓冲区，启用播放
    _midiRecvBuf=null;
    _midiPlayBuf=null;
    document.getElementById('midiPlayBtn').disabled=false;
    document.getElementById('midiSongSelect').dataset.playId='';
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
    const totalBits=_midiMeta.songs[songId].bits;
    const totalB64=_midiMeta.songs[songId].base64_chars;
    // Empty text → show 0 usage, full remaining
    if(!plain.trim()){
        bar.style.width='0';bar.style.background='var(--accent)';
        const cnMax=Math.max(0,Math.floor((totalB64*3/4-28)/3));
        lbl.textContent=`0/${totalB64} B64字符 | 剩余 ≈${totalB64} 字符 ≈${cnMax} 汉字`;
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
    // 预估剩余中文字数：Base64→bytes 逆推, 减去28字节AES开销, UTF8每汉字≈3字节
    const cnRemain=Math.max(0,Math.floor((remainingB64*3/4-28)/3));
    lbl.textContent=`${cappedUsed}/${totalB64} B64字符 | 剩余 ≈${Math.max(0,remainingB64)} 字符 ≈${cnRemain} 汉字`;
    if(b64Used>totalB64)lbl.textContent+=` ⚠️`;
}
async function loadMidiOriginal(songId){
    if(!_midiMeta||!_midiMeta.songs[songId])throw new Error('未知歌曲');
    const s=_midiMeta.songs[songId];
    // Try cache first
    const cache=await caches.open('swiftcrypto-midi-v1');
    let r=await cache.match(s.file);
    if(!r){
        r=await fetch(s.file);
        if(r.ok) cache.put(s.file, r.clone());
    }
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
            if(status<0x80){status=runningStatus;/* running status: pos already at data */}
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
            if(status<0x80){status=runningStatus;/* running status: pos already at data */}
            else{pos++;runningStatus=status;}
            const cmd=status&0xF0;
            if(cmd===0x90||cmd===0x80){
                const pitch=bytes[pos++];
                const velPos=pos;
                const vel=bytes[pos++];
                if(vel>3&&bitIdx<bits.length){
                    const b0=bits[bitIdx],b1=(bitIdx+1<bits.length)?bits[bitIdx+1]:0;
                    const newVel=((vel&0xFC)|(b0|(b1<<1)))||0x03;
                    bytes[velPos]=newVel;
                    bitIdx+=2;
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
        if(n.velocity>3){
            bits.push(n.velocity&1);
            bits.push((n.velocity>>1)&1);
        }
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
        // 附加设备标识 + 定时焚毁
        const sdm=typeof getMidiSDMeta==='function'?getMidiSDMeta():'';
        const payload=sdm+'['+getDeviceId()+']'+plain;
        const c=await crypto.subtle.encrypt({name:'AES-GCM',iv:n},k,new TextEncoder().encode(payload));
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

        if(fullBits.length>song.bits){
            status.textContent=`⚠️ 密文+头需要 ${fullBits.length} bits，歌曲只有 ${song.bits} bits`;
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
        // Web Share API: 测试多种 MIME 类型绕过手机端文件检测
        if(navigator.share){
            let shared=false;
            // ① 尝试 application/octet-stream（通用二进制，手机更可能接受）
            const file1=new File([blob],fileName,{type:'application/octet-stream'});
            try{
                await navigator.share({title:'SwiftCrypto MIDI',text:song.name, files:[file1]});
                t('✅ 已分享 .mid 文件！');shared=true;
            }catch(e){if(e.name==='AbortError'){t('👋 已取消分享'); return;}}
            // ② 回退：audio/midi
            if(!shared){
                const file2=new File([blob],fileName,{type:'audio/midi'});
                try{
                    await navigator.share({title:'SwiftCrypto MIDI',text:song.name, files:[file2]});
                    t('✅ 已分享 .mid 文件！');shared=true;
                }catch(e){if(e.name==='AbortError'){t('👋 已取消分享'); return;}}
            }
            // ③ 文字分享 + 下载保底
            if(!shared){
                try{
                    const msg=`🎵 SwiftCrypto MIDI 隐写\n歌曲: ${song.name}\n接收方请用 SwiftCrypto 解码\nhttps://jason-019.github.io/swiftcrypto/`;
                    await navigator.share({title:'SwiftCrypto MIDI',text:msg});
                    t('✅ 已分享链接');shared=true;
                }catch(e2){if(e2.name==='AbortError'){t('👋 已取消分享'); return;}}
            }
            midiDownloadFallback(blob,fileName,status,encodedBits,song);
        }else{
            midiDownloadFallback(blob,fileName,status,encodedBits,song);
        }
        status.textContent=`✅ 编码完成 — ${encodedBits} bits 已嵌入 "${song.name}"`+(sdm?' 🔥 开启焚毁程序':'');
        // 同步密聊
        if(typeof chatMsgs!=='undefined'){
            const sdExp=sdm?parseInt(sdm.match(/^🔥(\d+)\|/)?.[1]||'0'):0;
            chatMsgs.push({role:'me',text:plain,cipher:b64,time:Date.now(),device:getDeviceId(),midi:true,songName:song.name,sd:!!sdm,sdExpiry:sdExp});
            if(typeof saveChat==='function')saveChat();
            if(document.getElementById('panelChat')&&document.getElementById('panelChat').classList.contains('active')&&typeof renderChat==='function')renderChat();
        }
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
            // 保存buffer供试听播放
            _midiRecvBuf=buf;
            document.getElementById('midiRecvPlayBtn').disabled=false;

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
            if(!sd.valid){document.getElementById('midiPlainOutput').value=sd.message;status.textContent='❌ 消息已过期';t(sd.message);return}
            // 解析设备标识: [设备ID]消息
            const m2=sd.message.match(/^\[(.+?)\]/);
            const senderId=m2?m2[1]:'未知';
            const displayText=m2?sd.message.slice(m2[0].length):sd.message;
            const showText=senderId!=='未知'?senderId+': '+displayText:displayText;
            document.getElementById('midiPlainOutput').value=showText;
            // SD 倒计时
            if(sd.wasSD){
                if(typeof _midiSDTimer!=='undefined'&&_midiSDTimer)clearInterval(_midiSDTimer);
                _midiSDTimer=setInterval(()=>{
                    const r=sd.expiry-Date.now();
                    const po=document.getElementById('midiPlainOutput');
                    if(r<=0){po.value='💨 此消息已过期焚毁';clearInterval(_midiSDTimer);_midiSDTimer=null;return}
                    po.value=showText+'\n\n⏳ 剩余 '+ (typeof fmtRemaining==='function'?fmtRemaining(r):Math.ceil(r/1000)+'秒') +' 后焚毁';
                },500);
            }
            // 同步密聊
            if(typeof chatMsgs!=='undefined'){
                const songName=_midiMeta&&_midiMeta.songs[songId]?_midiMeta.songs[songId].name:songId;
                chatMsgs.push({role:'them',text:displayText,cipher:b64,time:Date.now(),device:senderId,midi:true,songName,sd:sd.wasSD,sdExpiry:sd.expiry});
                if(typeof saveChat==='function')saveChat();
                if(document.getElementById('panelChat')&&document.getElementById('panelChat').classList.contains('active')&&typeof renderChat==='function')renderChat();
                if(sd.wasSD&&typeof startChatSDWatch==='function')startChatSDWatch();
            }
            status.textContent=sd.wasSD?`✅ 解码成功！(🔥 剩余 ${fmtRemaining(sd.remaining)} 后焚毁)`:'✅ 解码成功！';
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
// 🎧 MIDI 轻量播放 (Tone.js + Salamander 钢琴采样)
// ═══════════════════════════════════════════════════════════════
let _midiSynth=null,_midiPlaying=false,_midiPlayBuf=null;

async function initMidiSynth(){
    if(_midiSynth)return _midiSynth;
    if(typeof Tone==='undefined'){t('⚠️ Tone.js 未加载，无法播放');return null}
    await Tone.start();
    _midiSynth=new Tone.Sampler({
        urls:{
            A0:'A0.mp3',C1:'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',
            A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
            A2:'A2.mp3',C3:'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',
            A3:'A3.mp3',C4:'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
            A4:'A4.mp3',C5:'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',
            A5:'A5.mp3',C6:'C6.mp3','D#6':'Ds6.mp3','F#6':'Fs6.mp3',
            A6:'A6.mp3',C7:'C7.mp3','D#7':'Ds7.mp3','F#7':'Fs7.mp3',
            A7:'A7.mp3',C8:'C8.mp3'
        },
        release:1,
        baseUrl:'https://tonejs.github.io/audio/salamander/'
    }).toDestination();
    return _midiSynth;
}

function parseMidiTimedEvents(buf){
    const midi=new ToneMidi.Midi(buf);
    const events=[];
    let tick=0,lastTick=0;
    for(const track of midi.tracks){
        tick=0;
        for(const note of track.notes){
            events.push({type:'on',pitch:note.midi,velocity:Math.round(note.velocity*127),tick:note.ticks});
            events.push({type:'off',pitch:note.midi,tick:note.ticks+note.durationTicks});
        }
        // Also get tempo from track if available
        if(track.tempos)for(const t of track.tempos){
            events.push({type:'tempo',tempo:Math.round(t.bpm*1000),tick:t.ticks});
        }
    }
    // Convert BPM-based tempo to microseconds per quarter
    for(const e of events){
        if(e.type==='tempo') e.tempo=Math.round(60000000/e.tempo);
    }
    events.sort((a,b)=>a.tick-b.tick);
    return {events,division:midi.header.ppq||384};
}

async function toggleMidiPlay(){
    const btn=document.getElementById('midiPlayBtn');
    if(_midiPlaying){stopMidiPlay();return}
    const synth=await initMidiSynth();
    if(!synth)return;
    try{
        let buf=_midiRecvBuf||_midiPlayBuf;
        // If no buffer yet, try loading by song ID
        if(!buf){
            const songId=document.getElementById('midiSongSelect').value;
            if(!songId){t('⚠️ 请先挑选歌曲或接收MIDI文件');return}
            buf=await loadMidiOriginal(songId);
            _midiPlayBuf=buf;
        }
        const {events,division}=parseMidiTimedEvents(_midiPlayBuf);
        if(!events.length){t('⚠️ 无音符事件');return}
        // Find tempo
        let tempo=500000;
        for(const e of events){if(e.type==='tempo'){tempo=e.tempo;break}}
        const secPerTick=tempo/1000000/division;
        // Cancel previous and schedule with Transport
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position=0;
        const partEvents=[];
        for(const e of events){
            const t=e.tick*secPerTick;
            if(e.type==='on'){
                partEvents.push({time:t,note:Tone.Frequency(e.pitch,'midi').toNote(),velocity:e.velocity/127,duration:0});
            }
        }
        // Use a Part for scheduled note events
        const totalSec=events[events.length-1].tick*secPerTick;
        let lastNote={};
        const part=new Tone.Part((time,evt)=>{
            synth.triggerAttackRelease(evt.note,'8n',time,evt.velocity);
        },partEvents).start(0);
        // Stop callback
        Tone.Transport.schedule(()=>{
            Tone.Transport.stop();
            Tone.Transport.cancel();
            part.dispose();
            _midiPlaying=false;
            btn.textContent='▶ 试听';
            btn.style.color='';
        },totalSec+0.5);
        Tone.Transport.start();
        _midiPlaying=true;
        btn.textContent='⏹ 停止';
        btn.style.color='#ef4444';
    }catch(e){t('❌ 播放失败: '+e.message)}
}

function stopMidiPlay(){
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if(_midiSynth){_midiSynth.releaseAll()}
    _midiPlaying=false;
    const btn=document.getElementById('midiPlayBtn');
    btn.textContent='▶ 试听';
    btn.style.color='';
}

// ─── 📥 接收文件独立试听 ───
async function toggleRecvPlay(){
    const btn=document.getElementById('midiRecvPlayBtn');
    if(_midiRecvPlaying){stopRecvPlay();return}
    if(!_midiRecvBuf){t('⚠️ 请先接收MIDI文件');return}
    const synth=await initMidiSynth();
    if(!synth)return;
    try{
        const {events,division}=parseMidiTimedEvents(_midiRecvBuf);
        if(!events.length){t('⚠️ 无音符事件');return}
        let tempo=500000;
        for(const e of events){if(e.type==='tempo'){tempo=e.tempo;break}}
        const secPerTick=tempo/1000000/division;
        Tone.Transport.stop();Tone.Transport.cancel();Tone.Transport.position=0;
        const partEvents=[];
        for(const e of events){
            if(e.type==='on') partEvents.push({time:e.tick*secPerTick,note:Tone.Frequency(e.pitch,'midi').toNote(),velocity:e.velocity/127,duration:0});
        }
        const totalSec=events[events.length-1].tick*secPerTick;
        const part=new Tone.Part((time,evt)=>{
            synth.triggerAttackRelease(evt.note,'8n',time,evt.velocity);
        },partEvents).start(0);
        Tone.Transport.schedule(()=>{
            Tone.Transport.stop();Tone.Transport.cancel();part.dispose();
            _midiRecvPlaying=false;btn.textContent='▶ 试听收到的文件';btn.style.color='';
        },totalSec+0.5);
        Tone.Transport.start();
        _midiRecvPlaying=true;
        btn.textContent='⏹ 停止';
        btn.style.color='#ef4444';
    }catch(e){t('❌ 播放失败: '+e.message)}
}
function stopRecvPlay(){
    Tone.Transport.stop();Tone.Transport.cancel();
    if(_midiSynth){_midiSynth.releaseAll()}
    _midiRecvPlaying=false;
    const btn=document.getElementById('midiRecvPlayBtn');
    btn.textContent='▶ 试听收到的文件';
    btn.style.color='';
}
