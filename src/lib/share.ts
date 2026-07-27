import { isNative } from './platform'
import { triggerDownload } from './exportData'

/**
 * Hands an image to the operating system's share sheet.
 *
 * This is the one moment the app's privacy promise legitimately ends, and it is
 * worth being precise about *how* it ends, because the difference is the whole
 * argument: the app still makes no network request. It produces a file and
 * gives it to the OS. Where it goes next is chosen by the user, in their own
 * share sheet, in the same dialog they use for every other photo on the phone.
 *
 * That distinction is what lets a local-only log have a social feature at all
 * without acquiring a server, an account, or a copy of anyone's photographs.
 * The conversation this is meant to start — "where is that from?" — happens
 * wherever they already talk to people, which is somewhere better at threading,
 * notifications and blocking than anything this app would build.
 *
 * Every path here can fail for reasons that are not errors: the user dismisses
 * the sheet, or the platform declines files. Both fall back to saving the image
 * rather than surfacing a failure, because a picture in the camera roll is
 * still a picture the user can post.
 */

export type ShareOutcome = 'shared' | 'saved' | 'dismissed'

export interface ShareImage {
  blob: Blob
  filename: string
  title: string
  text?: string
}

/** `AbortError` is the user closing the sheet, which is not a failure. */
function isDismissal(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function shareNative(image: ShareImage): Promise<ShareOutcome> {
  // Imported lazily so the web bundle never pulls in a native plugin it cannot
  // use — the rule in platform.ts, applied to the two plugins this needs.
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      // Strip the `data:image/jpeg;base64,` prefix the plugin does not want.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(image.blob)
  })

  // Cache, not Documents: this is a throwaway rendering of data the app already
  // holds, and leaving copies in a user-visible folder would quietly accumulate
  // pictures of somebody nobody asked to keep.
  const written = await Filesystem.writeFile({
    path: image.filename,
    data: base64,
    directory: Directory.Cache,
  })

  await Share.share({ title: image.title, text: image.text, files: [written.uri] })
  return 'shared'
}

async function shareWeb(image: ShareImage): Promise<ShareOutcome> {
  const file = new File([image.blob], image.filename, { type: image.blob.type })

  // `canShare` with files is the only reliable feature test; several browsers
  // expose `share` and then reject anything carrying a file.
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: image.title, text: image.text })
    return 'shared'
  }

  triggerDownload(image.blob, image.filename)
  return 'saved'
}

export async function shareImage(image: ShareImage): Promise<ShareOutcome> {
  try {
    return isNative() ? await shareNative(image) : await shareWeb(image)
  } catch (error) {
    if (isDismissal(error)) return 'dismissed'
    // Anything else — an unavailable plugin, a platform refusing files — still
    // ends with the user holding the image.
    triggerDownload(image.blob, image.filename)
    return 'saved'
  }
}
