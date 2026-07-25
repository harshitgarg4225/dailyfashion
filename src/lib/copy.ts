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
    // J4: this claim has to be literally true, not aspirational. It is —
    // there is no network code in this app and the CSP forbids it.
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
    nothingToRate: 'Nothing waiting for a reflection.',
    savedThanks: 'Logged.',
    // J9: returning after a gap is neutral, never a reprimand.
    welcomeBack: 'Welcome back — here is what your log already knows.',
  },

  log: {
    title: 'Journal',
    empty: 'Your log starts with your first photo.',
    unrated: 'No reflection yet',
    // J9: a missed day is whitespace, not a gap to be explained.
    addPast: 'Add a past day',
    installTitle: 'Keep this on your home screen',
    installBodyIos:
      'Tap the share button, then “Add to Home Screen”. Browsers clear data for sites that are only open in a tab — on the home screen your log is far safer.',
    installDismiss: 'Not now',
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
    title: 'What your log knows',
    empty: 'Nothing worth saying yet. Keep logging and this fills in.',
    // The honest version of "not enough data" — no false suspense.
    thin: (have: number, need: number) =>
      `${have} of ${need} days logged. Observations start once there is enough to be fair.`,
    sample: (n: number) => (n === 1 ? 'from 1 day' : `from ${n} days`),
    dismiss: 'Got it',
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
    lock: 'Require unlock to open',
    lockHint: 'Uses your device unlock.',
    export: 'Export everything',
    exportHint: 'A zip with your photos and a spreadsheet of your log.',
    exporting: 'Preparing your export…',
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

    // S2: the one moment the privacy promise legitimately ends.
    exportWarnTitle: 'This file leaves the app',
    exportWarnBody:
      'The zip is saved to your downloads, outside this app. Some phones and computers back that folder up to a cloud drive automatically. Everything inside is readable by anything that can open the file.',
    exportWarnGo: 'Save it anyway',
    notificationsBlocked:
      'Your browser is blocking notifications for this site, so the reminder cannot be shown.',
    reminderCaveat:
      'The reminder needs the app to have been opened that day. It is scheduled on your device, never by a server.',
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

  common: {
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
