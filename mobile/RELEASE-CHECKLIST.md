# Production release gate — Barlas Print Studio

This file documents remaining requirements. None of the boxes below imply completion.

- [ ] Run npm install and npm run typecheck successfully in CI
- [ ] Confirm Supabase RLS protects all orders, addresses, files and admin data
- [ ] Verify website checkout with test payments and webhook reconciliation
- [ ] Test login persistence, upload picker, back navigation and checkout on physical iPhone and Android
- [ ] Verify privacy policy, terms, refund policy and account deletion process
- [ ] Add final owned icon/splash art, screenshots, support URL and store listing
- [ ] Confirm hybrid WebView features meet Apple and Google review guidelines
- [ ] Create EAS project and configure iOS/Android signing credentials
- [ ] Build and test signed release candidates
- [ ] Submit to Apple App Store and Google Play using owner accounts
- [ ] Monitor crashes and support requests after approval

Existing shop admin and invoice pages are integrated as web screens. They are not a replacement for a native admin app. Push notifications, native payment UI, background sync and native order management are not yet implemented.
