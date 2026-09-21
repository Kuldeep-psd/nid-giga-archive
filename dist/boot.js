// Keep a useful retry route even when the ES module itself cannot be downloaded.
(() => {
  let ready=false;
  const fail=()=>{
    if(ready)return;
    const content=document.querySelector('#content');
    if(!content)return;
    content.setAttribute('aria-busy','false');
    content.innerHTML='<div class="empty-state" role="alert"><h1>The archive couldn’t start.</h1><p>Reload this page to try again.</p><button type="button" class="retry-button" id="retry-start">Try again</button></div>';
    document.querySelector('#retry-start').addEventListener('click',()=>location.reload());
  };
  const timeout=setTimeout(fail,20000);
  window.addEventListener('archive:boot',()=>{ready=true;clearTimeout(timeout)},{once:true});
  window.addEventListener('error',event=>{if(event.target?.id==='archive-app'){clearTimeout(timeout);fail()}},true);
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.toggle('collection-page',!new URLSearchParams(location.search).has('project')&&!['#about','#contact'].includes(location.hash));
  },{once:true});
})();
