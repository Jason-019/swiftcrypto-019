// ═══════════════════════════════════════════════════════════════
// 🎹 MIDI 播放引擎 (SpessaSynth + FluidR3 GM SoundFont)
// ═══════════════════════════════════════════════════════════════
let _ssSynth=null,_ssReady=false,_ssLoading=false;
let _ssStart=0,_ssPausedAt=0,_ssPlaying=false,_ssPaused=false;
let _ssPlaybackBuf=null,_ssTimer=null,_ssEvents=[],_ssIdx=0;
const SS_CDN='https://esm.sh/spessasynth_lib@4.3.8';
const SS_SF='soundfonts/FluidR3Mono_GM.sf3';

// ── 加载 SpessaSynth + 音色库 ──
async function ssInit(){
    if(_ssReady)return;
    if(_ssLoading)return;
    _ssLoading=true;
    const status=document.getElementById('midiEncodeStatus');
    try{
        status.textContent='🎹 加载合成引擎…';
        const mod=await import(SS_CDN);
        status.textContent='🎹 加载音色库 (14MB)…';
        const sfBuf=await(await fetch(SS_SF)).arrayBuffer();
        const actx=new AudioContext();
        // Worklet 必须同源，已放在 web/lib/ 下
        await actx.audioWorklet.addModule('lib/spessasynth_processor.min.js');
        const synth=new mod.WorkletSynthesizer(actx);
        await synth.soundBankManager.addSoundBank(sfBuf,'gm');
        await synth.isReady;
        synth.programChange(0,0); // Acoustic Grand Piano
        // 连接输出并确保 AudioContext 运行
        synth.connect(actx.destination);
        await actx.resume();
        _ssSynth=synth;_ssReady=true;
        status.textContent='✅ 音色库就绪';
    }catch(e){
        status.textContent='❌ '+e.message;
        console.error('ssInit:',e);
        t('❌ MIDI引擎加载失败: '+e.message);
    }
    _ssLoading=false;
}

// ── 辅助：计算 MIDI 事件的绝对时间和时长 ──
function _ssParseEvents(buf){
    const dv=new DataView(buf),events=[];
    let pos=0;
    if(dv.getUint32(pos)!==0x4D546864)throw new Error('不是标准 MIDI 文件');
    pos+=4;const hdrLen=dv.getUint32(pos);pos+=4;
    pos+=2;const tracks=dv.getUint16(pos);pos+=2;
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
            const cmd=status&0xF0,ch=status&0x0F;
            const ms=tickTime*usPerQuarter/tpqn/1000;
            if(cmd===0x90||cmd===0x80){
                const note=dv.getUint8(pos++),vel=dv.getUint8(pos++);
                events.push({time:ms,ch,cmd,note,vel});
            }else if(cmd===0xC0||cmd===0xD0){
                const v=dv.getUint8(pos++);
                events.push({time:ms,ch,cmd,val:v});
            }else if(cmd===0xF0){
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

// ── 调度器 ──
function _ssSchedule(){
    if(!_ssSynth||_ssIdx>=_ssEvents.length){_ssFinish();return}
    const now=_ssSynth.currentTime,elapsed=now-_ssStart;
    while(_ssIdx<_ssEvents.length){
        const e=_ssEvents[_ssIdx];
        const t=e.time/1000+_ssPausedAt;
        if(t-elapsed>0.15)break;
        if(e.cmd===0x90&&e.vel>0)_ssSynth.noteOn(e.ch,e.note,e.vel);
        else if(e.cmd===0x80||(e.cmd===0x90&&e.vel===0))_ssSynth.noteOff(e.ch,e.note);
        else if(e.cmd===0xC0)_ssSynth.programChange(e.ch,e.val);
        _ssIdx++;
    }
    if(_ssIdx>=_ssEvents.length){
        const last=_ssEvents[_ssEvents.length-1];
        const endT=last.time/1000+_ssPausedAt+3;
        _ssTimer=setTimeout(()=>_ssFinish(),Math.max(500,(endT-elapsed)*1000));
    }else{
        _ssTimer=setTimeout(_ssSchedule,40);
    }
}

// ── 发送 MIDI CC 静音所有通道 ──
function _ssAllNotesOff(){
    if(!_ssSynth)return;
    try{
        for(let ch=0;ch<16;ch++){_ssSynth.controllerChange(ch,123,0);_ssSynth.controllerChange(ch,120,0);}
    }catch(e){
        for(let ch=0;ch<16;ch++)for(let n=0;n<128;n++)try{_ssSynth.noteOff(ch,n)}catch(e){}
    }
}

// ── 公开 API ──
async function ssPlay(buf){
    if(!buf)return;
    ssStop();
    await ssInit();
    if(!_ssReady)return;
    _ssPlaybackBuf=buf;
    _ssEvents=_ssParseEvents(buf);
    _ssIdx=0;_ssStart=_ssSynth.currentTime;_ssPausedAt=0;
    _ssPlaying=true;_ssPaused=false;
    _ssUpdateBtn();
    document.getElementById('midiPlayRow').style.display='flex';
    _ssSchedule();
}

function ssTogglePlay(){
    if(_ssPaused)ssResume();else if(_ssPlaying)ssPause();else ssPlay(_ssPlaybackBuf);
}

function ssPause(){
    if(!_ssPlaying||_ssPaused)return;
    _ssPausedAt+=_ssSynth.currentTime-_ssStart;
    if(_ssTimer){clearTimeout(_ssTimer);_ssTimer=null}
    _ssAllNotesOff();
    _ssPaused=true;_ssUpdateBtn();
}

function ssResume(){
    if(!_ssPaused)return;
    _ssStart=_ssSynth.currentTime;_ssPaused=false;
    _ssUpdateBtn();_ssSchedule();
}

function ssStop(){
    if(_ssTimer){clearTimeout(_ssTimer);_ssTimer=null}
    _ssAllNotesOff();
    _ssEvents=[];_ssIdx=0;_ssPausedAt=0;
    _ssPlaying=false;_ssPaused=false;
    _ssUpdateBtn();
}

function _ssFinish(){
    if(_ssTimer){clearTimeout(_ssTimer);_ssTimer=null}
    _ssEvents=[];_ssIdx=0;_ssPausedAt=0;
    _ssPlaying=false;_ssPaused=false;
    _ssUpdateBtn();
}
    _ssUpdateBtn();
}

function _ssUpdateBtn(){
    const btn=document.getElementById('midiPlayBtn');
    if(!btn)return;
    const row=document.getElementById('midiPlayRow');
    if(_ssPlaying&&!_ssPaused){btn.textContent='⏸️ 暂停';row.style.display='flex'}
    else if(_ssPaused){btn.textContent='▶️ 继续';row.style.display='flex'}
    else{btn.textContent='▶️ 播放';if(!_ssPlaybackBuf)row.style.display='none'}
}

// ── WAV 导出 ──
async function ssExportWav(){
    t('⚠️ WAV导出暂不可用，请使用播放功能');
}

// ── 暴露到全局 ──
window.midiTogglePlay=ssTogglePlay;
window.midiStop=ssStop;
window.midiExportWav=ssExportWav;
window._ssSetBuf=(b)=>{_ssPlaybackBuf=b;};

// ── WAV 编码 ──
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
