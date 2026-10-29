import {supabase,isConfigured} from './supabase.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(n)||0)/100);
let products=[],orders=[],editing=null;
const statusList=['awaiting_review','awaiting_payment','preparing','ready_for_pickup','shipped','completed','cancelled'];
function alertMessage(t,error=false){const e=$('#shopAdminMessage');if(e){e.textContent=t;e.classList.toggle('is-error',error);}}
function productForm(){
 return '<form id="productEditor" class="panel"><h2 id="editorTitle">Add a product</h2><p class="muted">Products are hidden until you tick Publish. Set a real price before making an item available.</p><div class="formgrid"><label class="field">Product name<input name="name" maxlength="160" required placeholder="e.g. Barlas ceramic mug"></label><label class="field">SKU<input name="sku" maxlength="50" required placeholder="e.g. MUG-001"></label><label class="field">Category<select name="category"><option>Mugs & Drinkware</option><option>T-Shirts & Apparel</option><option>Stickers & Decals</option><option>Signs & Prints</option><option>Gifts & Accessories</option><option>Stationery</option><option>Other</option></select></label><label class="field">Price (AUD)<input type="number" name="price" step="0.01" min="0.01" max="1000000" required></label><label class="field">Stock on hand (leave blank for made to order)<input type="number" name="stock" min="0" max="100000" step="1" placeholder="Leave blank for no stock limit"></label><label class="field">Upload product photo (JPEG, PNG, WebP; max 5 MB)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label></div><label class="field">Description<textarea name="description" maxlength="2500" rows="4"></textarea></label><label class="field">Photo URL (optional alternative to upload)<input type="url" name="image_url" maxlength="800" placeholder="https://"></label><label style="display:flex;gap:10px;align-items:center;margin:16px 0"><input type="checkbox" name="is_active"> <strong>Publish to the public Shop</strong></label><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn dark" type="submit" id="productSave">Save product</button><button class="btn" type="button" id="productReset">Clear / New product</button></div></form>';
}
function render(){
 const root=$('#shopAdminRoot');
 root.innerHTML='<div id="shopAdminMessage" class="shop-message" role="status">Shop Manager connected. Only administrators can change products and view orders.</div><div class="admin-stats" style="margin-top:24px"><div class="stat-card"><span>All products</span><strong>'+products.length+'</strong></div><div class="stat-card"><span>Published</span><strong>'+products.filter(p=>p.is_active).length+'</strong></div><div class="stat-card"><span>Shop orders</span><strong>'+orders.length+'</strong></div><div class="stat-card"><span>Waiting for review</span><strong>'+orders.filter(o=>o.status==='awaiting_review').length+'</strong></div></div><div class="shop-checkout-grid" style="grid-template-columns:1.1fr .9fr;gap:20px;margin-bottom:25px">'+productForm()+'<section class="panel"><h2>Product catalogue</h2><p class="muted">Edit a product to update its details. Uncheck Publish to remove it from the customer-facing store without losing order history.</p><div id="productList">'+(products.map(p=>'<div class="shop-history-row"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku)+' · '+money(p.price_cents)+' · '+(p.stock_qty==null?'Made to order':p.stock_qty+' in stock')+' · '+(p.is_active?'Published':'Hidden')+'</small></div><button class="btn small" type="button" data-edit="'+p.id+'">Edit</button></div>').join('')||'<p>No products yet. Use the form to create your first item.</p>')+'</div></section></div><section class="panel"><h2>Retail orders</h2><p class="muted">Orders are pending confirmation; update status only after contacting the customer. Card payments are not enabled. Delivery charges must be confirmed before collecting payment.</p><div id="shopAdminOrders">'+(orders.map(o=>orderCard(o)).join('')||'<p>No retail orders yet.</p>')+'</div></section>';
 $('#productEditor').addEventListener('submit',saveProduct);
 $('#productReset').addEventListener('click',resetProduct);
 $('#productList').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)editProduct(b.dataset.edit);});
 $('#shopAdminOrders').addEventListener('click',e=>{const b=e.target.closest('[data-save-order]');if(b)saveOrder(b.dataset.saveOrder);});
}
function orderCard(o){
 const lines=(o.shop_order_items||[]).map(i=>esc(i.product_name)+' × '+i.quantity+' ('+money(i.line_total_cents)+')').join('; ');
 const statuses=statusList.map(x=>'<option value="'+x+'" '+(x===o.status?'selected':'')+'>'+esc(x.replaceAll('_',' '))+'</option>').join('');
 const payments=['unpaid','paid','refunded'].map(x=>'<option value="'+x+'" '+(x===o.payment_status?'selected':'')+'>'+x+'</option>').join('');
 return '<article class="shop-history-row" data-order="'+o.id+'" style="display:block;margin:14px 0"><div style="display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap"><div><strong>Shop #'+o.order_number+' · '+esc(o.customer_name)+'</strong><small>'+esc(o.customer_email)+' · '+esc(o.phone)+' · '+new Date(o.created_at).toLocaleString('en-AU')+'</small></div><strong>'+money(o.subtotal_cents+(o.delivery_fee_cents||0))+'</strong></div><p><b>Items:</b> '+lines+'</p><p><b>Fulfilment:</b> '+esc(o.fulfilment)+(o.delivery_address?' · '+esc(o.delivery_address):'')+'</p>'+(o.customer_notes?'<p><b>Notes:</b> '+esc(o.customer_notes)+'</p>':'')+'<div class="formgrid"><label class="field">Order status<select data-field="status">'+statuses+'</select></label><label class="field">Payment status<select data-field="payment_status">'+payments+'</select></label><label class="field">Delivery fee (AUD; blank if not confirmed)<input type="number" min="0" step="0.01" data-field="delivery_fee" value="'+(o.delivery_fee_cents==null?'':(o.delivery_fee_cents/100).toFixed(2))+'"></label><div style="align-self:end"><button type="button" class="btn dark" data-save-order="'+o.id+'">Save order update</button></div></div></article>';
}
function editProduct(id){
 const p=products.find(p=>p.id===id);if(!p)return;
 editing=id;const f=$('#productEditor');
 for(const n of ['name','sku','category','description','image_url'])f.elements[n].value=p[n]||'';
 f.elements.price.value=(p.price_cents/100).toFixed(2);
 f.elements.stock.value=p.stock_qty==null?'':p.stock_qty;
 f.elements.is_active.checked=p.is_active;f.elements.photo.value='';
 $('#editorTitle').textContent='Edit: '+p.name;f.scrollIntoView({behavior:'smooth',block:'start'});
}
function resetProduct(){
 editing=null;$('#productEditor').reset();$('#editorTitle').textContent='Add a product';alertMessage('New product form ready.');
}
async function saveProduct(e){
 e.preventDefault();const f=e.currentTarget,fd=new FormData(f);
 const p=Number(fd.get('price')),cents=Math.round(p*100);
 if(!Number.isFinite(cents)||cents<1||cents>100000000)return alertMessage('Enter a valid price in AUD.',true);
 const stockRaw=String(fd.get('stock')||'').trim();const stock=stockRaw===''?null:Number(stockRaw);
 if(stock!==null&&(!Number.isInteger(stock)||stock<0||stock>100000))return alertMessage('Enter a valid stock quantity.',true);
 let imageUrl=String(fd.get('image_url')||'').trim()||null;
 if(imageUrl&&!/^https:\/\//i.test(imageUrl))return alertMessage('Product image URL must use HTTPS.',true);
 const file=f.elements.photo.files?.[0];
 if(file){
  if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))return alertMessage('Upload JPG, PNG or WebP under 5 MB.',true);
  const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];
  const path='products/'+crypto.randomUUID()+'.'+ext;
  alertMessage('Uploading product photo…');
  const uploaded=await supabase.storage.from('shop-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(uploaded.error)return alertMessage('Photo upload failed: '+uploaded.error.message,true);
  imageUrl=supabase.storage.from('shop-images').getPublicUrl(path).data.publicUrl;
 }
 const data={
   name:String(fd.get('name')||'').trim(),sku:String(fd.get('sku')||'').trim(),
   category:String(fd.get('category')||'Other'),description:String(fd.get('description')||'').trim(),
   image_url:imageUrl,price_cents:cents,stock_qty:stock,is_active:fd.get('is_active')==='on',updated_at:new Date().toISOString()
 };
 if(!data.name||!data.sku)return alertMessage('Name and SKU are required.',true);
 $('#productSave').disabled=true;alertMessage('Saving product…');
 try{
  const r=editing?await supabase.from('shop_products').update(data).eq('id',editing):await supabase.from('shop_products').insert(data);
  if(r.error)throw r.error;
  editing=null;await loadData();alertMessage('Product saved. Published products appear in the Shop automatically.');
 }catch(err){alertMessage('Could not save product: '+err.message,true);}
 finally{const btn=$('#productSave');if(btn)btn.disabled=false;}
}
async function saveOrder(id){
 const panel=document.querySelector('[data-order="'+id+'"]');if(!panel)return;
 const status=panel.querySelector('[data-field="status"]').value,payment_status=panel.querySelector('[data-field="payment_status"]').value;
 const raw=panel.querySelector('[data-field="delivery_fee"]').value.trim();
 const fee=raw===''?null:Math.round(Number(raw)*100);
 if(fee!==null&&(!Number.isFinite(fee)||fee<0))return alertMessage('Invalid delivery fee.',true);
 const o=orders.find(x=>x.id===id);if(o?.fulfilment==='delivery'&&['awaiting_payment','preparing','shipped','completed'].includes(status)&&fee===null)return alertMessage('Set a confirmed delivery fee before advancing this delivery order.',true);
 const r=await supabase.from('shop_orders').update({status,payment_status,delivery_fee_cents:fee,updated_at:new Date().toISOString()}).eq('id',id);
 if(r.error)return alertMessage(r.error.message,true);
 await loadData();alertMessage('Retail order #'+o.order_number+' updated.');
}
async function loadData(){
 const [p,o]=await Promise.all([
  supabase.from('shop_products').select('*').order('created_at',{ascending:false}),
  supabase.from('shop_orders').select('*,shop_order_items(product_name,quantity,unit_price_cents,line_total_cents)').order('created_at',{ascending:false}).limit(100)
 ]);
 if(p.error||o.error){$('#shopAdminRoot').textContent='Unable to load shop management: '+(p.error||o.error).message;return;}
 products=p.data||[];orders=o.data||[];render();
}
if(!isConfigured){$('#shopAdminRoot').textContent='Shop database not configured.';}
else{
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user){$('#shopAdminRoot').innerHTML='<div class="notice">Please <a href="account.html">sign in to your account</a> to access the Shop Manager.</div>';}
 else{
  const check=await supabase.rpc('is_current_user_admin');
  if(check.error||check.data!==true){$('#shopAdminRoot').textContent='Administrator access required.';}
  else await loadData();
 }
}
