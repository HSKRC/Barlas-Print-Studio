import { supabase, isConfigured } from './supabase.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(cents)||0)/100);
const key='bps-retail-cart-v1';
let products=[], cart={}, filter='All', user=null, submitting=false;
try { const saved=JSON.parse(localStorage.getItem(key)||'{}'); if(saved && typeof saved==='object' && !Array.isArray(saved))cart=saved; } catch {}
const save=()=>{try{localStorage.setItem(key,JSON.stringify(cart));}catch{}};
function notice(text,bad=false,selector='#shopMessage'){const el=$(selector);el.textContent=text||'';el.classList.toggle('is-error',bad);}
const items=()=>products.filter(p=>cart[p.id]>0).map(p=>({p,qty:Math.min(100,Math.max(1,Number(cart[p.id])||1))}));
const subtotal=()=>items().reduce((s,x)=>s+x.qty*x.p.price_cents,0);
function renderFilters(){
  const categories=['All',...new Set(products.map(p=>p.category))];
  if(!categories.includes(filter))filter='All';
  $('#categoryFilters').innerHTML=categories.map(c=>'<button type="button" class="shop-filter '+(c===filter?'is-active':'')+'" data-filter="'+esc(c)+'">'+esc(c)+'</button>').join('');
}
function renderProducts(){
  const term=$('#shopSearch').value.trim().toLowerCase();
  const visible=products.filter(p=>(filter==='All'||p.category===filter) && (p.name+' '+p.description+' '+p.sku).toLowerCase().includes(term));
  $('#productCount').textContent=visible.length+' item'+(visible.length===1?'':'s');
  $('#productGrid').innerHTML=visible.length?visible.map(p=>{
    const sold=p.stock_qty===0, qty=Number(cart[p.id]||0);
    const photo=p.image_url&&/^https:\/\//i.test(p.image_url)?'<img src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'" loading="lazy">':'<span class="shop-placeholder" aria-hidden="true">B.</span>';
    return '<article class="shop-item"><div class="shop-item-art">'+photo+'<span class="shop-item-category">'+esc(p.category)+'</span></div><div class="shop-item-body"><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Made by Barlas Print Studio.')+'</p><div class="shop-item-bottom"><strong>'+money(p.price_cents)+'</strong><button type="button" class="shop-add" data-add="'+p.id+'" '+(sold?'disabled':'')+'>'+(sold?'Sold out':qty?'Add another +':'Add to bag +')+'</button></div><small>'+(p.stock_qty==null?'Made to order / availability confirmed':p.stock_qty>0?'Available stock: '+p.stock_qty:'Currently unavailable')+'</small></div></article>';
  }).join(''):'<div class="shop-empty"><h3>'+(products.length?'No products match your search.':'Our shop is being stocked.')+'</h3><p>'+(products.length?'Try another category or search term.':'Finished products and their prices will appear here as soon as they are published by the studio. Please check back soon.')+'</p></div>';
}
function renderCart(){
  const lines=items(), totalQty=lines.reduce((n,x)=>n+x.qty,0);
  $('#bagCount').textContent=totalQty;$('#bagHeadingCount').textContent='('+totalQty+')';$('#cartSubtotal').textContent=money(subtotal());
  $('#cartItems').innerHTML=lines.length?lines.map(({p,qty})=>'<div class="shop-cart-row"><div><b>'+esc(p.name)+'</b><small>'+esc(p.sku)+' · '+money(p.price_cents)+' each</small></div><div class="shop-cart-row-controls"><strong>'+money(p.price_cents*qty)+'</strong><label class="sr-only" for="qty-'+p.id+'">Quantity of '+esc(p.name)+'</label><input class="shop-qty" id="qty-'+p.id+'" data-qty="'+p.id+'" type="number" min="1" max="'+(p.stock_qty==null?100:Math.min(100,p.stock_qty))+'" value="'+qty+'"><button class="shop-remove" type="button" data-remove="'+p.id+'" aria-label="Remove '+esc(p.name)+'">×</button></div></div>').join(''):'<div class="shop-empty"><h3>Your bag is empty</h3><p>Add a product from the collection above to begin.</p></div>';
  $('#shopPlaceOrder').disabled=!lines.length||submitting;
}
function render(){renderFilters();renderProducts();renderCart();}
async function loadProducts(){
 if(!isConfigured){notice('The shop connection is not configured.',true);return;}
 const {data,error}=await supabase.from('shop_products').select('id,sku,name,description,category,image_url,price_cents,stock_qty').eq('is_active',true).order('created_at',{ascending:false});
 if(error){notice('The product catalogue is temporarily unavailable. Please try again.',true);return;}
 products=data||[];
 for(const id of Object.keys(cart)){const p=products.find(p=>p.id===id);if(!p||p.stock_qty===0)delete cart[id];else if(p.stock_qty!=null)cart[id]=Math.min(Number(cart[id])||1,p.stock_qty,100);}
 save();render();
}
async function loadAuth(){
 if(!isConfigured)return;
 const {data,error}=await supabase.auth.getUser();user=error?null:data.user;
 $('#shopAuth').innerHTML=user?'<strong>Signed in:</strong> '+esc(user.email||'Your account'):'To order, <a href="account.html">sign in or create an account</a>, then return to the Shop.';
 if(user){
  const name=user.user_metadata?.full_name;
  if(name && !$('[name="customer_name"]').value)$('[name="customer_name"]').value=name;
  const history=await supabase.from('shop_orders').select('order_number,created_at,status,payment_status,subtotal_cents,delivery_fee_cents,fulfilment').order('created_at',{ascending:false}).limit(40);
  if(history.error){$('#shopOrderHistory').textContent='Unable to load order history.';return;}
  $('#shopOrderHistory').innerHTML=history.data.length?history.data.map(o=>'<div class="shop-history-row"><div><strong>Shop order #'+o.order_number+'</strong><small>'+new Date(o.created_at).toLocaleDateString('en-AU')+' · '+esc(o.fulfilment)+' · '+esc(o.status.replaceAll('_',' '))+'</small></div><div><strong>'+money(o.subtotal_cents+(o.delivery_fee_cents||0))+'</strong><small>'+esc(o.payment_status)+(o.fulfilment==='delivery'&&o.delivery_fee_cents===null?' · Delivery fee not yet confirmed':'')+'</small></div></div>').join(''):'No shop orders yet.';
 } else $('#shopOrderHistory').innerHTML='Sign in to view your shop orders.';
}
$('#categoryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;renderFilters();renderProducts();});
$('#shopSearch').addEventListener('input',renderProducts);
$('#productGrid').addEventListener('click',e=>{
 const b=e.target.closest('[data-add]');if(!b)return;
 const p=products.find(x=>x.id===b.dataset.add);if(!p||p.stock_qty===0)return;
 const max=p.stock_qty==null?100:Math.min(100,p.stock_qty);
 cart[p.id]=Math.min(max,(Number(cart[p.id])||0)+1);save();renderProducts();renderCart();
 notice(esc(p.name)+' added to your bag.');
});
$('#cartItems').addEventListener('click',e=>{
 const b=e.target.closest('[data-remove]');if(!b)return;delete cart[b.dataset.remove];save();renderProducts();renderCart();
});
$('#cartItems').addEventListener('change',e=>{
 const b=e.target.closest('[data-qty]');if(!b)return;
 const p=products.find(x=>x.id===b.dataset.qty);if(!p)return;
 const qty=Math.trunc(Number(b.value));if(!Number.isFinite(qty)||qty<=0)delete cart[p.id];else cart[p.id]=Math.min(qty,p.stock_qty==null?100:p.stock_qty,100);
 save();renderProducts();renderCart();
});
$('#shopCheckout').addEventListener('change',e=>{
 if(e.target.name==='fulfilment'){$('#deliveryAddressField').classList.toggle('hidden',e.target.value!=='delivery');}
});
$('#shopCheckout').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting)return;
 const lines=items();if(!lines.length)return notice('Add an item to your bag first.',true,'#shopCheckoutMessage');
 if(!isConfigured)return notice('Shop connection unavailable.',true,'#shopCheckoutMessage');
 const {data:auth}=await supabase.auth.getUser();user=auth.user;
 if(!user)return notice('Please sign in using the Account page, then return to complete your order.',true,'#shopCheckoutMessage');
 const f=new FormData(e.target),fulfilment=f.get('fulfilment');
 if(fulfilment==='delivery'&&String(f.get('delivery_address')||'').trim().length<10)return notice('Please enter your full delivery address.',true,'#shopCheckoutMessage');
 submitting=true;renderCart();notice('Submitting your order…',false,'#shopCheckoutMessage');
 try{
  const {data,error}=await supabase.rpc('place_shop_order',{
   p_items:lines.map(x=>({id:x.p.id,quantity:x.qty})),
   p_customer_name:String(f.get('customer_name')||'').trim(),
   p_phone:String(f.get('phone')||'').trim(),
   p_fulfilment:fulfilment,
   p_delivery_address:String(f.get('delivery_address')||'').trim(),
   p_notes:String(f.get('notes')||'').trim()
  });
  if(error)throw error;
  const {data:order}=await supabase.from('shop_orders').select('order_number').eq('id',data).single();
  cart={};save();e.target.reset();$('#deliveryAddressField').classList.add('hidden');
  notice('Order '+(order?'#'+order.order_number:'')+' received. Our team will confirm availability, any delivery charge and how to pay. No payment has been taken.',false,'#shopCheckoutMessage');
  await loadProducts();await loadAuth();
 }catch(err){notice(err.message||'Your order could not be submitted. Please try again.',true,'#shopCheckoutMessage');}
 finally{submitting=false;renderCart();}
});
renderCart();await loadProducts();await loadAuth();
