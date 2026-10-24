import{supabase,isConfigured}from'./supabase.js';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(+n||0);
const payment=window.BPS_CONFIG?.payment||{};
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const paymentInstructions=invoice=>{
  if(invoice.status==='paid')return '<div class="notice"><strong>Payment received.</strong> Thank you.</div>';
  const methods=[];
  if(payment.bankTransferEnabled&&payment.bankName&&payment.accountName&&payment.bsb&&payment.accountNumber)methods.push(`<div><strong>Bank Transfer</strong><br>Bank: ${esc(payment.bankName)}<br>Account name: ${esc(payment.accountName)}<br>BSB: ${esc(payment.bsb)}<br>Account: ${esc(payment.accountNumber)}</div>`);
  if(payment.payIdEnabled&&payment.payId)methods.push(`<div><strong>PayID</strong><br>${esc(payment.payId)}</div>`);
  return methods.length?`<div class="notice payment-instructions"><strong>Payment options</strong><p>Use <b>${esc(invoice.invoice_number)}</b> as your payment reference.</p>${methods.join('<br>')}<p>Payment status is updated after the transfer is verified.</p></div>`:'';
};
$$('.year').forEach(x=>x.textContent=new Date().getFullYear());
const msg=(el,t,ok=true)=>{if(el){el.textContent=t;el.style.borderLeftColor=ok?'#00b8e6':'#e6007e'}};
const accountUrl=()=>new URL('account.html',location.href).href.split('?')[0].split('#')[0];
async function session(){return isConfigured?(await supabase.auth.getSession()).data.session:null}

const serviceAliases={business_cards:'card',flyers:'flyer',posters:'poster',banners:'banner'};
const rawRequestedService=new URLSearchParams(location.search).get('service');
const requestedService=serviceAliases[rawRequestedService]||rawRequestedService;
if(requestedService&&$('#quoteForm [name="product"]')){
  const sel=$('#quoteForm [name="product"]');
  if([...sel.options].some(o=>o.value===requestedService))sel.value=requestedService;
}


const needsDeliveryInput=$('#needsDelivery'),deliveryAddressGroup=$('#deliveryAddressGroup'),deliveryAddressInput=$('#deliveryAddress'),deliveryAddressSearch=$('#deliveryAddressSearch'),deliveryAddressSuggestions=$('#deliveryAddressSuggestions'),deliveryAddressStatus=$('#deliveryAddressStatus');
let addressSearchTimer=null,addressSearchController=null,addressSuggestionButtons=[];
function closeAddressSuggestions(){
  deliveryAddressSuggestions?.classList.add('hidden');
  deliveryAddressSearch?.setAttribute('aria-expanded','false');
  addressSuggestionButtons=[];
}
function clearAddressSuggestions(){
  if(deliveryAddressSuggestions)deliveryAddressSuggestions.replaceChildren();
  closeAddressSuggestions();
}
function setAddressStatus(text,error=false){
  if(!deliveryAddressStatus)return;
  deliveryAddressStatus.textContent=text;
  deliveryAddressStatus.classList.toggle('error',error);
}
function syncDeliveryChoice(){
  if(!needsDeliveryInput||!deliveryAddressGroup||!deliveryAddressInput||!deliveryAddressSearch)return;
  const enabled=needsDeliveryInput.checked;
  deliveryAddressGroup.classList.toggle('hidden',!enabled);
  deliveryAddressSearch.disabled=!enabled;
  deliveryAddressSearch.required=enabled;
  if(!enabled){
    clearTimeout(addressSearchTimer);
    addressSearchController?.abort();
    deliveryAddressSearch.value='';
    deliveryAddressInput.value='';
    deliveryAddressSearch.setCustomValidity('');
    setAddressStatus('');
    clearAddressSuggestions();
  }else if(!deliveryAddressInput.value){
    deliveryAddressSearch.setCustomValidity('Choose a delivery address from the suggestions.');
  }
}
function formatAddress(properties={}){
  const clean=value=>String(value||'').trim();
  const street=clean(properties.street);
  const house=clean(properties.housenumber);
  const primary=[house,street].filter(Boolean).join(' ')||clean(properties.name);
  if(!primary)return '';
  const parts=[primary,properties.district,properties.suburb,properties.city,properties.county,properties.state,properties.postcode,properties.country].map(clean).filter(Boolean);
  return parts.filter((part,index)=>parts.findIndex(other=>other.toLowerCase()===part.toLowerCase())===index).join(', ');
}
function chooseAddress(address){
  deliveryAddressSearch.value=address;
  deliveryAddressInput.value=address;
  deliveryAddressSearch.setCustomValidity('');
  setAddressStatus('Address selected.');
  clearAddressSuggestions();
}
function renderAddressSuggestions(features){
  clearAddressSuggestions();
  const matches=[];
  const ordered=[...(features||[])].sort((a,b)=>Number(String(b?.properties?.countrycode||'').toUpperCase()==='AU')-Number(String(a?.properties?.countrycode||'').toUpperCase()==='AU'));
  for(const feature of ordered){
    const p=feature?.properties||{};
    const address=formatAddress(p);
    const hasStreet=Boolean(p.street||p.housenumber);
    const hasDetail=Boolean(p.housenumber||p.postcode);
    if(!address||!p.country||!hasStreet||!hasDetail||matches.some(item=>item.address===address))continue;
    matches.push({address,properties:p});
    if(matches.length===7)break;
  }
  if(!matches.length){setAddressStatus('No complete address suggestions found. Try adding the street name, suburb, or postcode.');return;}
  const fragment=document.createDocumentFragment();
  addressSuggestionButtons=[];
  matches.forEach((match,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='address-suggestion';
    button.id='delivery-address-option-'+index;
    button.setAttribute('role','option');
    button.setAttribute('aria-selected','false');
    button.textContent=match.address;
    button.addEventListener('click',()=>chooseAddress(match.address));
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        const next=(index+(event.key==='ArrowDown'?1:-1)+addressSuggestionButtons.length)%addressSuggestionButtons.length;
        addressSuggestionButtons[next]?.focus();
      }else if(event.key==='Escape'){
        closeAddressSuggestions();
        deliveryAddressSearch.focus();
      }
    });
    addressSuggestionButtons.push(button);
    fragment.append(button);
  });
  deliveryAddressSuggestions.append(fragment);
  deliveryAddressSuggestions.classList.remove('hidden');
  deliveryAddressSearch.setAttribute('aria-expanded','true');
  setAddressStatus('Choose one of the suggested street addresses. Australian results are prioritised.');
}
async function searchDeliveryAddresses(query){
  addressSearchController?.abort();
  addressSearchController=new AbortController();
  const controller=addressSearchController;
  const params=new URLSearchParams({q:query,limit:'12',lat:'-25.2744',lon:'133.7751',zoom:'3',location_bias_scale:'0.7'});
  setAddressStatus('Searching address suggestions...');
  try{
    const response=await fetch('https://photon.komoot.io/api/?'+params.toString(),{signal:controller.signal,headers:{Accept:'application/geo+json'}});
    if(!response.ok)throw new Error('Address search service returned '+response.status);
    const data=await response.json();
    if(controller!==addressSearchController)return;
    renderAddressSuggestions(data.features||[]);
  }catch(error){
    if(error.name==='AbortError')return;
    if(controller!==addressSearchController)return;
    clearAddressSuggestions();
    setAddressStatus('Address suggestions are unavailable right now. Please try again shortly.',true);
  }
}
deliveryAddressSearch?.addEventListener('input',()=>{
  deliveryAddressInput.value='';
  deliveryAddressSearch.setCustomValidity('Choose a delivery address from the suggestions.');
  clearAddressSuggestions();
  clearTimeout(addressSearchTimer);
  addressSearchController?.abort();
  const query=deliveryAddressSearch.value.trim();
  if(query.length<3){setAddressStatus(query?'Type at least 3 characters to search.':'');return;}
  addressSearchTimer=setTimeout(()=>searchDeliveryAddresses(query),350);
});
deliveryAddressSearch?.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'&&addressSuggestionButtons.length){event.preventDefault();addressSuggestionButtons[0].focus();}
  else if(event.key==='Enter'&&!deliveryAddressSuggestions?.classList.contains('hidden')&&addressSuggestionButtons.length){event.preventDefault();addressSuggestionButtons[0].click();}
  else if(event.key==='Escape')closeAddressSuggestions();
});
needsDeliveryInput?.addEventListener('change',syncDeliveryChoice);
syncDeliveryChoice();

const quote=$('#quoteForm');
if(quote)quote.addEventListener('submit',async e=>{
  e.preventDefault();
  const m=$('#quoteMsg');
  if(!isConfigured)return msg(m,'Supabase is not connected.',false);
  const fd=new FormData(quote),s=await session();
  const needsDelivery=fd.get('needs_delivery')==='yes';
  const deliveryAddress=String(fd.get('delivery_address')||'').trim();
  if(needsDelivery&&deliveryAddress.length<12){deliveryAddressSearch?.setCustomValidity('Choose a complete delivery address from the suggestions.');deliveryAddressSearch?.reportValidity();return msg(m,'Choose a complete delivery address from the suggestions.',false);}
  const deliveryNotes=(needsDelivery?'Fulfilment: Delivery\nDelivery address: '+deliveryAddress:'Fulfilment: Customer pickup at studio')+'\n\n'+String(fd.get('notes')||'');
  const row={user_id:s?.user?.id||null,full_name:fd.get('full_name'),email:fd.get('email'),phone:fd.get('phone'),product:fd.get('product'),quantity:+fd.get('quantity'),size:fd.get('size'),paper:fd.get('paper'),print_sides:fd.get('print_sides'),finish:fd.get('finish'),design_service:fd.get('design_service')==='yes',notes:deliveryNotes};
  const input=$('#artwork'),files=[...(input?.files||[])];
  const allowedTypes=new Set(['application/pdf','image/jpeg','image/png']);
  if(files.some(file=>file.size>20*1024*1024))return msg(m,'Each artwork file must be 20 MB or smaller.',false);
  if(files.some(file=>!allowedTypes.has(file.type)||!/\.(pdf|jpe?g|png)$/i.test(file.name)))return msg(m,'Only PDF, JPG and PNG artwork files are accepted.',false);
  if(files.length&&!s)return msg(m,'Please sign in before uploading artwork, or remove the files to submit a guest quote.',false);

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
    syncDeliveryChoice();
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
  syncDeliveryChoice();
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
  const guestClaims=await supabase.rpc('claim_guest_quotes');
  if(guestClaims.error)msg($('#authMsg'),'Could not link earlier guest quotes: '+guestClaims.error.message,false);
  else if(Number(guestClaims.data)>0)msg($('#authMsg'),Number(guestClaims.data)+' earlier guest quote(s) linked to this account.',true);
  const[q,o,i,creditAccount,creditRewards]=await Promise.all([
    supabase.from('quote_requests').select('id,product,quantity,status,created_at,quoted_total,quoted_delivery_fee,quoted_turnaround,quoted_delivery,quote_message,quote_valid_until,quoted_at,deposit_percent,deposit_amount,deposit_status,customer_responded_at').order('created_at',{ascending:false}),
    supabase.from('orders').select('order_number,status,total,created_at,due_at,delivery_method').order('created_at',{ascending:false}),
    supabase.from('invoices').select('invoice_number,order_number,status,issue_date,due_date,total,subtotal,gst,delivery_fee,deposit_credit,amount_due,invoice_kind,notes').order('created_at',{ascending:false}),
    supabase.from('print_credit_accounts').select('qualifying_spend').maybeSingle(),
    supabase.from('print_credit_rewards').select('id,amount,issued_at,expires_at,redeemed_at').order('issued_at',{ascending:false})
  ]);
  const spend=Number(creditAccount.data?.qualifying_spend||0);
  const rewardRows=creditRewards.data||[];
  const now=Date.now();
  const available=rewardRows.filter(x=>!x.redeemed_at&&new Date(x.expires_at).getTime()>now);
  const availableTotal=available.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const progress=Math.min(100,spend/12000*100);
  const creditError=creditAccount.error||creditRewards.error;
  $('#printCredit').innerHTML=`<div class="cq-head"><div><strong>Print credit</strong><span>LOYALTY REWARDS</span></div><strong>${money(availableTotal)}</strong></div><div class="cq-body">${creditError?'<div class="notice error">Credit status is temporarily unavailable. Please check again later.</div>':`<div class="cq-grid"><div><small>Eligible print spend accumulated</small><b>${money(spend)} of ${money(12000)}</b></div><div><small>Spend until next reward</small><b>${money(Math.max(0,12000-spend))}</b></div></div><div class="credit-progress" role="progressbar" aria-label="Progress to print credit" aria-valuemin="0" aria-valuemax="12000" aria-valuenow="${Math.round(spend)}"><span style="width:${progress}%"></span></div><p>Each ${money(12000)} of completed and paid print purchases earns ${money(200)} in print credit. After a reward is issued, eligible spend starts accumulating again. Each credit expires one year after issue. Credit applies to printing; delivery fees are separate.</p>${rewardRows.length?`<div class="credit-reward-list">${rewardRows.map(x=>{const state=x.redeemed_at?'Used':new Date(x.expires_at).getTime()<=now?'Expired':'Available';return `<div><span>${money(x.amount)} print credit · issued ${new Date(x.issued_at).toLocaleDateString()}</span><b>${state}${state==='Available'?' · expires '+new Date(x.expires_at).toLocaleDateString():''}</b></div>`}).join('')}</div>`:'<div class="notice">No print credits earned yet. Your eligible spend will appear here after a print order is completed and its invoice is paid.</div>'}`}</div>`;
  $('#quotes').innerHTML=(q.data||[]).map(x=>`<article class="customer-quote-card">
  <div class="cq-head"><div><strong>Barlas Print Studio</strong><span>QUOTE #${esc(x.id)}</span></div><span class="pill status-${esc(x.status)}">${esc(String(x.status||'').replaceAll('_',' '))}</span></div>
  <div class="cq-body">
    <div class="cq-grid">
      <div><small>Product</small><b>${esc(String(x.product||'').replaceAll('_',' '))}</b></div>
      <div><small>Quantity</small><b>${esc(x.quantity)}</b></div>
      <div><small>Turnaround</small><b>${esc(x.quoted_turnaround||x.quoted_delivery||'TBC')}</b></div>\n      <div><small>Delivery fee</small><b>${money(x.quoted_delivery_fee||0)}</b></div>
      <div><small>Valid until</small><b>${x.quote_valid_until?new Date(x.quote_valid_until+'T00:00:00').toLocaleDateString():'TBC'}</b></div>
    </div>
    <div class="cq-message">${esc(x.quote_message||'Your quote request is being reviewed.')}</div>
    <div class="cq-total"><span>Quoted Total</span><strong>${x.quoted_total!=null?money(x.quoted_total):'Pending'}</strong></div>
    ${x.status==='quoted'&&x.quoted_total!=null?'<div class="quote-action-row"><button class="btn cmyk" data-quote-respond="accept" data-quote-id="'+esc(x.id)+'">Accept Quote</button><button class="btn" data-quote-respond="decline" data-quote-id="'+esc(x.id)+'">Decline Quote</button></div><small>Production begins only after deposit payment is confirmed.</small>':''}
    ${x.status==='accepted'?'<div class="notice"><strong>Deposit due:</strong> '+money(x.deposit_amount||0)+' ('+esc(x.deposit_percent||0)+'%). <strong>Payment status:</strong> '+esc(x.deposit_status||'awaiting_payment')+(x.deposit_status==='paid'?'<p>Deposit confirmed. Thank you.</p>':payment.payIdEnabled&&payment.payId?'<p><strong>Pay by PayID (ABN):</strong> '+esc(payment.payId)+'</p><p><strong>Payment reference:</strong> BPS-Q'+esc(x.id)+'</p><p>Select ABN as the PayID type in your banking app and verify the recipient name before sending. Production begins after we confirm funds received.</p>':'')+'</div>':''}
  </div>
</article>`).join('')||'<div class="notice">No quote requests linked to this account.</div>';
  $('#orders').innerHTML=(o.data||[]).map(x=>`<tr><td>${esc(x.order_number)}</td><td class="status">${esc(String(x.status||'').replaceAll('_',' '))}</td><td>${money(x.total)}</td><td>${new Date(x.created_at).toLocaleDateString()}</td><td>${x.due_at?new Date(x.due_at).toLocaleDateString():'—'}</td><td>${esc(x.delivery_method||'—')}</td></tr>`).join('')||'<tr><td colspan="6">No orders yet.</td></tr>';
  $('#invoices').innerHTML=(i.data||[]).map(x=>`<article class="customer-quote-card"><div class="cq-head"><div><strong>Barlas Print Studio</strong><span>${esc(x.invoice_number)}</span></div><span class="pill status-${esc(x.status)}">${esc(x.status)}</span></div><div class="cq-body"><div class="cq-grid"><div><small>Type</small><b>${esc(x.invoice_kind==='deposit'?'Deposit receipt':'Final invoice')}</b></div><div><small>Order</small><b>${esc(x.order_number)}</b></div><div><small>Issue date</small><b>${new Date(x.issue_date+'T00:00:00').toLocaleDateString()}</b></div><div><small>Due date</small><b>${x.due_date?new Date(x.due_date+'T00:00:00').toLocaleDateString():'TBC'}</b></div><div><small>ABN</small><b>50 393 779 735</b></div></div><div class="cq-message">${esc(x.notes||'Invoice issued for your order.')}</div><div class="cq-total"><span>Invoice total</span><strong>${money(x.total)}</strong></div>${x.deposit_credit>0?'<div class="cq-grid"><div><small>Deposit received</small><b>−'+money(x.deposit_credit)+'</b></div></div>':''}<div class="cq-total"><span>Balance due</span><strong>${money(x.amount_due??x.total)}</strong></div>${paymentInstructions({...x,total:x.amount_due??x.total})}</div></article>`).join('')||'<div class="notice">No invoices yet.</div>';
}
$('#quotes')?.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-quote-respond]');if(!btn)return;
  const accept=btn.dataset.quoteRespond==='accept';
  if(!confirm(accept?'Accept this quote and its deposit terms?':'Decline this quote?'))return;
  btn.disabled=true;
  const {error}=await supabase.rpc('respond_to_quote',{p_quote_id:Number(btn.dataset.quoteId),p_accept:accept});
  if(error){alert(error.message);btn.disabled=false;return;}
  await account();
});
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
/* Cookie preferences: essential storage is always active; optional cookies require consent. */
(function cookiePreferences(){
  const key='bps-cookie-consent-v1';
  let choice=null;
  try{choice=localStorage.getItem(key)}catch(_){}
  if(choice==='accepted'||choice==='rejected')return;
  const banner=document.createElement('aside');
  banner.className='cookie-consent';
  banner.setAttribute('role','dialog');
  banner.setAttribute('aria-label','Cookie preferences');
  banner.innerHTML='<div><strong>Privacy choices</strong><p>Essential cookies support sign-in and site functions. Optional cookies need your consent. <a href="privacy.html">Privacy Policy</a></p></div><div class="cookie-actions"><button type="button" class="btn dark" data-cookie-choice="accepted">Accept optional cookies</button><button type="button" class="btn" data-cookie-choice="rejected">Essential only</button></div>';
  banner.addEventListener('click',event=>{
    const btn=event.target.closest('[data-cookie-choice]');
    if(!btn)return;
    const value=btn.getAttribute('data-cookie-choice');
    try{localStorage.setItem(key,value)}catch(_){}
    window.dispatchEvent(new CustomEvent('bps:cookie-consent',{detail:{optional:value==='accepted'}}));
    banner.remove();
  });
  document.body.appendChild(banner);
})();
