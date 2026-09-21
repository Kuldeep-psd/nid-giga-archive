// Reserve each preview frame while loading; a failed thumbnail never blocks its map.
export function observePreviews(root){
  root.querySelectorAll('[data-preview]').forEach(frame=>{
    const image=frame.querySelector('img');
    if(!image||frame.dataset.observed)return;
    frame.dataset.observed='true';
    const settle=()=>{
      frame.classList.remove('is-loading');
      if(image.naturalWidth>0){frame.classList.add('is-loaded');return}
      frame.classList.add('preview-unavailable');
      const label=document.createElement('span');
      label.className='preview-fallback';label.textContent='Preview unavailable';
      // The containing link or button already names the destination.
      label.setAttribute('aria-hidden','true');frame.append(label);
    };
    if(image.complete)settle();
    else{image.addEventListener('load',settle,{once:true});image.addEventListener('error',settle,{once:true})}
  });
}
