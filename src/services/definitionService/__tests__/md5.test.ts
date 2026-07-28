import { createHash } from 'crypto'
import { MD5 } from '../contextHelpers/md5'

describe('MD5 context helper', () => {
    it('returns lowercase hex MD5 digest for a string', () => {
        expect(MD5('user@example.com')).toBe('b58996c504c5638798eb6b511e6f49af')
        expect(MD5('user@example.com')).toBe(createHash('md5').update('user@example.com').digest('hex'))
    })

    it('returns a 32-character hex string', () => {
        expect(MD5('test')).toBe('098f6bcd4621d373cade4e832627b4f6')
        expect(MD5('test')).toMatch(/^[0-9a-f]{32}$/)
    })

    it('trims whitespace before hashing', () => {
        expect(MD5('  user@example.com  ')).toBe(MD5('user@example.com'))
    })

    it('returns empty string for null or undefined', () => {
        expect(MD5(null)).toBe('')
        expect(MD5(undefined)).toBe('')
    })

    it('returns empty string for non-string input', () => {
        expect(MD5(123)).toBe('')
        expect(MD5(true)).toBe('')
        expect(MD5({})).toBe('')
    })

    it('returns empty string for empty or whitespace-only strings', () => {
        expect(MD5('')).toBe('')
        expect(MD5('   ')).toBe('')
        expect(MD5('\t\n')).toBe('')
    })
})
