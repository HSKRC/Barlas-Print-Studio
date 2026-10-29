import {supabase,isConfigured} from './supabase.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(n)||0)/100);
const cartKey='bps-retail-cart-v1', favKey='bps-shop-wishlist-v1';
let product=null, variants=[], cart={},favorites={};
try{cart=JSON.parse(localStorage.getItem(cartKey)||'{}')||{};}catch{}
try{favorites=JSON.parse(localStorage.getItem(favKey)||'{}')||{};}catch{}
const images=p=>[p.image_url,...(p.gallery_urls||[])].filter(u=>typeof u==='string'&&/^https:\/\//.test(u)).filter((u,i,arr)=>arr.indexOf(u)===i);
const save=()=>{try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{}};
const notice=s=>{$('#productDetailMessage').textContent=s;};
const bagCount=()=>{$('#productBagCount').textContent=Object.values(cart).reduce((a,b)=>a+(Number(b)||0),0);};
function render(){
 const p=product, gallery=images(p),sold=p.stock_qty===0;
 const main=gallery[0]?'<img id="activeProductImage" src="'+esc(gallery[0])+'" alt="'+esc(p.name)+'">':'<div class="shop-placeholder-large">B.</div>';
 const thumbs=gallery.length>1?'<div class="shop-gallery-thumbs">'+gallery.map((u,i)=>'<button class="shop-thumb'+(!i?' active':'')+'" type="button" data-gallery="'+i+'"><img src="'+esc(u)+'" alt="Product image '+(i+1)+'"></button>').join('')+'</div>':'';
 const colourChoices=variants.filter(v=>v.colour).map(v=>'<a href="product.html?id='+v.id+'" aria-current="'+(v.id===p.id)+'">'+esc(v.colour)+(v.size_label?' / '+esc(v.size_label):'')+'</a>').join('');
 const sizeChoices=variants.filter(v=>v.size_label&&!v.colour).map(v=>'<a href="product.html?id='+v.id+'" aria-current="'+(v.id===p.id)+'">'+esc(v.size_label)+'</a>').join('');
 const sale=p.compare_at_cents>p.price_cents?'<del>'+money(p.compare_at_cents)+'</del><span class="shop-detail-sale">SAVE '+Math.round((1-p.price_cents/p.compare_at_cents)*100)+'%</span>':'';
 $('#crumb').textContent=p.name;document.title=p.name+' | Barlas Print Studio Shop';
 document.querySelector('meta[name="description"]').content=(p.description||p.name).slice(0,150);
 $('#productDetail').innerHTML='<div><div class="shop-main-photo">'+main+'</div>'+thumbs+'</div><div class="shop-detail-info"><span class="shop-kicker">'+esc(p.category)+' / '+esc(p.brand||'BARLAS')+'</span><h1>'+esc(p.name)+'</h1><p class="shop-sku">SKU: '+esc(p.sku)+'</p><div class="shop-detail-price">'+money(p.price_cents)+sale+'</div><div class="shop-description">'+esc(p.description||'Product details available from the studio.').replace(/\n/g,'<br>')+'</div>'+(colourChoices?'<div class="shop-detail-variants"><b>Colours / versions</b><div>'+colourChoices+'</div></div>':'')+(sizeChoices?'<div class="shop-detail-variants"><b>Sizes</b><div>'+sizeChoices+'</div></div>':'')+((p.size_label||p.colour)&&!colourChoices&&!sizeChoices?'<p><strong>Option:</strong> '+esc([p.colour,p.size_label].filter(Boolean).join(' / '))+'</p>':'')+'<div class="shop-stock">'+(sold?'Out of stock':p.stock_qty==null?'Made to order — availability confirmed by the studio':'In stock: '+p.stock_qty)+'</div><div class="shop-detail-actions"><label class="shop-quantity-label">Quantity <input type="number" id="detailQty" value="1" min="1" max="'+(p.stock_qty==null?100:Math.max(1,Math.min(100,p.stock_qty)))+'"></label><button class="shop-primary" id="detailAdd" '+(sold?'disabled':'')+' type="button">'+(sold?'Sold out':'Add to bag +')+'</button><button type="button" id="detailFavourite" class="shop-detail-wishlist" aria-pressed="'+!!favorites[p.id]+'">'+(favorites[p.id]?'♥ Saved':'♡ Save')+'</button></div><p class="shop-fine">Pickup or delivery request at checkout. Any delivery fee is confirmed before payment. Secure online payment is enabled only after the merchant account is connected.</p><p><a class="shop-more-link" href="shop.html#shopping-bag">View shopping bag →</a></p></div>';
 $('#detailAdd').addEventListener('click',()=>{
  const q=Math.trunc(Number($('#detailQty').value)||1),max=p.stock_qty==null?100:Math.min(100,p.stock_qty);
  if(q<1||q>100)return notice('Please choose a valid quantity.');
  cart[p.id]=Math.min(max,(Number(cart[p.id])||0)+q);
  save();bagCount();notice(p.name+' added to your shopping bag.');$('#detailAdd').textContent='Added ✓';
 });
 $('#detailFavourite').addEventListener('click',()=>{
  if(favorites[p.id])delete favorites[p.id];else favorites[p.id]=true;
  try{localStorage.setItem(favKey,JSON.stringify(favorites));}catch{}
  $('#detailFavourite').textContent=favorites[p.id]?'♥ Saved':'♡ Save';
  $('#detailFavourite').setAttribute('aria-pressed',String(!!favorites[p.id]));
 });
 $('#productDetail').addEventListener('click',e=>{
  const b=e.target.closest('[data-gallery]');if(!b)return;
  const img=$('#activeProductImage');if(img)img.src=gallery[Number(b.dataset.gallery)];
  document.querySelectorAll('.shop-thumb').forEach(t=>t.classList.toggle('active',t===b));
 });
}
async function load(){
 bagCount();
 if(!isConfigured){$('#productDetail').textContent='Store connection not configured.';return;}
 const id=new URLSearchParams(location.search).get('id');
 if(!id||!/^[0-9a-f-]{36}$/i.test(id)){$('#productDetail').textContent='Product not found.';return;}
 const {data,error}=await supabase.from('shop_products').select('id,name,sku,category,description,brand,image_url,gallery_urls,price_cents,compare_at_cents,stock_qty,group_key,colour,size_label').eq('id',id).eq('is_active',true).single();
 if(error||!data){$('#productDetail').innerHTML='<div class="shop-empty"><h3>Product not found</h3><p>This item may no longer be available. <a href="shop.html">Browse the shop →</a></p></div>';return;}
 product=data;variants=[data];
 if(product.group_key){
  const v=await supabase.from('shop_products').select('id,colour,size_label').eq('group_key',product.group_key).eq('is_active',true).order('colour');
  if(!v.error&&v.data?.length)variants=v.data;
 }
 render();
 const related=await supabase.from('shop_products').select('id,name,image_url,price_cents,category').eq('is_active',true).eq('category',product.category).neq('id',product.id).limit(3);
 $('#relatedProducts').innerHTML=(related.data||[]).map(p=>'<a href="product.html?id='+p.id+'" class="shop-item"><div class="shop-item-art">'+(p.image_url&&/^https:\/\//.test(p.image_url)?'<img src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'" loading="lazy">':'<span class="shop-placeholder">B.</span>')+'</div><div class="shop-item-body"><h3>'+esc(p.name)+'</h3><strong>'+money(p.price_cents)+'</strong></div></a>').join('')||'<p class="shop-muted">More products will appear here as new collections are published.</p>';
}
await load();