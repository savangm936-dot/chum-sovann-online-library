(()=>{
'use strict';
const status=document.getElementById('pwaInstallStatus');
const button=document.getElementById('pwaInstallButton');
let installEvent=null;
const isiOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
const setStatus=txt=>{if(status) status.textContent=txt;};
const showInstructions=()=>setStatus(isiOS?'នៅ Safari: ចុច Share (រូបការ៉េមានព្រួញឡើង) → Add to Home Screen → Add។':'នៅ Chrome/Android: បើកម៉ឺនុយ ⋮ → Install app ឬ Add to Home screen។');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;if(button)button.hidden=false;setStatus('App រួចរាល់សម្រាប់ដំឡើង។');});
window.addEventListener('appinstalled',()=>{installEvent=null;if(button)button.hidden=true;setStatus('✅ បានដំឡើង Sovann sense លើឧបករណ៍។');});
if(button)button.addEventListener('click',async()=>{
 if(installEvent){installEvent.prompt();const outcome=await installEvent.userChoice;setStatus(outcome.outcome==='accepted'?'បានទទួលសំណើដំឡើង App។':'អ្នកអាចដំឡើង App ពេលក្រោយបាន។');installEvent=null;}
 else showInstructions();
});
if('serviceWorker' in navigator&&window.isSecureContext){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(()=>setStatus('មិនអាចដំឡើងសម្រាប់ Offline នៅពេលនេះបាន។')));}
if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){if(button)button.hidden=true;setStatus('✅ កំពុងប្រើ Sovann sense ជា App');}
else if(!window.isSecureContext)setStatus('ដើម្បីដំឡើងជា App សូមបង្ហោះវេបសាយទៅ HTTPS (ឧ. GitHub Pages) ជាមុន។');
else showInstructions();
})();