/*
 * The landing page's moving parts. Hand-written, served from this origin,
 * and optional — the page reads fine without any of it.
 *
 * The one piece of data this page sends anywhere is an anonymous page-view
 * count to our own /api/events endpoint: a constant client id, no cookie,
 * no fingerprint, nothing per-visitor. It exists so we know the front door
 * is being opened, and it goes to the same database the app's opt-in
 * counters do — never to a third party.
 */

document.documentElement.classList.add('js')

/*
 * Returning users skip the brochure. The app stamps this key on every boot,
 * so someone who installed the PWA back when the app lived at `/` still
 * lands in their log, not on marketing. `?stay=1` (the wordmark link) lets
 * anyone read the page anyway, and notification deep-links (`?rate=`,
 * `?screen=`) always pass through with their query intact.
 */
;(function redirectReturningUsers() {
  var params = new URLSearchParams(location.search)
  var deepLink = params.has('rate') || params.has('screen') || params.has('entry')
  var returning = false
  try {
    returning = localStorage.getItem('df-app-user') === '1'
  } catch (_) {
    /* storage may be blocked; the brochure is a fine place to land */
  }
  if (deepLink || (returning && !params.has('stay'))) {
    location.replace('/app' + location.search + location.hash)
  }
})()

/* Anonymous view + CTA counts, to our own database only. */
function ping(event, props) {
  try {
    var body = JSON.stringify({ client_id: 'web', event: event, props: props || {} })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {})
    }
  } catch (_) {
    /* analytics must never break the page */
  }
}

ping('landing_view')

document.addEventListener('click', function (event) {
  var target = event.target && event.target.closest ? event.target.closest('[data-cta]') : null
  if (target) ping('landing_cta', { target: target.getAttribute('data-cta') })
})

/* ------------------------------------------------------ reveal on scroll -- */

var revealed = document.querySelectorAll('.reveal')
if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(
    function (hits) {
      hits.forEach(function (hit) {
        if (hit.isIntersecting) {
          hit.target.classList.add('is-in')
          io.unobserve(hit.target)
        }
      })
    },
    { threshold: 0.15 },
  )
  revealed.forEach(function (el, i) {
    // Stagger siblings that arrive together, gently.
    el.style.setProperty('--d', (i % 5) * 0.08 + 's')
    io.observe(el)
  })
} else {
  revealed.forEach(function (el) {
    el.classList.add('is-in')
  })
}

/* ------------------------------------------------------------- hero grid -- */

var GARMENTS = [
  'wool coat',
  'white tee',
  'linen shirt',
  'leather boots',
  'grey knit',
  'denim jacket',
  'black dress',
  'canvas trainers',
  'silk scarf',
  'corduroy',
  'trench',
  'cashmere',
]

var grid = document.getElementById('hero-grid')
if (grid) {
  var days = []
  for (var i = 0; i < 35; i++) {
    var cell = document.createElement('button')
    cell.type = 'button'
    cell.tabIndex = -1
    // A couple of quiet gaps: a missed day is whitespace, here as in the app.
    if (i === 8 || i === 21) {
      cell.className = 'day day--gap'
      cell.disabled = true
    } else {
      cell.className = 'day'
      var felt = [3, 4, 5, 4, 2, 5, 4, 3, 5][i % 9]
      cell.textContent = String(felt)
      cell.setAttribute('data-felt', String(felt))
      cell.setAttribute('data-word', GARMENTS[i % GARMENTS.length])
      cell.addEventListener('click', function () {
        var flipped = this.classList.toggle('is-word')
        this.textContent = flipped
          ? this.getAttribute('data-word')
          : this.getAttribute('data-felt')
      })
    }
    // Draw the month in, one day at a time.
    cell.style.setProperty('--d', (i * 0.035).toFixed(3) + 's')
    grid.appendChild(cell)
    days.push(cell)
  }
  var gridIo = new IntersectionObserver(
    function (hits) {
      if (hits.some(function (hit) { return hit.isIntersecting })) {
        days.forEach(function (d) {
          d.classList.add('is-in')
        })
        gridIo.disconnect()
      }
    },
    { threshold: 0.2 },
  )
  gridIo.observe(grid)
}

/* --------------------------------------------------------------- marquee -- */

var track = document.getElementById('marquee-track')
if (track) {
  var phrases = [
    ['wool coat', '14 wears', '$6.40 a wear'],
    ['white tee', '31 wears', '$0.58 a wear'],
    ['leather boots', '22 wears', '$9.10 a wear'],
    ['grey knit', '9 wears', '$8.90 a wear'],
    ['denim jacket', '27 wears', '$2.60 a wear'],
    ['black dress', '6 wears', '$21.70 a wear'],
    ['canvas trainers', '48 wears', '$1.35 a wear'],
  ]
  var html = phrases
    .map(function (p) {
      return '<b>' + p[0] + '</b> — ' + p[1] + ' — ' + p[2] + '<span class="sep">·</span>'
    })
    .join('')
  // Twice over, so the 50% translate loops seamlessly.
  track.innerHTML = html + html
}

/* ------------------------------------------------------------- felt demo -- */

var FELT_ANSWERS = {
  1: 'A 1. Logged without judgement — avoiding this outfit next week is the insight.',
  2: 'A 2. The log will quietly notice if this one keeps scoring low.',
  3: 'A 3. Fine is data too. Most days are a 3.',
  4: 'A 4. Days like this are how the shortlist builds itself.',
  5: 'A 5. This outfit just earned a spot in your week card.',
}

var feltAnswer = document.getElementById('felt-answer')
document.querySelectorAll('.felt-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.felt-btn').forEach(function (other) {
      other.classList.remove('is-on')
    })
    btn.classList.add('is-on')
    if (feltAnswer) feltAnswer.textContent = FELT_ANSWERS[btn.getAttribute('data-felt')]
  })
})

/* ------------------------------------------------------------ calculator -- */

var priceInput = document.getElementById('calc-price')
var wearsInput = document.getElementById('calc-wears')
var wearsN = document.getElementById('calc-wears-n')
var calcBig = document.getElementById('calc-big')
var calcLine = document.getElementById('calc-line')

function calcUpdate() {
  if (!priceInput || !wearsInput || !calcBig) return
  var price = Math.max(1, Number(priceInput.value) || 0)
  var wears = Math.max(1, Number(wearsInput.value) || 1)
  var per = price / wears
  if (wearsN) wearsN.textContent = String(wears)
  calcBig.textContent =
    '$' + (per >= 100 ? Math.round(per).toString() : per.toFixed(2))
  if (calcLine) {
    calcLine.textContent =
      wears === 1
        ? 'Worn once, it costs everything it cost.'
        : wears < 10
          ? 'Early days. Each wear from here cuts the number.'
          : per <= 2
            ? 'Under $2 a wear. That is what owning good things looks like.'
            : wears + ' wears in. Every one from here is free money.'
  }
}

if (priceInput && wearsInput) {
  priceInput.addEventListener('input', calcUpdate)
  wearsInput.addEventListener('input', calcUpdate)
  calcUpdate()
}

/* ------------------------------------------------------------- week card -- */

var card = document.getElementById('week-card')
var sizePost = document.getElementById('size-post')
var sizeStory = document.getElementById('size-story')
if (card && sizePost && sizeStory) {
  sizePost.addEventListener('click', function () {
    card.classList.remove('is-story')
    sizePost.classList.add('is-on')
    sizeStory.classList.remove('is-on')
  })
  sizeStory.addEventListener('click', function () {
    card.classList.add('is-story')
    sizeStory.classList.add('is-on')
    sizePost.classList.remove('is-on')
  })
}

/* ---------------------------------------------------------- training demo -- */

/* Types a line into an element, one character at a time. */
function typeInto(el, text, done) {
  var i = 0
  el.classList.add('is-typing')
  var timer = setInterval(function () {
    el.textContent = text.slice(0, ++i)
    if (i >= text.length) {
      clearInterval(timer)
      el.classList.remove('is-typing')
      if (done) done()
    }
  }, 28)
}

var gymDemo = document.getElementById('gym-demo')
if (gymDemo) {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var row = gymDemo.querySelector('.gym-row')
  var nameEl = gymDemo.querySelector('.gym-name')
  var setEl = gymDemo.querySelector('.gym-set')
  var noteEl = gymDemo.querySelector('.gym-note')
  var bestEl = gymDemo.querySelector('.gym-best')
  var parts = (row.getAttribute('data-line') || '|').split('|')

  var play = function () {
    if (reduced) {
      nameEl.textContent = parts[0]
      setEl.textContent = parts[1]
      noteEl.textContent = noteEl.getAttribute('data-note')
      bestEl.textContent = bestEl.getAttribute('data-note')
      return
    }
    typeInto(nameEl, parts[0], function () {
      setEl.textContent = parts[1]
      setTimeout(function () {
        typeInto(noteEl, noteEl.getAttribute('data-note'), function () {
          setTimeout(function () {
            typeInto(bestEl, bestEl.getAttribute('data-note'))
          }, 350)
        })
      }, 300)
    })
  }

  var gymIo = new IntersectionObserver(
    function (hits) {
      if (hits.some(function (hit) { return hit.isIntersecting })) {
        gymIo.disconnect()
        play()
      }
    },
    { threshold: 0.4 },
  )
  gymIo.observe(gymDemo)
}
