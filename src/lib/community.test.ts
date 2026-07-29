import { describe, expect, it } from 'vitest'
import { COMMUNITY_SUBMIT_URL, COMMUNITY_URL } from './community'

/**
 * The community link is the one deliberate road out of the app, so its shape
 * is worth pinning: plain https to reddit.com, nothing else. A tracking
 * parameter or a redirect domain appearing here should fail the build, not a
 * code review.
 */
describe('the community link', () => {
  it('goes to reddit over https and nowhere else', () => {
    for (const url of [COMMUNITY_URL, COMMUNITY_SUBMIT_URL]) {
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe('www.reddit.com')
      expect(parsed.pathname.startsWith('/r/')).toBe(true)
    }
  })

  it('carries no tracking parameters', () => {
    expect(new URL(COMMUNITY_URL).search).toBe('')
    // The submit URL's only parameter is the composer type.
    expect([...new URL(COMMUNITY_SUBMIT_URL).searchParams.keys()]).toEqual(['type'])
  })

  it('both point at the same community', () => {
    const community = new URL(COMMUNITY_URL).pathname
    expect(new URL(COMMUNITY_SUBMIT_URL).pathname.startsWith(community)).toBe(true)
  })
})
