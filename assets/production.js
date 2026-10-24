import {supabase,isConfigured} from './supabase.js';
const root=document.querySelector('#productionRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const nice=v=>String(v||'').replaceAll('_',' ');
const date=v=>v?new Date(v).toLocaleDateString('en-AU',{timeZone:'Australia/Melbourne',weekday:'long',year:'numeric',month:'long',day:'numeric'}):'Not set';
async function init(){
 if(!root)return;
 if(!isConfigured){root.innerHTML='<div class="notice error">Production queue connection is not configured.</div>';return;}
 const {data:{session}}=await supabase.auth.getSession();
 if(!session){root.innerHTML='<div class="notice error">Please <a href="account.html"><b>sign in</b></a> with your employee account first.</div>';return;}
 const access=await supabase.rpc('is_current_user_production_staff');
 if(access.error){root.innerHTML='<div class="notice error">'+esc(access.error.message)+'</div>';return;}
 if(!access.data){root.innerHTML='<div class="notice error">This account does not have production access. Ask the administrator to grant access.</div>';return;}
 const {data:orders,error}=await supabase.rpc('get_production_queue');
 if(error){root.innerHTML='<div class="notice error">'+esc(error.message)+'</div>';return;}
 const rows=orders||[];
 root.innerHTML='<div class="panel"><div class="panel-head"><h2>Active print jobs</h2><button class="btn small" data-refresh>Refresh</button></div><p class="muted">Sign in as '+esc(session.user.email)+'. Orders appear here after the deposit is confirmed and the admin creates the order.</p></div><div class="customer-quote-list">'+(rows.map(o=>'<article class="customer-quote-card"><div class="cq-head"><div><strong>'+esc(o.order_number)+'</strong><span>'+esc(nice(o.status))+'</span></div><span>'+esc(date(o.due_at))+'</span></div><div class="cq-body"><div class="cq-grid"><div><small>Customer</small><b>'+esc(o.customer_name)+'</b></div><div><small>Product</small><b>'+esc(o.product)+'</b></div><div><small>Quantity</small><b>'+esc(o.quantity)+'</b></div><div><small>Size</small><b>'+esc(o.size||'—')+'</b></div><div><small>Material</small><b>'+esc(o.material||'—')+'</b></div><div><small>Print sides</small><b>'+esc(o.print_sides||'—')+'</b></div><div><small>Finish</small><b>'+esc(o.finish||'—')+'</b></div><div><small>Design service</small><b>'+((o.design_service)?'Yes':'No')+'</b></div><div><small>Delivery / collection</small><b>'+esc(o.delivery_method||'—')+'</b></div></div>'+(o.notes?'<div class="cq-message"><strong>Job notes</strong><br>'+esc(o.notes)+'</div>':'')+'<h3>Artwork</h3><div class="file-list">'+((o.artworks||[]).map(f=>'<button class="file-button" data-artwork-path="'+esc(f.storage_path)+'">'+esc(f.original_name||'Open artwork')+'</button>').join('')||'<p class="muted">No artwork attached.</p>')+'</div></div></article>').join('')||'<div class="notice">No active production orders.</div>')+'</div>';
 root.addEventListener('click',async e=>{
  if(e.target.closest('[data-refresh]')){await init();return;}
  const file=e.target.closest('[data-artwork-path]');if(!file)return;
  const result=await supabase.storage.from('customer-files').createSignedUrl(file.dataset.artworkPath,600);
  if(result.error){alert(result.error.message);return;}
  window.open(result.data.signedUrl,'_blank','noopener,noreferrer');
 });
}
init().catch(error=>{if(root)root.innerHTML='<div class="notice error">Production queue could not load: '+esc(error?.message||'Unknown error')+'</div>';});