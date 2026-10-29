# Barlas Print Studio

Independent website for **Barlas Print Studio** — professional printing, custom apparel, mugs, business cards, flyers, brochures and large-format print services for Dandenong & Melbourne.

## Stack
- Static HTML/CSS/JavaScript frontend
- Dedicated Supabase project for Auth, database and private customer artwork storage
- Secure Row Level Security policies
- Customer accounts, quote requests, order tracking and admin dashboard

## Supabase
Project ref: `yyxobksldeifjlxjovak` (Sydney / ap-southeast-2)

Only the public project URL and publishable key are used in browser code. Never expose service-role or secret keys.

## Main pages
- Home
- Printing Services (custom quotes)
- Shop (ready-made products and bag)
- Pricing
- Gallery
- Get a Quote
- Customer Account
- Track Order
- Contact
- Admin
- Shop Manager (protected product publishing and retail order review)

## Status
Initial production-ready foundation. Add final business contact details, policies, final pricing and payment provider before public launch.

## Retail shop (2026-10-29)
- Customer shop: `/shop.html`, separate from custom print service quotes.
- Admin management: `/shop-admin.html` (existing Supabase administrator access required).
- Add a product with a real AUD price, SKU, category, stock, photo and description. Publish only after details are verified. The catalog starts empty intentionally; no fabricated prices or stock.
- Product photos: public `shop-images` bucket; only admins may upload. Supported file types are JPEG, PNG and WebP, max 5 MB.
- Customers sign in, create a shopping bag, choose pickup or request delivery and submit a pending order. Totals are calculated on the server. Orders are not charged online.
- Delivery fees are quoted separately and must be confirmed before the order moves forward. Staff review the order and record payment status manually. Stock is allocated only upon payment or advancement to preparation.
- A live payment gateway, automatic invoicing, fulfillment/shipping integrations and notification emails have NOT been configured; do not present this as a paid checkout.
- The production website deployment and a complete real-user checkout test should be checked independently.
