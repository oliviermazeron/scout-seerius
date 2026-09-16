// ─── Tests unitaires : construction MIME multipart/alternative ───────────────
// Exécuter : node --experimental-vm-modules api/_lib/mime.test.js
// (pas de dépendances externes nécessaires)

import assert from 'node:assert/strict'

// ─── Reproduire les fonctions testées en local ────────────────────────────────
// (elles exportent les mêmes primitives que google.js ; on teste la logique ici)

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n')
}

function makeBoundary(...parts) {
  let b
  do { b = `----=_Part_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}` }
  while (parts.some((p) => p.includes(b)))
  return b
}

function buildRaw({ name, accountEmail, to, subject, text, html }) {
  const encodeWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
  const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()

  const commonHeaders = [
    `From: ${name ? `${encodeWord(name)} <${accountEmail}>` : accountEmail}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeWord(oneLine(subject))}`,
    'MIME-Version: 1.0',
  ]

  let mime
  if (html) {
    const boundary = makeBoundary(text, html)
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      '',
      `--${boundary}--`,
    ].join('\r\n')

    mime = [
      ...commonHeaders,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      parts,
    ].join('\r\n')
  } else {
    mime = [
      ...commonHeaders,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text),
    ].join('\r\n')
  }

  return Buffer.from(mime, 'utf8').toString('base64url')
}

// ─── Helpers de parsing ───────────────────────────────────────────────────────
function decodeRaw(raw) {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

function parseMimeParts(mime, boundary) {
  const delimiter = `--${boundary}`
  const parts = []
  const segments = mime.split(new RegExp(`(?:\r\n)?${delimiter.replace(/[-]/g, '\\$&')}(?:\r\n|--)`))
  for (const seg of segments.slice(1)) {
    if (!seg.trim() || seg.trim() === '--') continue
    const [headerBlock, ...bodyLines] = seg.split(/\r\n\r\n/)
    if (!headerBlock) continue
    const headers = {}
    for (const line of headerBlock.split(/\r\n/)) {
      const m = line.match(/^([\w-]+):\s*(.+)$/i)
      if (m) headers[m[1].toLowerCase()] = m[2].trim()
    }
    const body = bodyLines.join('\r\n\r\n').replace(/\r\n$/, '')
    parts.push({ headers, body })
  }
  return parts
}

// ─── Test 1 : structure multipart/alternative ─────────────────────────────────
{
  const text = 'Bonjour Genève,\n\nMerci de votre réponse.\n\n—\nDésinscription : https://example.com/unsub?e=test'
  const html = '<html><body><p>Bonjour Gen&egrave;ve,</p></body></html>'
  const raw = buildRaw({ name: 'Olivier Mazeron', accountEmail: 'olivier@seerius.ch', to: 'contact@test.ch', subject: 'Test é', text, html })

  const mime = decodeRaw(raw)

  // L'encodage base64url est valide
  assert.ok(mime.length > 0, 'MIME non vide après décodage base64url')

  // Le raw ne contient pas de + ni / (base64url)
  assert.ok(!raw.includes('+') && !raw.includes('/'), 'raw doit être base64url (pas de + ni /)')

  // Le Content-Type de l'enveloppe est multipart/alternative
  const ctMatch = mime.match(/^Content-Type:\s*(multipart\/alternative[^\r\n]*)/im)
  assert.ok(ctMatch, 'Content-Type multipart/alternative présent')

  // Extraire le boundary
  const boundaryMatch = ctMatch[1].match(/boundary="([^"]+)"/)
  assert.ok(boundaryMatch, 'boundary présent dans Content-Type')
  const boundary = boundaryMatch[1]

  // Le boundary n'apparaît pas DANS les contenus (text ou html) — vérification indirecte via l'absence
  assert.ok(!text.includes(boundary), 'boundary absent du corps texte')
  assert.ok(!html.includes(boundary), 'boundary absent du corps HTML')

  // Parser les parties
  const parts = parseMimeParts(mime, boundary)
  assert.equal(parts.length, 2, 'exactement 2 parties MIME')

  // text/plain FIRST
  assert.match(parts[0].headers['content-type'] ?? '', /text\/plain/, 'première partie = text/plain')
  assert.match(parts[1].headers['content-type'] ?? '', /text\/html/, 'deuxième partie = text/html')

  // charset UTF-8 sur les deux
  assert.match(parts[0].headers['content-type'] ?? '', /charset=UTF-8/i, 'charset UTF-8 sur text/plain')
  assert.match(parts[1].headers['content-type'] ?? '', /charset=UTF-8/i, 'charset UTF-8 sur text/html')

  // Content-Transfer-Encoding: base64 sur les deux
  assert.match(parts[0].headers['content-transfer-encoding'] ?? '', /base64/i, 'CTE base64 sur text/plain')
  assert.match(parts[1].headers['content-transfer-encoding'] ?? '', /base64/i, 'CTE base64 sur text/html')

  // L'accent « è » (dans « Genève ») survit l'aller-retour
  const textDecoded = Buffer.from(parts[0].body.replace(/\r\n/g, ''), 'base64').toString('utf8')
  assert.ok(textDecoded.includes('Genève'), 'accent è survit aller-retour text/plain')

  const htmlDecoded = Buffer.from(parts[1].body.replace(/\r\n/g, ''), 'base64').toString('utf8')
  assert.ok(htmlDecoded.includes('Gen'), 'corps HTML décodable')

  console.log('✓ Test 1 : structure multipart/alternative — OK')
}

// ─── Test 2 : fallback text/plain seul (pas de html fourni) ──────────────────
{
  const text = 'Simple message sans HTML.'
  const raw = buildRaw({ name: '', accountEmail: 'olivier@seerius.ch', to: 'a@b.com', subject: 'Test', text, html: undefined })
  const mime = decodeRaw(raw)

  assert.ok(!mime.includes('multipart'), 'pas de multipart si html absent')
  assert.match(mime, /Content-Type: text\/plain/i, 'Content-Type text/plain seul')
  assert.match(mime, /Content-Transfer-Encoding: base64/i, 'CTE base64')

  console.log('✓ Test 2 : fallback text/plain — OK')
}

// ─── Test 3 : encodage RFC 2047 du sujet avec accents ────────────────────────
{
  const raw = buildRaw({ name: 'Olivier', accountEmail: 'o@s.ch', to: 'a@b.ch', subject: 'Cession PME — Genève', text: 'corps', html: null })
  const mime = decodeRaw(raw)
  const subjectLine = mime.match(/^Subject: (.+)$/im)?.[1] ?? ''

  // Soit ASCII pur, soit encodé RFC 2047 =?UTF-8?B?...?=
  const isAscii = /^[\x20-\x7e]*$/.test('Cession PME — Genève')
  if (!isAscii) {
    assert.match(subjectLine, /=\?UTF-8\?B\?/, 'sujet non-ASCII encodé RFC 2047')
  }

  console.log('✓ Test 3 : encodage sujet RFC 2047 — OK')
}

console.log('\nTous les tests MIME sont passés.')
