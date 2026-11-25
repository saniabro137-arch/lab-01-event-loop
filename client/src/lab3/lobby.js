import {fetchJson} from './assets.js';
export class Lobby extends EventTarget {
  controller=null; timer=null;
  start(){this.stop();this.controller=new AbortController();const signal=this.controller.signal;const refresh=async()=>{try{const rooms=await fetchJson('/api/rooms',AbortSignal.any([signal,AbortSignal.timeout(4000)]));if(!signal.aborted)this.dispatchEvent(new CustomEvent('rooms',{detail:rooms}));}catch(e){if(!signal.aborted)this.dispatchEvent(new CustomEvent('failure',{detail:e.message}));}finally{if(!signal.aborted)this.timer=setTimeout(refresh,5000);}};void refresh();}
  stop(){this.controller?.abort();clearTimeout(this.timer);}
}
