# Barlas Print Studio mobile app

## Current scope

Expo / React Native app for iOS and Android. Native home screen displays the live active product catalogue from the existing BPS Supabase backend. Integrated screens open the existing secure BPS website workflows in embedded browser views: shop/cart/checkout, quote and artwork upload, account, tracking, shop administration, production dashboard, and invoices. Existing website role checks remain responsible for admin access.

**Important:** The native home-screen enquiry list is local only; to place a real order use **Shop & Checkout**. The embedded website checkout requires the same login and confirmation process as the website. Payments are only available when the website's existing payment feature is enabled. No claim is made that native payments or notifications are implemented.

## Development

```bash
cd mobile
npm install
npm run typecheck
npx expo start
```

Native preview and release builds require Expo credentials and native testing. Before release, run `npx expo install --fix` and test on real iOS/Android devices.

## Release preparation

1. Supply final app icon, splash image, screenshots, support contact and privacy policy.
2. Verify website forms, file upload, account authentication, checkout, order status and administrator access inside iOS and Android WebViews.
3. Review external checkout and account handling against current Apple/Google review policies; the current hybrid app may require more native functionality to pass review.
4. Configure EAS project credentials and developer accounts; run `eas build --platform all --profile production` and test builds.
5. Submit builds using the account owners' Apple/Google developer credentials. Approval is controlled by the stores.

## Security

Only a public Supabase publishable key is included. Never commit a service-role key, Stripe secret, signing certificate or store password. Existing Supabase RLS and server-side order validation must be verified before launch. The in-app management links do not bypass website authorization.
