#!/usr/bin/env node

/**
 * Rewrites connector-spec.json helpKey strings to a short summary plus
 * a relative link to the generated Configuration reference anchor.
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const specPath = path.join(rootDir, 'connector-spec.json')

/** @type {Record<string, string>} */
const MENU_SLUGS = {
    'Connection Settings': 'connection',
    'Source Settings': 'source',
    'Attribute Mapping Settings': 'mapping',
    'Attribute Definition Settings': 'definition',
    'Attribute Matching Settings': 'matching',
    'Advanced Settings': 'advanced',
}

function anchorForKey(key) {
    return String(key)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function firstSentence(text) {
    const plain = String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!plain) {
        return 'See the Configuration reference for details.'
    }
    const match = plain.match(/^(.{1,180}?)([.!?](?:\s|$)|$)/)
    return match ? match[1].replace(/[.!?]$/, '') : plain.slice(0, 180)
}

/**
 * @param {unknown[]} items
 * @param {string} menuLabel
 */
function walkItems(items, menuLabel) {
    if (!Array.isArray(items)) {
        return
    }

    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue
        }

        if (item.type === 'section') {
            walkItems(item.items, menuLabel)
            continue
        }

        if (item.type === 'cardList' && Array.isArray(item.subMenus)) {
            for (const subMenu of item.subMenus) {
                walkItems(subMenu.items, menuLabel)
            }
            continue
        }

        if (!item.key || !item.helpKey) {
            continue
        }

        const slug = MENU_SLUGS[menuLabel]
        if (!slug) {
            continue
        }

        const anchor = anchorForKey(item.key)
        const label = item.label || item.key
        const summary = firstSentence(item.helpKey)
        item.helpKey = `${summary}. See [${label}](configuration/${slug}.md#${anchor}).`
    }
}

function main() {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))

    for (const menu of spec.sourceConfig || []) {
        if (menu.type !== 'menu') {
            continue
        }
        walkItems(menu.items, menu.label)
    }

    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 4)}\n`)
    console.log('Slimmed connector-spec.json helpKey strings.')
}

main()
