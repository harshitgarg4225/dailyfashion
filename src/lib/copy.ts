/**
 * Every user-facing string in the app.
 *
 * Centralized for one reason: J8 requires a copy review pass over all of it,
 * and a review you can only do by grepping React components is a review that
 * silently rots. `copy.test.ts` asserts the ban list over this whole module,
 * so a banned word cannot reach a screen without failing the build.
 *
 * The rule the ban list encodes: the app talks about the clothes and the
 * feeling. It never talks about the body, and it never scores the person.
 */

/**
 * Words that must never appear in user-facing copy.
 *
 * The first six are from the spec. The rest are the same failure mode wearing
 * different clothes — appearance-judgment vocabulary that turns a log into a
 * verdict. `goal` is banned as a whole word only, so "goalkeeper" would pass
 * and "your goal weight" cannot.
 */
export const BANNED_WORDS = [
  'flattering',
  'flatter',
  'slimming',
  'slim',
  'figure',
  'fix',
  'problem area',
  'goal',
  // Same failure mode, different vocabulary.
  'weight',
  'measurement',
  'body',
  'waist',
  'thin',
  'thinner',
  'fat',
  'skinny',
  'curves',
  'tummy',
  'streak',
  'score',
  'rating',
  'grade',
  'improve',
  'better than',
  'should wear',
  'you look',
] as const

export const copy = {
  app: {
    name: 'Daily Fashion',
    tagline: 'A log of what you wore and how it went.',
  },

  onboarding: {
    /*
     * J4: this claim has to be literally true, not aspirational. It is.
     *
     * The app sends nothing anywhere. `connect-src 'self'` lets it fetch its
     * own files — the vision model that names garments is one of them — and
     * makes every other destination unreachable; the origin those files come
     * from answers 405 to anything carrying a body. Photos and notes never
     * leave IndexedDB except through export, which the user initiates and
     * which writes a file to their own device.
     *
     * If a future change adds a host to connect-src or a route that accepts a
     * body, this string stops being true and has to change with it.
     */
    privacyTitle: 'Nothing leaves this phone',
    privacyBody:
      'Your photos and notes are stored on this device only. There is no account, no sign-up, and the app never sends anything anywhere. You can turn on airplane mode and it works exactly the same.',
    privacyProof: 'Want to check? Turn on airplane mode and keep using it.',

    whatTitle: 'Two questions a day',
    whatBody:
      'In the morning, take one photo of what you are wearing. In the evening, answer two quick questions: how the day felt, and whether anything happened. That is the whole thing.',

    // J5: seeds the log so the app is useful on day one.
    seedTitle: 'Start with three days you already liked',
    seedBody:
      'Pick up to three photos from your camera roll of days you liked how you felt. They get added to your log with their original dates, so you begin with history instead of an empty grid.',
    seedSkip: 'Skip for now',
    seedPick: 'Choose photos',
    seedAsk: 'How did this day feel?',

    begin: 'Start logging',
    step: (index: number, total: number) => `Step ${index} of ${total}`,
    nextPrivacy: 'How it works',
    nextWhat: 'One last thing',
  },

  camera: {
    ready: 'Take one photo of what you are wearing.',
    shutter: 'Capture',
    timer: '3 second timer',
    timerOn: 'Timer on',
    flip: 'Flip camera',
    saved: 'Saved.',
    denied: 'Camera access is off. You can turn it on in your browser settings, or add a photo from your library instead.',
    pickInstead: 'Add from library',
    alreadyToday: 'You already logged today.',
    starting: 'Getting the camera ready…',
    failed: 'That one did not save. Try again.',
    logAnyway: 'Log another',
  },

  // J2 / the reframe: felt first, events second, both answerable in seconds.
  reminder: {
    notificationTitle: 'How did today go?',
    notificationBody: 'Two taps and it is logged.',
  },

  garment: {
    // "Looks like" marks it as the app's guess, not a fact. The user's own
    // word is shown bare — their word needs no hedge.
    suggested: (name: string) => `Looks like: ${name}`,
    add: 'Name this outfit',
    edit: 'Correct it',
    save: 'Save',
    placeholder: 'e.g. green linen shirt',
  },

  tonight: {
    title: 'Tonight',
    prompt: 'How did today feel?',
    feltLabels: {
      1: 'Not great',
      2: 'Meh',
      3: 'Fine',
      4: 'Good',
      5: 'Really good',
    } as Record<number, string>,
    chipsPrompt: 'Did anything happen?',
    chipsHint: 'Optional. Tap any that apply.',
    save: 'Done',
    skip: 'Skip tonight',
    remove: 'Remove this day',
    removeConfirm: 'Remove this day from your log?',
    removeGo: 'Remove',
    removed: 'Removed.',
    nothingToRate: 'Nothing waiting for a reflection.',
    savedThanks: 'Logged.',
    undo: 'Undo',
    notePrompt: 'Anything else?',
    noteHint: 'Optional. A few words, only for you.',
    wornBefore: (times: number) =>
      times === 1 ? 'Also worn once before' : `Also worn ${times} times`,
    // U9: connects the daily chore to the payoff it is building toward.
    why: 'Answering these is what lets the log tell you something later.',
    // J9: returning after a gap is neutral, never a reprimand.
    welcomeBack: 'Welcome back — here is what your log already knows.',
  },

  // Typing is a first-class way to record a day, not a lesser one.
  write: {
    title: 'Write it down',
    prompt: 'What did you wear, and how did it go?',
    hint: 'No photo needed. A line is plenty.',
    placeholder: 'Grey coat again. Warmer than it looked.',
    save: 'Save this day',
    action: 'Write instead',
    savedThanks: 'Written down.',
  },

  // The answer to "what am I getting out of this?", told with the log itself.
  sponsor: {
    label: 'Sponsored',
  },

  summary: {
    title: 'What you have built',
    empty: 'Nothing here yet. Your first day starts it.',
    since: (date: string) => `Since ${date}`,
    daysLabel: 'Days',
    eveningsLabel: 'Evenings answered',
    outfitsLabel: 'Outfits recognised',
    mix: (photographed: number, written: number) =>
      written === 0
        ? `${photographed} photographed.`
        : photographed === 0
          ? `${written} written down.`
          : `${photographed} photographed, ${written} written down.`,
    alreadyKnows: 'What it can already tell',
    mostWorn: (colour: string, days: number) =>
      `You reach for ${colour} most — ${days} day${days === 1 ? '' : 's'} of it.`,
    mostComplimented: (colour: string, complimented: number, days: number) =>
      `Someone said something nice on ${complimented} of your ${days} ${colour} day${days === 1 ? '' : 's'}.`,
    nextTitle: 'Next',
    nextBody: (remaining: number, unlocks: string) =>
      remaining === 0
        ? `Ready now: ${unlocks}.`
        : remaining === 1
          ? `One more day brings ${unlocks}.`
          : `${remaining} more days bring ${unlocks}.`,
    allUnlocked: 'Everything is open. From here it only gets more certain.',
  },

  /*
   * The weekly recap.
   *
   * The only screen allowed to speak before the fourteen-evening gate, and it
   * earns that by never making a claim — every line counts something that
   * happened. No superlatives, no "your colour is", nothing resting on an
   * average. See `weekWrapped.ts` for why that distinction is load-bearing.
   */
  week: {
    title: 'Your week',
    tab: 'This week',
    range: (from: string, to: string) => `${from} — ${to}`,
    thin: (have: number, need: number) =>
      `${have} of ${need} days logged this week. A few more and there is something to look back at.`,
    daysLabel: 'Days',
    answeredLabel: 'Evenings answered',
    repeatsLabel: 'Worn again',
    wornTitle: 'What you reached for',
    worn: (colours: string) => `Mostly ${colours}.`,
    repeats: (outfits: number, days: number) =>
      outfits === 1
        ? `One outfit came back — ${days} days of it.`
        : `${outfits} outfits came back this week.`,
    noRepeats: 'Everything this week was worn once.',
    eventsTitle: 'What happened',
    event: (label: string, days: number) =>
      days === 1 ? `${label} — 1 day` : `${label} — ${days} days`,
    // Says plainly what is on the card and what is not, before anything leaves.
    shareTitle: 'Share your week',
    shareBody:
      'Makes one image of this week’s photos to send wherever you like. It carries what you wore — never how the days felt, and never your notes.',
    shareGo: 'Make the image',
    sharePreparing: 'Putting it together…',
    shareShared: 'Sent to your share sheet.',
    shareSaved: 'Saved to your device.',
    shareFailed: 'That did not come together. Try again.',
    shareCaption: 'My week in Daily Fashion',
    shareNothing: 'Photograph a day or two first — the image is made of them.',
    // On a phone, the OS share sheet is the direct road to both apps.
    shareHint:
      'On your phone, the share sheet posts it straight to Instagram or Reddit.',
    communityTitle: 'The community',
    communityBody:
      'A quiet corner of Reddit where people post their week cards. It is only reachable from here — make your image first, then take it over.',
    communityGo: 'Post it in the community',
    communityJoin: 'Have a look first',
    // Counts, never conclusions — same licence as the rest of the recap.
    garmentsWorn: (text: string) => `Named: ${text}.`,
    yearTitle: 'The year so far',
    yearBody: (days: number) =>
      `${days} days logged across the last twelve months. The card samples photos from the whole span.`,
    yearGo: 'Make the year image',
    themeLabel: 'This week\u2019s theme',
  },

  log: {
    title: 'Journal',
    empty: 'Your log starts with your first photo.',
    unrated: 'No reflection yet',
    // J9: a missed day is whitespace, not a gap to be explained.
    addPast: 'Add a past day',
    pickDate: 'Which day?',
    pickDateHint: 'You can add any day from the past week.',
    loggedAgain: 'Added to today.',
    installTitle: 'Keep this on your home screen',
    installBodyIos:
      'Tap the share button, then “Add to Home Screen”. Browsers clear data for sites that are only open in a tab — on the home screen your log is far safer.',
    installDismiss: 'Not now',
    writtenDay: 'Written',
    /*
     * Search over the log.
     *
     * Appears only once the grid is long enough that scrolling has become the
     * problem it solves — before that it is a control offering to find one of
     * the four things already on screen.
     */
    searchLabel: 'Find a day',
    searchPlaceholder: 'grey coat, blue, complimented, March',
    searchClear: 'Clear',
    searchCount: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    searchNone: 'Nothing matching that. Try a colour, a word you wrote, or a month.',
    searchWhy: (reasons: string) => `Matched on ${reasons}.`,
    backdateLimit: 'You can add days from the past week.',
    entryCount: (n: number) => (n === 1 ? '1 day logged' : `${n} days logged`),
  },

  // J3: the "worn before?" prompt. One tap, never required.
  link: {
    ask: (date: string) => `Same as ${date}?`,
    yes: 'Yes, same outfit',
    no: 'Different',
    tagPrompt: 'Add a word for it?',
    tagHint: 'Optional. One or two words, like "blue jacket".',
    tagSave: 'Add',
  },

  // Everything asked after the shutter, on one surface.
  followUp: {
    title: 'Anything to add?',
    body: 'All optional. Your photo is already saved.',
    tempPrompt: 'What was it like out?',
    tempHint: 'This stops the log blaming a jacket for the weather.',
    done: 'Done',
  },

  // J6: a shortlist of what already worked. Not advice, not generated text.
  shortlist: {
    // The pick's own evidence: counts, never a conclusion.
    record: (wears: number, good: number) =>
      good === 0
        ? `Worn ${wears} times.`
        : `Worn ${wears} times — ${good} went well.`,
    title: 'Today',
    headerWeather: 'You felt best in these on days like today.',
    headerGeneral: 'You felt best in these lately.',
    wearAgain: 'Wearing this again',
    tempPrompt: 'What is it like out?',
    locked: 'This opens once you have about ten days logged.',
    remaining: (n: number) => `${n} more to go.`,
  },

  // J7: observation, evidence, question. Always shows n.
  insights: {
    provisionalLabel: 'Early',
    provisionalIntro:
      'One observation is starting to form. The numbers are small, so hold it lightly.',
    provisionalFooter:
      'At fourteen answered evenings this either firms up or is withdrawn. Early observations are wrong more often than settled ones.',
    title: 'What your log knows',
    empty: 'Nothing worth saying yet. Keep logging and this fills in.',
    // The honest version of "not enough data" — no false suspense.
    // Counts evenings answered, not photos taken — say which, or someone with
    // a week of photos and no reflections reads "0 of 14" as a broken app.
    thin: (have: number, need: number) =>
      `${have} of ${need} evenings answered. Observations start once there is enough to be fair.`,
    sample: (n: number) => (n === 1 ? 'from 1 day' : `from ${n} days`),
    // P3a: the payoff, made visible while it is still coming.
    countdown: (n: number) =>
      n === 0
        ? 'Enough logged. Observations start now.'
        : n === 1
          ? 'One more day and the first observation can appear.'
          : `${n} more days and the first observation can appear.`,
    position: (index: number, total: number) => `${index} of ${total}`,
    dismiss: 'Got it',
    next: 'Show me another',
    // P4a: scepticism is the right response to a claim about yourself. The only
    // useful answer is to show the arithmetic.
    /*
     * What a locked Patterns tab shows.
     *
     * A countdown alone tells someone how long to wait without telling them
     * what for. The example is a real card, with the numbers of a made-up
     * person, labelled unmistakably so it can never be mistaken for a claim
     * about them.
     */
    previewLabel: 'An example',
    previewIntro: 'Once there is enough, observations look like this.',
    previewObservation:
      'The green jacket sits at the top of your log, and you almost never reach for it.',
    previewEvidence:
      '4.6 average across 7 days, against 3.4 for everything else. Last worn a month ago.',
    previewQuestion: 'Worth putting on this week?',
    previewSample: 'from 7 days',
    previewFooter:
      'Yours will use your own days, and nothing appears until there are enough of them to be fair.',

    /*
     * The whole fortnight, not one card of it.
     *
     * A single teaser answers "what does a card look like" but not "is two
     * weeks of this worth my time", which is the question someone on day three
     * is actually asking. The example page answers it with the real output of
     * the real engine — see `example.ts` — so the answer cannot be more
     * flattering than the product.
     */
    exampleOpen: 'See a full two weeks',
    example: {
      eyebrow: 'An example',
      title: 'Two weeks in',
      intro:
        'A made-up fortnight, read by the same engine that will read yours. None of it is about you.',
      daysLabel: 'Days',
      eveningsLabel: 'Evenings answered',
      outfitsLabel: 'Outfits recognised',
      found: 'What it found',
      oneAtATime:
        'In your own log these arrive one at a time, each carrying the photograph from the day.',
      later:
        'One kind needs longer than a fortnight: the thing you like most and quietly stop reaching for. It cannot be certain until something has gone three weeks unworn.',
      back: 'Back to my log',
    },
    howTitle: 'How was this worked out?',
    howShow: 'How was this worked out?',
    howHide: 'Close',
    softened:
      'Observations are paused. You can turn them back on whenever you want.',
  },

  settings: {
    title: 'Settings',
    reminder: 'Evening reminder',
    reminderTime: 'Remind me at',
    reminderOff: 'No reminder',
    // J9: auto-mute is framed as the app backing off, not the user failing.
    reminderMuted: 'Reminders are off. Turn them back on any time.',
    blur: 'Blur photos in the grid',
    blurHint: 'Photos stay blurred until you tap one.',
    exportShared: 'Handed to your share sheet. A cloud drive is the safest home for it.',
    exportSaved: 'Saved to this device. Move it somewhere that outlives the phone.',
    sealLabel: 'Passphrase (optional)',
    sealHint:
      'Leave empty for a plain zip. With a passphrase, the file is sealed on this device and cannot be opened without it — by anyone, including us. There is no way to recover it.',
    unsealTitle: 'This backup is sealed',
    unsealBody: 'Enter the passphrase it was exported with.',
    unsealGo: 'Open it',
    unsealFailed: 'That passphrase did not open it. Nothing was imported.',
    exportNudgeNever:
      'Your log has grown and has never been backed up. An export takes a minute and lives wherever you put it.',
    exportNudgeStale:
      'It has been a while since the last export. A fresh one keeps your history safe from a cleared browser.',
    garmentNaming: 'Suggest garment names',
    garmentNamingHint:
      'A small model on this device guesses what you wore — "black cardigan". Nothing is sent anywhere, and you can always correct it.',
    lock: 'Require a passcode to open',
    lockHint: 'Four digits or more. Asked once each time you open the app.',
    lockSet: 'Choose a passcode',
    lockSetAgain: 'Type it again',
    lockSave: 'Turn on',
    lockMismatch: 'Those did not match.',
    lockTooShort: 'A little longer, please.',
    lockRemove: 'Turn off the passcode',
    lockRemovePrompt: 'Enter your passcode to turn it off.',
    // Stated plainly, because the alternative would be to imply protection the
    // app does not provide.
    lockScope:
      'This keeps the app closed to someone holding your phone. It does not encrypt the photos on the device.',
    import: 'Restore from an export',
    importHint: 'Bring a log back from a zip made by this app — a new phone, or after a reset.',
    importing: 'Restoring…',
    importDone: (added: number, skipped: number) =>
      added === 0
        ? 'Everything in that file was already here.'
        : `Restored ${added} day${added === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} already here` : ''}.`,
    importFailed: 'That file could not be read. It needs to be a zip exported by this app.',
    export: 'Export everything',
    exportHint: 'A zip with your photos and a spreadsheet of your log.',
    exporting: 'Preparing your export…',
    exportProgress: (done: number, total: number) => `Packing ${done} of ${total}…`,
    wipe: 'Delete everything',
    wipeHint: 'Removes every photo and entry from this device.',
    wipeConfirmPrompt: 'Type DELETE to confirm.',
    wipeConfirmWord: 'DELETE',
    wipeDo: 'Delete',
    wipeCancel: 'Cancel',
    wipeDone: 'Deleted.',
    // J8: the softening offer.
    pauseInsights: 'Pause observations',
    resumeInsights: 'Turn observations back on',

    // Storage durability (C2). Named plainly, because a user who does not
    // understand this cannot protect against it.
    storage: 'Storage',
    storageSafe: 'Your log is set to be kept. Your browser will not clear it to free space.',
    storageAtRisk:
      'Your browser may clear this app’s data if the device runs low on space. Adding it to your home screen makes that far less likely.',
    storageUsed: (used: string) => `Using ${used} on this device.`,
    // P1a: with no analytics to send anywhere, the only way to know whether the
    // "worn before?" matcher is doing its job is to show the user the count.
    groupsFormed: (outfits: number, days: number) =>
      outfits === 0
        ? `${days} days logged, no repeat outfits recognised yet.`
        : `${days} days logged, grouped into ${outfits} repeated outfit${outfits === 1 ? '' : 's'}.`,

    // S2: the one moment the privacy promise legitimately ends.
    exportWarnTitle: 'This file leaves the app',
    exportWarnBody:
      'The zip is saved to your downloads, outside this app. Some phones and computers back that folder up to a cloud drive automatically. Everything inside is readable by anything that can open the file.',
    exportWarnGo: 'Save it anyway',
    notificationsBlocked:
      'Your browser is blocking notifications for this site, so the reminder cannot be shown.',
    reminderCaveat:
      'The reminder needs the app to have been opened that day. It is scheduled on your device, never by a server.',
    // M1: iOS ignores notification actions, so be straight about the difference
    // rather than letting the experience quietly be worse than described.
    // The packaged builds schedule with the OS, so the web caveat does not apply.
    reminderNative:
      'Scheduled on your device, by your phone rather than by this app. It arrives whether or not you have opened Daily Fashion that day, and you can answer straight from it.',
    reminderIosCaveat:
      'On iPhone, tapping the reminder opens the app on tonight\u2019s question. On Android you can answer straight from the notification.',
  },

  // J8: shown when felt-scores trend low for 7+ days. Offers less, not more.
  soften: {
    title: 'Want to take the pressure off?',
    body:
      'The last stretch has been on the low side. This log is here whenever it is useful, and not a thing you owe anything to.',
    pauseReminders: 'Pause reminders',
    pauseInsights: 'Pause observations',
    keepGoing: 'Leave things as they are',
  },

  lock: {
    title: 'Daily Fashion',
    prompt: 'Enter your passcode',
    wrong: 'That is not it. Try again.',
    unlock: 'Unlock',
  },

  common: {
    loading: 'Opening your log…',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    today: 'Today',
    yesterday: 'Yesterday',
  },
} as const

/**
 * Walks a nested object and returns every string it can produce, calling any
 * function-valued entries with sample arguments so templated copy is checked
 * too. Used by the ban-list test.
 */
export function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
  } else if (typeof node === 'function') {
    // Every templated string in this module takes a number or a string.
    for (const arg of [2, 'Tue 14th']) {
      try {
        const result = (node as (a: unknown) => unknown)(arg)
        if (typeof result === 'string') out.push(result)
      } catch {
        // A template that rejects the sample arg has nothing to check.
      }
    }
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectStrings(value, out)
  }
  return out
}
