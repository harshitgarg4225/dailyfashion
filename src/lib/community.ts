/**
 * The community: one subreddit, reached by a link, joined from here.
 *
 * The product's only distribution is somebody showing their week to somebody
 * else, and a community is where that compounds. Reddit is the venue because
 * it is somewhere better at moderation, threading and blocking than anything
 * this app should build — the same argument share.ts makes about the share
 * sheet. The app's entire involvement is a link out.
 *
 * What this must never become: a feed inside the app. The moment other
 * people's weeks render here, this stops being a private log and the felt
 * score stops being honest (the shareCard.ts argument, at community scale).
 * The community lives on Reddit, the log lives on the device, and the link
 * between them is one-directional.
 *
 * The subreddit is set to restricted on the Reddit side, so posting is for
 * people who arrived from the app — the link below is the door.
 */

/** The one place the community lives. Navigation, not a request: the app never fetches from it. */
/*
 * Flip to true the day the subreddit actually exists. Until then the app
 * shows the weekly theme (self-contained value) but not the buttons — a
 * button that lands on Reddit's "community not found" page costs more trust
 * than the feature is worth before launch.
 */
export const COMMUNITY_LIVE = false

export const COMMUNITY_URL = 'https://www.reddit.com/r/DailyFashionLog/'

/** Straight to the image-post composer, for the moment the card is in hand. */
export const COMMUNITY_SUBMIT_URL = 'https://www.reddit.com/r/DailyFashionLog/submit?type=IMAGE'
