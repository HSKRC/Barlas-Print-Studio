
import {createClient} from "npm:@supabase/supabase-js@2.117.2";
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 try{
 const {quote_id,token}=await req.json();
 if(!Number.isSafeInteger(quote_id)||quote_id<=0||typeof token!=="string"||!/^[0-9a-f-]{36}$/i.test(token))return new Response("Invalid request",{status:400});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data,error}=await db.rpc("get_quote_email_notification",{p_quote_id:quote_id,p_token:token});
 if(error)throw new Error("Notification lookup failed");
 if(!data)return new Response("Forbidden",{status:403});
 if(data.sent)return Response.json({sent:true});
 const q=data.quote;
 const key=Deno.env.get("RESEND_API_KEY");
 if(!key)throw new Error("Email service not configured");
 const text=["New quote request #"+q.id,"","Customer: "+q.full_name,"Email: "+q.email,"Phone: "+(q.phone||"Not supplied"),"Product: "+q.product,"Quantity: "+q.quantity,"Size: "+(q.size||"Not supplied"),"Material: "+(q.paper||"Not supplied"),"Sides: "+q.print_sides,"Finish: "+q.finish,"Design required: "+(q.design_service?"Yes":"No"),"","Notes / delivery:",q.notes||"None","","Review this request in the Barlas Print Studio admin dashboard."].join("\n");
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"bps-new-quote-"+q.id},body:JSON.stringify({from:"Barlas Print Studio <info@barlasprintstudio.com.au>",to:["info@barlasprintstudio.com.au"],subject:"New quote request #"+q.id+" — "+String(q.product).replace(/[\r\n]/g," "),text})});
 const result=await response.json();
 if(!response.ok)throw new Error("Email provider returned "+response.status);
 const done=await db.rpc("complete_quote_email_notification",{p_quote_id:quote_id,p_token:token,p_email_id:result.id});
 if(done.error)throw new Error("Delivery record failed");
 return Response.json({sent:true});
 }catch(error){console.error(String(error));return Response.json({error:"Notification could not be sent"},{status:500});}
});
