import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://barlasprintstudio.com.au","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer "))return reply({error:"Login required"},401);
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}}});
  const {data:auth,error:authError}=await supabase.auth.getUser();
  if(authError||!auth.user)return reply({error:"Invalid login"},401);
  const {data:admin,error:adminError}=await supabase.rpc("is_current_user_admin");
  if(adminError||admin!==true)return reply({error:"Admin permission required"},403);
  const body=await req.json();
  if(typeof body.invoice_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.invoice_id))return reply({error:"Invalid invoice ID"},400);
  const {data:invoice,error:invoiceError}=await supabase.from("invoices").select("*").eq("id",body.invoice_id).single();
  if(invoiceError||!invoice)return reply({error:"Invoice not found",detail:invoiceError?.message},404);
  if(!invoice.customer_email||!invoice.total||invoice.status==="void")return reply({error:"Invoice cannot be sent"},400);
  const key=Deno.env.get("RESEND_API_KEY");
  if(!key)return reply({error:"Email service not configured"},503);
  const money=(n:unknown)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(n)||0);
  const money=(n:unknown)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(n)||0);
  const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
  const amountDue=Number(invoice.amount_due??invoice.total)||0;
  const invoiceTotal=Number(invoice.total)||0;
  const depositCredit=Number(invoice.deposit_credit)||0;
  const kind=invoice.invoice_kind==="deposit"?"Deposit receipt":"Final invoice";
  const {data:items,error:itemError}=await supabase.from("invoice_items").select("product,description,quantity,unit_price,line_total").eq("invoice_id",invoice.id).order("id");
  if(itemError)return reply({error:"Invoice details unavailable",detail:itemError.message},500);
  const rows=(items||[]).map((item:any)=>"<tr><td style=\"padding:9px;border-bottom:1px solid #eee\">"+escapeHtml(item.product)+"</td><td style=\"padding:9px;border-bottom:1px solid #eee\">"+escapeHtml(item.description||"")+"</td><td style=\"padding:9px;text-align:center;border-bottom:1px solid #eee\">"+item.quantity+"</td><td style=\"padding:9px;text-align:right;border-bottom:1px solid #eee\">"+money(item.unit_price)+"</td><td style=\"padding:9px;text-align:right;border-bottom:1px solid #eee\">"+money(item.line_total)+"</td></tr>").join("");
  const content=[
    "Hello "+invoice.customer_name+",",
    "",
    kind+" from Barlas Print Studio.",
    "",
    "Invoice: "+invoice.invoice_number,
    "Order: "+invoice.order_number,
    "Issue date: "+invoice.issue_date,
    "Due date: "+(invoice.due_date||"As agreed"),
    "Subtotal: "+money(invoice.subtotal),
    "GST: "+money(invoice.gst),
    "Delivery fee: "+money(invoice.delivery_fee),
    "Invoice total: "+money(invoiceTotal),
    ...(depositCredit>0?["Deposit received: -"+money(depositCredit)]:[]),
    (amountDue>0?"Balance due: ":"Amount paid: ")+money(amountDue>0?amountDue:invoiceTotal),
    "",
    invoice.notes||"",
    ...(amountDue>0?["Payment by PayID (ABN): 50393779735","Payment reference: "+invoice.invoice_number,"Please verify the recipient name in your banking app before transferring."]:["Payment received. Thank you."]),
    "",
    "View your invoice at https://barlasprintstudio.com.au/account.html",
    "",
    "Regards,",
    "Barlas Print Studio",
    "ABN 50 393 779 735"
  ].join("\n");
  const emailHtml=[
    "<!doctype html><html lang=\"en-AU\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+escapeHtml(kind)+" "+escapeHtml(invoice.invoice_number)+"</title></head>",
    "<body style=\"margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#202020\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f4f1e9;padding:28px 12px\"><tr><td align=\"center\">",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:760px;background:#fff;border:1px solid #e7e1d6;border-radius:14px;overflow:hidden\">",
    "<tr><td style=\"padding:24px 28px;background:#171614;color:#fff\"><img src=\"https://barlasprintstudio.com.au/assets/barlas-wordmark.png\" width=\"210\" alt=\"Barlas Print Studio\" style=\"display:block;max-width:100%;height:auto\"></td></tr>",
    "<tr><td style=\"padding:28px\"><p style=\"margin:0 0 8px;color:#666;font-size:12px;letter-spacing:2px\">"+escapeHtml(kind.toUpperCase())+"</p><h1 style=\"margin:0 0 8px;font-size:27px\">"+escapeHtml(invoice.invoice_number)+"</h1>",
    "<p style=\"margin:0 0 20px;color:#666\">For order "+escapeHtml(invoice.order_number)+" · "+escapeHtml(invoice.customer_name)+"</p>",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse\"><thead><tr><th align=\"left\" style=\"padding:9px;border-bottom:2px solid #171614\">Item</th><th align=\"left\" style=\"padding:9px;border-bottom:2px solid #171614\">Description</th><th align=\"center\" style=\"padding:9px;border-bottom:2px solid #171614\">Qty</th><th align=\"right\" style=\"padding:9px;border-bottom:2px solid #171614\">Unit</th><th align=\"right\" style=\"padding:9px;border-bottom:2px solid #171614\">Total</th></tr></thead><tbody>"+rows+"</tbody></table>",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin-top:20px;border-collapse:collapse\">",
    "<tr><td style=\"padding:8px 12px;color:#555\">Subtotal</td><td align=\"right\" style=\"padding:8px 12px\">"+money(invoice.subtotal)+"</td></tr>",
    "<tr><td style=\"padding:8px 12px;color:#555\">GST</td><td align=\"right\" style=\"padding:8px 12px\">"+money(invoice.gst)+"</td></tr>",
    "<tr><td style=\"padding:8px 12px;color:#555\">Delivery fee</td><td align=\"right\" style=\"padding:8px 12px\">"+money(invoice.delivery_fee)+"</td></tr>",
    "<tr><td style=\"padding:12px;border-top:2px solid #171614;font-weight:700\">Invoice total</td><td align=\"right\" style=\"padding:12px;border-top:2px solid #171614;font-weight:700;font-size:18px\">"+money(invoiceTotal)+"</td></tr>",
    (depositCredit>0?"<tr><td style=\"padding:8px 12px;color:#555\">Deposit received</td><td align=\"right\" style=\"padding:8px 12px\">−"+money(depositCredit)+"</td></tr>":""),
    "<tr><td style=\"padding:12px;border-top:1px solid #bbb;font-weight:700\">"+(amountDue>0?"Balance due":"Amount paid")+"</td><td align=\"right\" style=\"padding:12px;border-top:1px solid #bbb;font-weight:700;font-size:20px\">"+money(amountDue>0?amountDue:invoiceTotal)+"</td></tr></table>",
    "<p style=\"line-height:1.6\">"+escapeHtml(invoice.notes||"")+"</p>",
    (amountDue>0?"<div style=\"margin:18px 0;padding:14px;background:#f8f6f1;border-radius:8px\"><strong>PayID (ABN):</strong> 50393779735<br><strong>Payment reference:</strong> "+escapeHtml(invoice.invoice_number)+"<br>Please verify the recipient name in your banking app.</div>":"<p style=\"color:#17633b;font-weight:700\">Payment received. Thank you.</p>"),
    "<div style=\"margin:24px 0;text-align:center\"><a href=\"https://barlasprintstudio.com.au/account.html#invoices\" style=\"display:inline-block;padding:13px 22px;border-radius:8px;background:#171614;color:#fff;text-decoration:none;font-weight:700\">View invoice</a></div></td></tr>",
    "<tr><td style=\"padding:18px 28px;background:#f8f6f1;color:#777;font-size:12px\">Barlas Print Studio · ABN 50 393 779 735 · 0406 577 675<br>info@barlasprintstudio.com.au</td></tr></table></td></tr></table></body></html>"
  ].join("");
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"Barlas Print Studio <info@barlasprintstudio.com.au>",to:[invoice.customer_email],reply_to:"info@barlasprintstudio.com.au",subject:"Barlas Print Studio "+kind+" "+invoice.invoice_number,text:content,html:emailHtml})});
  const result=await sent.json().catch(()=>({}));
  if(!sent.ok)return reply({error:"Email provider rejected the invoice",detail:result.message||"Check Resend logs"},502);
  const {error:updateError}=await supabase.from("invoices").update({status:invoice.status==="draft"?"sent":invoice.status,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",invoice.id);
  return reply({sent:true,email_id:result.id,tracking_updated:!updateError,tracking_error:updateError?.message});
 }catch(e){return reply({error:"Invoice email failed",detail:String(e)},500);}
});