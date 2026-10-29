import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const allowed = "https://barlasprintstudio.com.au";
const headers = {"Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Vary":"Origin"};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async (req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return json(405,{error:"Method not allowed"});
 try{
  const key=Deno.env.get("STRIPE_SECRET_KEY");
  if(!key)return json(503,{error:"Secure card payments are not configured yet."});
  const url=Deno.env.get("SUPABASE_URL")??"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
  if(!url||!anon)return json(503,{error:"Payment service unavailable"});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return json(401,{error:"Please sign in first"});
  const client=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await client.auth.getUser(token);
  const user=auth.data.user;
  if(auth.error||!user)return json(401,{error:"Please sign in first"});
  const input=await req.json().catch(()=>null);
  const orderId=input?.order_id;
  if(typeof orderId!=="string"||!/^[a-f0-9-]{36}$/i.test(orderId))return json(400,{error:"Invalid order"});
  const setting=await client.from("shop_settings").select("payments_enabled").eq("id",1).single();
  if(setting.error||setting.data?.payments_enabled!==true)return json(503,{error:"Online payment is not enabled yet."});
  const {data:order,error}=await client.from("shop_orders").select("id,user_id,customer_email,order_number,fulfilment,status,payment_status,subtotal_cents,delivery_fee_cents,shop_order_items(product_name,quantity,unit_price_cents,line_total_cents)").eq("id",orderId).single();
  if(error||!order||order.user_id!==user.id)return json(404,{error:"Order not found"});
  if(order.status!=="awaiting_payment"||order.payment_status!=="unpaid")return json(409,{error:"Order is not ready for payment"});
  if(order.fulfilment==="delivery"&&order.delivery_fee_cents===null)return json(409,{error:"Delivery cost must be confirmed first"});
  const lines=(order.shop_order_items||[]);
  if(!lines.length||lines.length>30)return json(400,{error:"Order has no valid items"});
  let subtotal=0;
  const form=new URLSearchParams({
    mode:"payment",
    client_reference_id:order.id,
    "customer_email":user.email||order.customer_email,
    "metadata[shop_order_id]":order.id,
    "metadata[shop_order_number]":String(order.order_number),
    success_url:allowed+"/shop.html?payment=success#shopOrderHistory",
    cancel_url:allowed+"/shop.html?payment=cancelled#shopOrderHistory",
    "payment_method_types[0]":"card",
    "expires_at":String(Math.floor(Date.now()/1000)+1800)
  });
  for(const [i,line] of lines.entries()){
    if(!Number.isInteger(line.unit_price_cents)||line.unit_price_cents<1||!Number.isInteger(line.quantity)||line.quantity<1) return json(400,{error:"Invalid order items"});
    if(line.line_total_cents!==line.unit_price_cents*line.quantity)return json(409,{error:"Order pricing mismatch"});
    subtotal+=line.line_total_cents;
    form.set("line_items["+i+"][quantity]",String(line.quantity));
    form.set("line_items["+i+"][price_data][currency]","aud");
    form.set("line_items["+i+"][price_data][unit_amount]",String(line.unit_price_cents));
    form.set("line_items["+i+"][price_data][product_data][name]",line.product_name.slice(0,180));
  }
  if(subtotal!==order.subtotal_cents)return json(409,{error:"Subtotal mismatch"});
  const fee=order.delivery_fee_cents??0;
  if(fee>0){
   const i=lines.length;
   form.set("line_items["+i+"][quantity]","1");
   form.set("line_items["+i+"][price_data][currency]","aud");
   form.set("line_items["+i+"][price_data][unit_amount]",String(fee));
   form.set("line_items["+i+"][price_data][product_data][name]","Delivery");
  }
  const stripe=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":"bps-shop-"+order.id+"-"+order.updated_at},body:form.toString()});
  const data=await stripe.json().catch(()=>({}));
  if(!stripe.ok||!data.url)return json(502,{error:"Secure checkout could not be started. Please contact the studio."});
  return json(200,{url:data.url});
 }catch(e){console.error("shop payment session error",String(e));return json(500,{error:"Unable to start payment."});}
});