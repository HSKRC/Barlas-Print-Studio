import {createClient} from "npm:@supabase/supabase-js@2.117.2";
const reply=(status:number,message:string)=>new Response(message,{status,headers:{"Content-Type":"text/plain"}});
const hex=(s:string)=>{if(!/^[0-9a-f]+$/i.test(s)||s.length%2)return new Uint8Array(0);return Uint8Array.from(s.match(/../g)!.map(x=>parseInt(x,16)));};
const equal=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;};
Deno.serve(async (req:Request)=>{
 if(req.method!=="POST")return reply(405,"Method not allowed");
 const secret=Deno.env.get("STRIPE_WEBHOOK_SECRET");
 const supabaseUrl=Deno.env.get("SUPABASE_URL");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!secret||!supabaseUrl||!serviceKey)return reply(503,"Webhook not configured");
 const signature=req.headers.get("stripe-signature")||"";
 const t=signature.match(/(?:^|,)t=(\d+)/)?.[1];
 const signatures=[...signature.matchAll(/(?:^|,)v1=([a-f0-9]+)/g)].map(x=>x[1]);
 if(!t||!signatures.length||Math.abs(Date.now()/1000-Number(t))>300)return reply(400,"Invalid signature");
 const payload=await req.text();
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(t+"."+payload)));
 if(!signatures.some(s=>equal(hex(s),digest)))return reply(400,"Invalid signature");
 let evt:any;
 try{evt=JSON.parse(payload);}catch{return reply(400,"Invalid payload");}
 if(evt.type!=="checkout.session.completed")return reply(200,"Ignored event");
 const session=evt.data?.object;
 const orderId=session?.metadata?.shop_order_id;
 if(session?.mode!=="payment"||session?.payment_status!=="paid"||typeof orderId!=="string"||session.client_reference_id!==orderId||session.currency!=="aud")return reply(200,"Not a paid AUD shop checkout");
 const client=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:order,error}=await client.from("shop_orders").select("id,subtotal_cents,delivery_fee_cents,fulfilment,payment_status,status").eq("id",orderId).single();
 if(error||!order)return reply(404,"Order not found");
 if(order.payment_status==="paid")return reply(200,"Already processed");
 if(order.status!=="awaiting_payment"||order.payment_status!=="unpaid")return reply(409,"Order no longer payable");
 if(order.fulfilment==="delivery"&&order.delivery_fee_cents===null)return reply(409,"Delivery not yet priced");
 const amount=order.subtotal_cents+(order.delivery_fee_cents||0);
 if(session.amount_total!==amount||amount<1)return reply(409,"Amount mismatch");
 const update=await client.from("shop_orders").update({
  payment_status:"paid",paid_at:new Date().toISOString(),
  stripe_session_id:session.id,stripe_payment_intent:typeof session.payment_intent==="string"?session.payment_intent:null,
  updated_at:new Date().toISOString()
 }).eq("id",orderId).eq("payment_status","unpaid").select("id").maybeSingle();
 if(update.error){console.error("shop payment webhook failed",update.error.message);return reply(500,"Payment update failed");}
 return reply(200,update.data?"Payment confirmed":"Already processed");
});