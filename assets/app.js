import{supabase,isConfigured}from'./supabase.js';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(+n||0);
$$('.year').forEach(x=>x.textContent=new Date().getFullYear());
const msg=(el,t,ok=true)=>{if(el){el.textContent=t;el.style.borderLeftColor=ok?'#00b8e6':'#e6007e'}};
const accountUrl=()=>new URL('account.html',location.href).href.split('?')[0].split('#')[0];
async function session(){return isConfigured?(await supabase.auth.getSession()).data.session:null}

const quote=$('#quoteForm');
if(quote)quote.addEventListener('submit',async e=>{
  e.preventDefault();
  const m=$('#quoteMsg');
  if(!isConfigured)return msg(m,'Supabase is not connected.',false);
  const fd=new FormData(quote),s=await session();
  const row={user_id:s?.user?.id||null,full_name:fd.get('full_name'),email:fd.get('email'),phone:fd.get('phone'),product:fd.get('product'),quantity:+fd.get('quantity'),size:fd.get('size'),paper:fd.get('paper'),print_sides:fd.get('print_sides'),finish:fd.get('finish'),design_service:fd.get('design_service')==='yes',notes:fd.get('notes')};
  const input=$('#artwork'),files=[...(input?.files||[])];

  if(!s){
    const{error}=await supabase.from('quote_requests').insert(row);
    if(error)return msg(m,error.message,false);
    msg(m,files.length
      ?'Quote request received. Your quote was saved; sign in if you also want to upload artwork securely.'
      :'Quote request received. We will review the details and respond with pricing.');
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
  const{data}=await supabase.from('orders').select('order_number,status,total,created_at,due_at,delivery_method').order('created_at',{ascending:false});
  $('#orders').innerHTML=(data||[]).map(o=>`<tr><td>${o.order_number}</td><td class="status">${o.status.replaceAll('_',' ')}</td><td>${money(o.total)}</td><td>${new Date(o.created_at).toLocaleDateString()}</td><td>${o.due_at?new Date(o.due_at).toLocaleDateString():'—'}</td><td>${o.delivery_method||'—'}</td></tr>`).join('')||'<tr><td colspan="6">No orders yet.</td></tr>';
}
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