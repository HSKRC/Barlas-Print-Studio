
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://barlasprintstudio.com.au",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "Login required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } }
    );

    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      return respond({ error: "Invalid login" }, 401);
    }

    const { data: isAdmin, error: adminError } =
      await supabase.rpc("is_current_user_admin");

    if (adminError || isAdmin !== true) {
      return respond({
        error: "Admin permission required",
        detail: adminError?.message
      }, 403);
    }

    const body = await req.json();
    const quoteId = Number(body.quote_id);

    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) {
      return respond({ error: "Invalid quote ID" }, 400);
    }

    const { data: quote, error: quoteError } = await supabase
      .from("quote_requests")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      return respond({
        error: "Quote not found",
        detail: quoteError?.message
      }, 404);
    }

    if (quote.status !== "quoted" || Number(quote.quoted_total) <= 0) {
      return respond({
        error: "Save a valid quote before sending"
      }, 400);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      return respond({ error: "RESEND_API_KEY is missing" }, 503);
    }

    const money = (value: unknown) =>
      new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD"
      }).format(Number(value) || 0);

    const escapeHtml = (value: unknown) =>
      String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char] || char);

    const quoteDate = quote.quoted_at
      ? new Date(quote.quoted_at).toLocaleDateString("en-AU")
      : new Date().toLocaleDateString("en-AU");
    const validUntil = quote.quote_valid_until
      ? new Date(quote.quote_valid_until + "T00:00:00").toLocaleDateString("en-AU")
      : "As discussed";
    const total = Number(quote.quoted_total) || 0;
    const depositAmount = Math.round(total * (total < 300 ? 1 : 0.5) * 100) / 100;
    const detailRow = (label: string, value: unknown) =>
      "<tr><td style=\"padding:9px 12px;color:#5b5b5b;border-bottom:1px solid #eee\">" +
      escapeHtml(label) +
      "</td><td style=\"padding:9px 12px;text-align:right;font-weight:600;border-bottom:1px solid #eee\">" +
      escapeHtml(value == null || value === "" ? "—" : value) +
      "</td></tr>";

    const details = [
      detailRow("Product", quote.product || "Printing services"),
      detailRow("Quantity", quote.quantity || "As discussed"),
      detailRow("Size", quote.size),
      detailRow("Material / paper", quote.paper),
      detailRow("Print sides", quote.print_sides),
      detailRow("Finish", quote.finish),
      detailRow("Design service", quote.design_service ? "Yes" : "No"),
      detailRow("Turnaround", quote.quoted_turnaround || quote.quoted_delivery || "To be confirmed")
    ].join("");

    const emailText = [
      "Hello " + quote.full_name + ",",
      "",
      quote.quote_message || "Thank you for your enquiry.",
      "",
      "BARLAS PRINT STUDIO — QUOTATION #" + quote.id,
      "Date: " + quoteDate,
      "Valid until: " + validUntil,
      "Product: " + (quote.product || "Printing services"),
      "Quantity: " + (quote.quantity || "As discussed"),
      "Subtotal: " + money(quote.quoted_subtotal),
      "GST: " + money(quote.quoted_gst),
      "Delivery fee: " + money(quote.quoted_delivery_fee),
      "Total: " + money(quote.quoted_total),
      "Deposit on acceptance: " + money(depositAmount),
      "",
      "To accept or decline this quotation, sign in to your account:",
      "https://barlasprintstudio.com.au/account.html#quotes",
      "",
      "Call 0406 577 675 or reply to this email if you have questions.",
      "Barlas Print Studio"
    ].join("\n");

    const emailHtml = [
      "<!doctype html><html lang=\"en-AU\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Quotation #" + quote.id + "</title></head>",
      "<body style=\"margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#202020\">",
      "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f4f1e9;padding:28px 12px\"><tr><td align=\"center\">",
      "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:680px;background:#fff;border:1px solid #e7e1d6;border-radius:14px;overflow:hidden\">",
      "<tr><td style=\"padding:24px 28px;background:#171614;color:#fff\"><img src=\"https://barlasprintstudio.com.au/assets/barlas-wordmark.png\" width=\"210\" alt=\"Barlas Print Studio\" style=\"display:block;max-width:100%;height:auto\"><div style=\"margin-top:12px;color:#d9d5cc;font-size:12px;letter-spacing:2px\">PRINTING · DESIGN · SIGNAGE</div></td></tr>",
      "<tr><td style=\"padding:28px\"><p style=\"margin:0 0 10px;color:#666;font-size:12px;letter-spacing:2px\">QUOTATION #" + quote.id + "</p>",
      "<h1 style=\"margin:0 0 8px;font-size:28px\">Your print quotation</h1><p style=\"margin:0 0 22px;color:#666\">Prepared for " + escapeHtml(quote.full_name) + " · " + quoteDate + "</p>",
      "<p style=\"line-height:1.6\">" + escapeHtml(quote.quote_message || "Thank you for your enquiry. Please review your quotation below.") + "</p>",
      "<h2 style=\"margin:26px 0 10px;font-size:17px\">Job details</h2><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse\">" + details + "</table>",
      "<h2 style=\"margin:26px 0 10px;font-size:17px\">Price summary</h2><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse\">",
      detailRow("Subtotal", money(quote.quoted_subtotal)),
      detailRow("GST", money(quote.quoted_gst)),
      detailRow("Delivery fee", money(quote.quoted_delivery_fee)),
      "<tr><td style=\"padding:14px 12px;font-size:17px;font-weight:700;border-top:2px solid #171614\">Total</td><td style=\"padding:14px 12px;text-align:right;font-size:20px;font-weight:700;border-top:2px solid #171614\">" + money(total) + "</td></tr></table>",
      "<p style=\"margin:18px 0 0;color:#555;font-size:14px;line-height:1.6\"><strong>Valid until:</strong> " + escapeHtml(validUntil) + "<br><strong>Deposit after acceptance:</strong> " + money(depositAmount) + " (production begins after deposit is confirmed).</p>",
      "<div style=\"margin:26px 0;text-align:center\"><a href=\"https://barlasprintstudio.com.au/account.html#quotes\" style=\"display:inline-block;padding:14px 24px;border-radius:8px;background:#171614;color:#fff;text-decoration:none;font-weight:700\">Sign in to accept or decline</a></div>",
      "<p style=\"margin:0;color:#666;font-size:13px;line-height:1.6\">If you do not have an account yet, create one using this same email address, confirm your email, then sign in to view this quotation. Questions? Call <a href=\"tel:+61406577675\" style=\"color:#171614\">0406 577 675</a> or reply to this email.</p>",
      "</td></tr><tr><td style=\"padding:18px 28px;background:#f8f6f1;color:#777;font-size:12px;line-height:1.6\">Barlas Print Studio · Dandenong & Melbourne, Victoria<br><a href=\"mailto:info@barlasprintstudio.com.au\" style=\"color:#555\">info@barlasprintstudio.com.au</a></td></tr>",
      "</table></td></tr></table></body></html>"
    ].join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Barlas Print Studio <info@barlasprintstudio.com.au>",
        to: [quote.email],
        reply_to: "info@barlasprintstudio.com.au",
        subject: `Barlas Print Studio Quote #${quote.id}`,
        text: emailText,
        html: emailHtml
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return respond({
        error: "Resend could not send the email",
        detail: result.message || "Check Resend logs"
      }, 502);
    }

    return respond({
      sent: true,
      email_id: result.id
    });

  } catch (error) {
    return respond({
      error: "Email sending failed",
      detail: String(error)
    }, 500);
  }
});
