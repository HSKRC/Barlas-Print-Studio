import{supabase,isConfigured}from'./supabase.js';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(+n||0);
$$('.year').forEach(x=>x.textContent=new Date().getFullYear());
const msg=(el,t,ok=true)=>{if(el){el.textContent=t;el.style.borderLeftColor=ok?'#00b8e6':'#e6007e'}};
const accountUrl=()=>new URL('account.html',location.href).href.split('?')[0].split('#')[0];
async function session(){return isConfigured?(await supabase.auth.getSession()).data.session:null}

const requestedService=new URLSearchParams(location.search).get('service');
if(requestedService&&$('#quoteForm [name="product"]')){
  const sel=$('#quoteForm [name="product"]');
  if([...sel.options].some(o=>o.value===requestedService))sel.value=requestedService;
}

const quote=$('#quoteForm');
if(quote)quote.addEventListener('submit',async e=>{
  e.preventDefault();
  const m=$('#quoteMsg');
  if(!isConfigured)return msg(m,'Supabase is not connected.',false);
  const fd=new FormData(quote),s=await session();
  const row={user_id:s?.user?.id||null,full_name:fd.get('full_name'),email:fd.get('email'),phone:fd.get('phone'),product:fd.get('product'),quantity:+fd.get('quantity'),size:fd.get('size'),paper:fd.get('paper'),print_sides:fd.get('print_sides'),finish:fd.get('finish'),design_service:fd.get('design_service')==='yes',notes:fd.get('notes')};
  const input=$('#artwork'),files=[...(input?.files||[])];

  if(!s){
    const{data,error}=await supabase.rpc('submit_guest_quote',{
      p_full_name:row.full_name,
      p_email:row.email,
      p_phone:row.phone||null,
      p_product:row.product,
      p_quantity:row.quantity,
      p_size:row.size||null,
      p_paper:row.paper||null,
      p_print_sides:row.print_sides||'single',
      p_finish:row.finish||'standard',
      p_design_service:row.design_service,
      p_notes:row.notes||null,
      p_website:fd.get('website')||null
    });
    if(error)return msg(m,error.message,false);
    msg(m,files.length
      ?'Quote #'+data+' received. Save this quote number. Sign in and claim it from your account to upload artwork and track progress.'
      :'Quote #'+data+' received. Save this quote number so you can claim it later from your account.');
    quote.reset();
    return;
  }

  const{data,error}=await supabase.from('quote_requests').insert(row).select('id').single();
  if(error)return msg(m,error.message,false);

  if(files.length){
    for(const file of files){
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=s.user.id+'/quotes/'+data.id+'/'+Date.now()+'-'+safe;
      const up=await supabase.storage.from('customer-files').upload(path,file,{upsert:false,contentType:file.type});
      if(up.error)return msg(m,'Quote #'+data.id+' saved, but artwork upload failed: '+up.error.message,false);
      const meta=await supabase.from('quote_files').insert({quote_id:data.id,user_id:s.user.id,storage_path:path,original_name:file.name});
      if(meta.error)return msg(m,'Quote #'+data.id+' saved, but file metadata failed: '+meta.error.message,false);
    }
  }

  msg(m,'Quote request #'+data.id+' received'+(files.length?' with artwork uploaded securely.':'.'));
  quote.reset();
});

const login=$('#loginForm');
if(login)login.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(login),{error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  msg($('#authMsg'),error?error.message:'Signed in.',!error);
  if(!error)location.reload();
});

const signup=$('#signupForm');
if(signup)signup.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(signup);
  const{error}=await supabase.auth.signUp({
    email:f.get('email'),
    password:f.get('password'),
    options:{
      data:{full_name:f.get('full_name')},
      emailRedirectTo:accountUrl()+'?confirmed=1'
    }
  });
  msg($('#authMsg'),error?error.message:'Account created. Check your email if confirmation is enabled.',!error);
});

$('#forgotToggle')?.addEventListener('click',()=>{
  $('#resetRequestForm')?.classList.toggle('hidden');
});

const resetRequest=$('#resetRequestForm');
if(resetRequest)resetRequest.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(resetRequest);
  const{error}=await supabase.auth.resetPasswordForEmail(f.get('email'),{redirectTo:accountUrl()+'?reset=1'});
  msg($('#authMsg'),error?error.message:'Password reset email sent.',!error);
});

const passwordUpdate=$('#passwordUpdateForm');
if(passwordUpdate)passwordUpdate.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(passwordUpdate);
  const{error}=await supabase.auth.updateUser({password:f.get('password')});
  msg($('#authMsg'),error?error.message:'Password updated successfully.',!error);
  if(!error){history.replaceState({},'',accountUrl());passwordUpdate.classList.add('hidden');}
});

supabase?.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY')$('#passwordUpdateForm')?.classList.remove('hidden');
});
if(new URLSearchParams(location.search).get('reset')==='1')$('#passwordUpdateForm')?.classList.remove('hidden');
if(new URLSearchParams(location.search).get('confirmed')==='1')msg($('#authMsg'),'Email confirmed. You can now use your account.');

async function account(){
  if(!$('#accountBox')||!isConfigured)return;
  const s=await session();if(!s)return;
  $('#guestBox')?.classList.add('hidden');
  $('#resetRequestForm')?.classList.add('hidden');
  $('#accountBox').classList.remove('hidden');
  $('#accountEmail').textContent=s.user.email;
  const[q,o,i]=await Promise.all([
    supabase.from('quote_requests').select('id,product,quantity,status,created_at,quoted_total,quoted_delivery,quote_message,quote_valid_until,quoted_at').order('created_at',{ascending:false}),
    supabase.from('orders').select('order_number,status,total,created_at,due_at,delivery_method').order('created_at',{ascending:false}),
    supabase.from('invoices').select('invoice_number,order_number,status,issue_date,due_date,total,notes').order('created_at',{ascending:false})
  ]);
  $('#quotes').innerHTML=(q.data||[]).map(x=>`<article class="customer-quote-card">
  <div class="cq-head"><div><strong>Barlas Print Studio</strong><span>QUOTE #${x.id}</span></div><span class="pill status-${x.status}">${x.status.replaceAll('_',' ')}</span></div>
  <div class="cq-body">
    <div class="cq-grid">
      <div><small>Product</small><b>${x.product.replaceAll('_',' ')}</b></div>
      <div><small>Quantity</small><b>${x.quantity}</b></div>
      <div><small>Delivery / Turnaround</small><b>${x.quoted_delivery||'TBC'}</b></div>
      <div><small>Valid until</small><b>${x.quote_valid_until?new Date(x.quote_valid_until+'T00:00:00').toLocaleDateString():'TBC'}</b></div>
    </div>
    <div class="cq-message">${x.quote_message||'Your quote request is being reviewed.'}</div>
    <div class="cq-total"><span>Quoted Total</span><strong>${x.quoted_total!=null?money(x.quoted_total):'Pending'}</strong></div>
  </div>
</article>`).join('')||'<div class="notice">No quote requests linked to this account.</div>';
  $('#orders').innerHTML=(o.data||[]).map(x=>`<tr><td>${x.order_number}</td><td class="status">${x.status.replaceAll('_',' ')}</td><td>${money(x.total)}</td><td>${new Date(x.created_at).toLocaleDateString()}</td><td>${x.due_at?new Date(x.due_at).toLocaleDateString():'—'}</td><td>${x.delivery_method||'—'}</td></tr>`).join('')||'<tr><td colspan="6">No orders yet.</td></tr>';
  $('#invoices').innerHTML=(i.data||[]).map(x=>`<article class="customer-quote-card"><div class="cq-head"><div><strong>Barlas Print Studio</strong><span>${x.invoice_number}</span></div><span class="pill status-${x.status}">${x.status}</span></div><div class="cq-body"><div class="cq-grid"><div><small>Order</small><b>${x.order_number}</b></div><div><small>Issue date</small><b>${new Date(x.issue_date+'T00:00:00').toLocaleDateString()}</b></div><div><small>Due date</small><b>${x.due_date?new Date(x.due_date+'T00:00:00').toLocaleDateString():'TBC'}</b></div><div><small>ABN</small><b>50 393 779 735</b></div></div><div class="cq-message">${x.notes||'Invoice issued for your order.'}</div><div class="cq-total"><span>Total</span><strong>${money(x.total)}</strong></div></div></article>`).join('')||'<div class="notice">No invoices yet.</div>';
}
const claimQuote=$('#claimQuoteForm');
if(claimQuote)claimQuote.addEventListener('submit',async e=>{
  e.preventDefault();
  const m=$('#claimQuoteMsg'),id=+(new FormData(claimQuote).get('quote_id')||0);
  if(!id)return msg(m,'Enter a valid quote number.',false);
  const{data,error}=await supabase.rpc('claim_guest_quote',{p_quote_id:id});
  if(error)return msg(m,error.message,false);
  if(!data)return msg(m,'Quote not found, already claimed, or the quote email does not match this account.',false);
  msg(m,'Quote #'+id+' is now linked to your account.');
  claimQuote.reset();
  await account();
});
$('#logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload()});

const track=$('#trackForm');
if(track)track.addEventListener('submit',async e=>{
  e.preventDefault();
  const s=await session(),m=$('#trackMsg');
  if(!s)return msg(m,'Please sign in first.',false);
  const n=new FormData(track).get('order_number');
  const{data,error}=await supabase.from('orders').select('order_number,status,total,created_at,due_at,delivery_method').eq('order_number',n).maybeSingle();
  if(error||!data)return msg(m,'Order not found in your account.',false);
  msg(m,`${data.order_number}: ${data.status.replaceAll('_',' ')} · ${money(data.total)} · Due ${data.due_at?new Date(data.due_at).toLocaleDateString():'TBC'}`);
});

account();