// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BANNED_WORDS } from './copy'

/**
 * The download page is user-facing copy, and the fact that it lives in a hand
 * written HTML file rather than in `copy.ts` is an implementation detail — not
 * an exemption.
 *
 * It is also, for most people, the *first* copy they read. A page selling a log
 * that promises never to pass judgment, in the vocabulary of appearance
 * judgment, would undo the product's whole argument before the app had opened.
 * The first draft of it said "no opinion about how you look", which is exactly
 * the phrase the ban list exists to catch, so this suite exists to catch the
 * next one.
 */

const HTML = readFileSync(new URL('../../public/download.html', import.meta.url), 'utf8')

/** Visible text only: tags, comments and attributes are not read by anyone. */
function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findBanned(text: string): string[] {
  return BANNED_WORDS.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
}

describe('the download page', () => {
  it('holds to the same ban list as the app', () => {
    expect(findBanned(visibleText(HTML))).toEqual([])
  })

  it('offers both ways in', () => {
    // The APK for people who want an app, the origin itself for everyone else.
    // Losing either link silently halves the ways anyone can reach the product.
    expect(HTML).toContain('daily-fashion.apk')
    expect(HTML).toMatch(/href="\/app"/)
  })

  it('makes no third-party request of its own', () => {
    // The page claims the app cannot phone home. It cannot make that claim
    // while itself loading a font, a script or a pixel from somewhere else.
    const assets = [...HTML.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
    const remote = assets.filter((url) => /^(https?:)?\/\//.test(url))
    // Links a reader may choose to follow are navigation, not loading. Only
    // subresources matter, and there are none.
    const subresources = [...HTML.matchAll(/<(?:link|img|script)[^>]*\b(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((url) => /^(https?:)?\/\//.test(url))
    expect(subresources).toEqual([])
    // Every off-origin URL that remains is a link in the body, and each one
    // should be a plain https destination rather than a protocol-relative one.
    for (const url of remote) expect(url).toMatch(/^https:\/\//)
  })

  it('carries no script at all', () => {
    expect(HTML).not.toMatch(/<script/i)
    expect(HTML).toMatch(/script-src 'none'/)
  })
})

/**
 * The front page of dailyfashion.co — now the most-read copy the product has.
 * It is held to the same ban list and the same no-third-party standard, with
 * one difference from the download page: it is allowed exactly one script,
 * its own, served from this origin.
 */
const LANDING = readFileSync(new URL('../../public/landing.html', import.meta.url), 'utf8')

describe('the landing page', () => {
  it('holds to the same ban list as the app', () => {
    expect(findBanned(visibleText(LANDING))).toEqual([])
  })

  it('leads into the app, the APK, and the policy', () => {
    expect(LANDING).toMatch(/href="\/app"/)
    expect(LANDING).toMatch(/href="\/download"/)
    expect(LANDING).toMatch(/href="\/privacy"/)
  })

  it('loads nothing from off this origin', () => {
    const subresources = [...LANDING.matchAll(/<(?:link|img|script)[^>]*\b(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((url) => /^(https?:)?\/\//.test(url))
    expect(subresources).toEqual([])
  })

  it('runs only its own script, under a same-origin-only policy', () => {
    const scripts = [...LANDING.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!)
    expect(scripts).toEqual(['/landing.js'])
    // No inline script blocks — everything executable is a named file.
    expect(LANDING).not.toMatch(/<script(?![^>]*\bsrc=)/i)
    expect(LANDING).toMatch(/script-src 'self'/)
    expect(LANDING).toMatch(/connect-src 'self'/)
  })
})
