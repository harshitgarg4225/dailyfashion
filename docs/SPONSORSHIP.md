# Selling the sponsor slot

How Daily Fashion makes money, and the rules the placement operates under.

## The model

One sponsor at a time, sold directly, for a period. The creative ships inside
the app build — there is no ad network, no SDK, no auction, and no request made
at runtime.

That choice has consequences worth being explicit about, because they are the
design rather than a limitation to route around later:

- **Nothing is fetched from a sponsor, so nothing is tracked.** The creative
  ships inside the build, so it stays within `connect-src 'self'`, the privacy
  claim in onboarding stays literally true, and the browser test that fails the
  build on any cross-origin request keeps passing. A hosted image or an
  impression pixel would break all three, which is why neither is on offer.
- **There are no impression counts to bill against.** Inventory is sold as a
  flat placement for a period, the way a magazine sells a page. Reach is
  described honestly as an estimate, never as verified delivery.
- **Changing sponsor means shipping a build.** A real operational cost, and an
  acceptable one at a monthly cadence.

## Selling a slot

Set `SPONSOR` in `src/lib/sponsor.ts`, drop the creative into `public/`, and
deploy. Setting it back to `null` removes the placement entirely — an unsold
slot leaves no trace, no frame, no placeholder.

```ts
export const SPONSOR: Sponsor | null = {
  kicker: 'A Maison',
  headline: 'The autumn coat',
  body: 'One sentence. Written in the app’s voice, not the brand’s.',
  href: 'https://example.com/coat',
  image: '/sponsor/coat.jpg',
  cta: 'Have a look',
}
```

Images must live under `public/` so they are served same-origin. A remote URL
will be blocked by the CSP, which is the intended behaviour and not a bug to
work around.

## Placement rules

Enforced in `shouldShowSponsor` and covered by `sponsor.test.ts`. They are
ethical constraints rather than preferences, which is why they are tested:
revenue pressure always argues for one more impression, and these are precisely
the rules that would otherwise be quietly relaxed.

| Rule | Why |
|---|---|
| Never on the evening screen | It is where someone records how they felt about their day. Selling into that moment is what the copy discipline exists to prevent, and no creative makes it acceptable. |
| Never after a low or middling day | Fashion advertising immediately after someone taps "Not great" is the worst placement this product could offer. If the most recent rated day was 3 or below and recent, the app stays quiet. |
| Not before 5 logged days | Nobody has received value yet. An advert before the product has done anything is the fastest route to deletion. |
| Once per session | It is a page in a magazine, not a feed. |

The evening screen is not merely excluded by a condition — it is absent from
the `SponsorSlot` union, so placing one there is a type error.

## What is deliberately not on the table

**Affiliate links, commissions, or "shop this look."** The entire product is a
credibility claim: *here is proof, drawn from your own evidence.* The moment
the app has a commercial interest in what someone wears, every observation
becomes suspect — "you get complimented most in blue" stops being a finding and
becomes a suspicion. That trades the only durable asset for a single-digit CPA.

**Any programmatic network.** It would require third-party scripts and
connections, a device identifier, and a consent flow, and it would make the
onboarding copy false on the day it shipped.

## Pricing

The audience is small, high-intent and affluent, and the placement is
exclusive. Sell it as a page in a good magazine — a flat fee for the period —
rather than on volume. Untargeted programmatic on this traffic would yield
roughly $0.30–0.75 per user per month; a single direct placement should beat
that comfortably at a fraction of the audience size.
