import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"https://barlasprintstudio.com.au","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer "))return reply({error:"Login required"},401);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}}});
  const {data:user,error:userError}=await db.auth.getUser();
  if(userError||!user.user)return reply({error:"Invalid login"},401);
  const {data:admin,error:adminError}=await db.rpc("is_current_user_admin");
  if(adminError||admin!==true)return reply({error:"Admin permission required"},403);
  const body=await req.json();
  if(typeof body.order_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.order_id))return reply({error:"Invalid order ID"},400);
  const {data:order,error:orderError}=await db.from("orders").select("*").eq("id",body.order_id).single();
  if(orderError||!order)return reply({error:"Order not found",detail:orderError?.message},404);
  if(order.status==="completed"||order.status==="cancelled")return reply({error:"This order is closed"},400);
  const {data:quote,error:quoteError}=await db.from("quote_requests").select("full_name,email,product,quantity,size,paper,print_sides,finish,design_service,notes").eq("id",order.quote_id).single();
  if(quoteError||!quote)return reply({error:"Quotation details unavailable",detail:quoteError?.message},404);
  const key=Deno.env.get("RESEND_API_KEY");
  if(!key)return reply({error:"Email service not configured"},503);
  const date=order.due_at?new Date(order.due_at).toLocaleDateString("en-AU",{timeZone:"Australia/Melbourne",weekday:"long",year:"numeric",month:"long",day:"numeric"}):"To be confirmed";
  const money=(n:unknown)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(n)||0);
  const status=String(order.status||"approved").replaceAll("_"," ");
  const description=[quote.size,quote.paper,quote.print_sides,quote.finish].filter(Boolean).join(" · ");
  const customerText=[
   "Hello "+quote.full_name+",",
   "",
   "Your Barlas Print Studio order has been created.",
   "",
   "Order number: "+order.order_number,
   "Status: "+status,
   "Expected completion: "+date,
   "Product: "+quote.product,
   "Quantity: "+quote.quantity,
   description?"Job details: "+description:"",
   "Order total: "+money(order.total),
   order.delivery_method?"Delivery / collection: "+order.delivery_method:"",
   "",
   "You can view updates in your account: https://barlasprintstudio.com.au/account.html",
   "If the schedule changes, we will let you know.",
   "",
   "Barlas Print Studio · 0406 577 675 · info@barlasprintstudio.com.au"
  ].filter(Boolean).join("\n");
  const customerHtml=[
   "<!doctype html><html lang=\"en-AU\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Order "+escapeHtml(order.order_number)+"</title></head>",
   "<body style=\"margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#202020\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f4f1e9;padding:28px 12px\"><tr><td align=\"center\">",
   "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:660px;background:#fff;border:1px solid #e7e1d6;border-radius:14px;overflow:hidden\"><tr><td style=\"padding:24px 28px;background:#171614\"><img src=\"https://barlasprintstudio.com.au/assets/barlas-wordmark.png\" width=\"210\" alt=\"Barlas Print Studio\" style=\"display:block;max-width:100%;height:auto\"></td></tr>",
   "<tr><td style=\"padding:28px\"><p style=\"margin:0 0 8px;color:#666;font-size:12px;letter-spacing:2px\">ORDER CONFIRMATION</p><h1 style=\"margin:0 0 10px;font-size:27px\">Your order is confirmed</h1><p>Hello "+escapeHtml(quote.full_name)+", your print job has entered our production queue.</p>",
   "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;margin:20px 0\"><tr><td style=\"padding:9px;border-bottom:1px solid #eee;color:#666\">Order number</td><td align=\"right\" style=\"padding:9px;border-bottom:1px solid #eee;font-weight:700\">"+escapeHtml(order.order_number)+"</td></tr>",
   "<tr><td style=\"padding:9px;border-bottom:1px solid #eee;color:#666\">Product</td><td align=\"right\" style=\"padding:9px;border-bottom:1px solid #eee\">"+escapeHtml(quote.product)+"</td></tr>",
   "<tr><td style=\"padding:9px;border-bottom:1px solid #eee;color:#666\">Quantity</td><td align=\"right\" style=\"padding:9px;border-bottom:1px solid #eee\">"+escapeHtml(quote.quantity)+"</td></tr>",
   (description?"<tr><td style=\"padding:9px;border-bottom:1px solid #eee;color:#666\">Specifications</td><td align=\"right\" style=\"padding:9px;border-bottom:1px solid #eee\">"+escapeHtml(description)+"</td></tr>":""),
   "<tr><td style=\"padding:9px;border-bottom:1px solid #eee;color:#666\">Status</td><td align=\"right\" style=\"padding:9px;border-bottom:1px solid #eee;text-transform:capitalize\">"+escapeHtml(status)+"</td></tr>",
   "<tr><td style=\"padding:9px;color:#666\">Expected completion</td><td align=\"right\" style=\"padding:9px;font-weight:700\">"+escapeHtml(date)+"</td></tr></table>",
   (quote.notes?"<p><strong>Job notes:</strong> "+escapeHtml(quote.notes)+"</p>":""),
   "<div style=\"margin:24px 0;text-align:center\"><a href=\"https://barlasprintstudio.com.au/account.html#orders\" style=\"display:inline-block;padding:13px 22px;border-radius:8px;background:#171614;color:#fff;text-decoration:none;font-weight:700\">View order updates</a></div>",
   "<p style=\"color:#666;font-size:13px;line-height:1.6\">We will contact you if the expected completion date changes. Questions? Call 0406 577 675 or reply to this email.</p></td></tr><tr><td style=\"padding:18px 28px;background:#f8f6f1;color:#777;font-size:12px\">Barlas Print Studio · ABN 50 393 779 735 · Dandenong & Melbourne</td></tr></table></td></tr></table></body></html>"
  ].join("");
  const customerSent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"Barlas Print Studio <info@barlasprintstudio.com.au>",to:[quote.email],reply_to:"info@barlasprintstudio.com.au",subject:"Order "+order.order_number+" confirmed – Barlas Print Studio",text:customerText,html:customerHtml})});
  const customerResult=await customerSent.json().catch(()=>({}));
  if(!customerSent.ok)return reply({error:"Customer email was not sent",detail:customerResult.message||"Check Resend logs"},502);
  let employeeCount=0,employeeErrors:string[]=[];
  if(body.notify_staff!==false){
   const {data:staff,error:staffError}=await db.rpc("get_production_staff_emails");
   if(staffError)employeeErrors.push(staffError.message);
   else{
    await Promise.all((staff||[]).map(async(row:{email:string})=>{
     const staffText=["New print job in production queue","","Order: "+order.order_number,"Expected completion: "+date,"Product: "+quote.product,"Quantity: "+quote.quantity,description?"Specifications: "+description:"","Open the staff queue: https://barlasprintstudio.com.au/production.html"].filter(Boolean).join("\n");
     const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"Barlas Print Studio <info@barlasprintstudio.com.au>",to:[row.email],reply_to:"info@barlasprintstudio.com.au",subject:"New production job "+order.order_number,text:staffText})});
     if(result.ok)employeeCount++;else employeeErrors.push("A staff notification could not be sent.");
    }));
   }
  }
  return reply({sent:true,email_id:customerResult.id,customer_email:quote.email,employee_notifications_sent:employeeCount,employee_notification_errors:employeeErrors});
 }catch(error){return reply({error:"Order notification failed",detail:String(error)},500);}
});