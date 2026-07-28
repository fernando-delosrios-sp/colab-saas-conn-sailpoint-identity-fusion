import { evaluateVelocityTemplate, truncateResultToMaxLength } from '../formatting'

/**
 * Test suite for evaluateVelocityTemplate with contextHelpers
 * Uses sample data patterns from test-data/identity-feed.csv
 */
describe('evaluateVelocityTemplate', () => {
    // ========================================================================
    // Basic Template Evaluation
    // ========================================================================

    describe('basic template evaluation', () => {
        it('should evaluate simple variable substitution', () => {
            const context = { firstName: 'John', lastName: 'Doe' }
            const result = evaluateVelocityTemplate('$firstName $lastName', context)
            expect(result).toBe('John Doe')
        })

        it('should evaluate template with braces notation', () => {
            const context = { firstName: 'John', lastName: 'Doe' }
            const result = evaluateVelocityTemplate('${firstName}.${lastName}@example.com', context)
            expect(result).toBe('John.Doe@example.com')
        })

        it('should handle missing variables gracefully', () => {
            const context = { firstName: 'John' }
            const result = evaluateVelocityTemplate('$firstName $lastName', context)
            expect(result).toBe('John $lastName')
        })

        it('does not expose Function via Date.constructor prototype chain (SSTI / RCE)', () => {
            const context = { d: new Date('2020-01-01T00:00:00.000Z') }
            const malicious = '#set($f=$d.constructor.constructor("return \\"pwned\\""))$f()'
            const result = evaluateVelocityTemplate(malicious, context)
            expect(result).not.toBe('pwned')
            expect(result == null || String(result).includes('pwned')).toBe(false)
        })

        it('does not resolve $constructor from Object.prototype on the context root', () => {
            const context = { x: 'ok' }
            const expr = '#set($f=$constructor("return \\"pwned\\""))$f()'
            const result = evaluateVelocityTemplate(expr, context)
            expect(result).not.toBe('pwned')
        })
    })

    // ========================================================================
    // Normalize.name() - Proper Case Name Handling
    // ========================================================================

    describe('Normalize.name() - proper case names', () => {
        it("should handle apostrophe names (O'Brien pattern)", () => {
            const context = { lastName: "o'brien" }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe("O'Brien")
        })

        it("should handle D'Angelo pattern", () => {
            const context = { lastName: "d'angelo" }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe("D'Angelo")
        })

        it('should handle Mc prefix (McDonald pattern)', () => {
            const context = { lastName: 'mcdonald' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe('McDonald')
        })

        it('should handle Mac prefix (MacArthur pattern)', () => {
            const context = { lastName: 'macarthur' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe('MacArthur')
        })

        it('should handle van particle (van der Berg pattern)', () => {
            const context = { lastName: 'VAN DER BERG' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            // Note: 'der' is in the particles list, so it remains lowercase
            expect(result).toBe('van der Berg')
        })

        it('should handle de particle (de la Cruz pattern)', () => {
            const context = { lastName: 'DE LA CRUZ' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe('de la Cruz')
        })

        it('should handle von particle (von Trapp pattern)', () => {
            const context = { lastName: 'VON TRAPP' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe('von Trapp')
        })

        it('should handle hyphenated names (Mary-Jane pattern)', () => {
            const context = { firstName: 'MARY-JANE' }
            const result = evaluateVelocityTemplate('$Normalize.name($firstName)', context)
            expect(result).toBe('Mary-Jane')
        })

        it('should handle complex hyphenated names (Jean-Pierre pattern)', () => {
            const context = { firstName: 'jean-pierre' }
            const result = evaluateVelocityTemplate('$Normalize.name($firstName)', context)
            expect(result).toBe('Jean-Pierre')
        })

        it('should handle Le particle (Le Blanc pattern)', () => {
            const context = { lastName: 'LE BLANC' }
            const result = evaluateVelocityTemplate('$Normalize.name($lastName)', context)
            expect(result).toBe('le Blanc')
        })
    })

    // ========================================================================
    // Normalize.fullName() - Full Name Normalization
    // ========================================================================

    describe('Normalize.fullName() - full name normalization', () => {
        it('should normalize simple full name', () => {
            const context = { fullName: 'JOHN DOE' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($fullName)', context)
            expect(result).toBe('John Doe')
        })

        it('should normalize full name with apostrophe', () => {
            const context = { fullName: "LIAM O'CONNOR" }
            const result = evaluateVelocityTemplate('$Normalize.fullName($fullName)', context)
            expect(result).toBe("Liam O'Connor")
        })

        it('should normalize full name with Mc prefix', () => {
            const context = { fullName: 'MICHAEL MCINTYRE' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($fullName)', context)
            expect(result).toBe('Michael McIntyre')
        })

        it('should normalize full name with hyphenated first name', () => {
            const context = { fullName: 'MARIE-CLAIRE FONTAINE' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($fullName)', context)
            expect(result).toBe('Marie-Claire Fontaine')
        })

        it('should normalize full name with particle', () => {
            const context = { fullName: 'HANS VAN DER BERG' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($fullName)', context)
            // Note: 'der' is in the particles list, so it remains lowercase
            expect(result).toBe('Hans van der Berg')
        })
    })

    // ========================================================================
    // Normalize.phone() - Phone Number Normalization
    // ========================================================================

    describe('Normalize.phone() - phone number normalization', () => {
        it('should normalize US phone with country code and parentheses', () => {
            // Note: Phone normalization requires country code to be parseable
            const context = { phone: '+1 (555) 123-4567' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone)', context)
            expect(result).toBe('+1 555 123 4567')
        })

        it('should normalize US phone with +1 prefix', () => {
            const context = { phone: '+1 555 234 5678' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone)', context)
            expect(result).toBe('+1 555 234 5678')
        })

        it('should return undefined for unparseable phone', () => {
            const context = { phone: 'not-a-phone' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone)', context)
            // Normalize.phone returns undefined for unparseable input; helper logs and returns '', formatting returns undefined
            expect(result).toBeUndefined()
        })

        it('should normalize phone with 1 prefix (assumes US)', () => {
            const context = { phone: '+1-555-456-7890' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone)', context)
            expect(result).toBe('+1 555 456 7890')
        })

        it('should normalize phone with mixed format', () => {
            const context = { phone: '+1-555-678-9012' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone)', context)
            expect(result).toBe('+1 555 678 9012')
        })

        it('should normalize UK local phone when default country is provided', () => {
            const context = { phone: '020 7946 0958' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone, "GB")', context)
            expect(result).toBe('+44 20 7946 0958')
        })

        it('should prefer explicit country code in the phone over default country', () => {
            const context = { phone: '+1 555 234 5678' }
            const result = evaluateVelocityTemplate('$Normalize.phone($phone, "GB")', context)
            expect(result).toBe('+1 555 234 5678')
        })
    })

    // ========================================================================
    // Normalize.ssn() - SSN Normalization
    // ========================================================================

    describe('Normalize.ssn() - SSN normalization', () => {
        it('should normalize SSN with dashes', () => {
            const context = { ssn: '123-45-6789' }
            const result = evaluateVelocityTemplate('$Normalize.ssn($ssn)', context)
            expect(result).toBe('123456789')
        })

        it('should normalize SSN with spaces', () => {
            const context = { ssn: '234 56 7890' }
            const result = evaluateVelocityTemplate('$Normalize.ssn($ssn)', context)
            expect(result).toBe('234567890')
        })

        it('should normalize SSN without separators', () => {
            const context = { ssn: '456789012' }
            const result = evaluateVelocityTemplate('$Normalize.ssn($ssn)', context)
            expect(result).toBe('456789012')
        })

        it('should return undefined for invalid SSN length', () => {
            const context = { ssn: '12345' }
            const result = evaluateVelocityTemplate('$Normalize.ssn($ssn)', context)
            // Normalize.ssn returns undefined for invalid length; helper logs and returns '', formatting returns undefined
            expect(result).toBeUndefined()
        })
    })

    // ========================================================================
    // Normalize.date() - Date Normalization
    // ========================================================================

    describe('Normalize.date() - date normalization', () => {
        it('should normalize ISO date format', () => {
            const context = { date: '1985-03-15' }
            const result = evaluateVelocityTemplate('$Normalize.date($date)', context)
            expect(result).toBe('1985-03-15T00:00:00.000Z')
        })

        it('should normalize US date format (MM/DD/YYYY)', () => {
            const context = { date: '03/22/1990' }
            const result = evaluateVelocityTemplate('$Normalize.date($date)', context)
            expect(result).toContain('1990')
        })

        it('should normalize text date format', () => {
            const context = { date: 'July 4 1995' }
            const result = evaluateVelocityTemplate('$Normalize.date($date)', context)
            expect(result).toContain('1995')
        })

        it('should normalize short text date format', () => {
            const context = { date: 'Jan 15 2021' }
            const result = evaluateVelocityTemplate('$Normalize.date($date)', context)
            expect(result).toContain('2021')
        })

        it('should prioritize DMY for ambiguous numeric dates by default', () => {
            const context = { date: '03-04-1990' }
            const result = evaluateVelocityTemplate('$Normalize.date($date)', context)
            expect(result).toBe('1990-04-03T00:00:00.000Z')
        })

        it('should allow overriding ambiguous priority order', () => {
            const context = { date: '03-04-1990' }
            const result = evaluateVelocityTemplate('$Normalize.date($date, "MM-dd-yyyy,dd-MM-yyyy")', context)
            expect(result).toBe('1990-03-04T00:00:00.000Z')
        })
    })

    // ========================================================================
    // Normalize.address() - Address Normalization
    // ========================================================================

    describe('Normalize.address() - address normalization', () => {
        it('should normalize full US address', () => {
            const context = { address: '123 Main Street, Seattle, WA 98101' }
            const result = evaluateVelocityTemplate('$Normalize.address($address)', context)
            expect(result).toBeTruthy()
            expect(result).toContain('Seattle')
        })

        it('should normalize address with city and state', () => {
            const context = { address: 'Los Angeles, CA 90001' }
            const result = evaluateVelocityTemplate('$Normalize.address($address)', context)
            expect(result).toContain('Los Angeles')
            expect(result).toContain('CA')
        })

        it('preserves existing default US behavior when country is omitted', () => {
            const context = { address: 'Los Angeles, CA 90001' }
            const result = evaluateVelocityTemplate('$Normalize.address($address)', context)
            expect(result).toContain('Los Angeles')
            expect(result).toContain('CA')
            expect(result).toContain('90001')
        })

        it('normalizes a full US state name to its code', () => {
            const context = { address: 'Los Angeles, California 90001' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "US")', context)
            expect(result).toBe('Los Angeles, CA 90001')
        })

        it('normalizes a full US state name with explicit US parameter', () => {
            const context = { address: 'Seattle, Washington 98101' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "US")', context)
            expect(result).toBe('Seattle, WA 98101')
        })

        it('normalizes a UK region name to its code', () => {
            const context = { address: 'London, Greater London SW1A 2AA' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "GB")', context)
            expect(result).toContain('London')
            expect(result).toContain('LND')
        })

        it('accepts UK alias for GB country code', () => {
            const context = { address: 'London, Greater London SW1A 2AA' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "UK")', context)
            expect(result).toContain('London')
            expect(result).toContain('LND')
        })

        it('normalizes a UK region code to itself', () => {
            const context = { address: 'London, LND SW1A 2AA' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "GB")', context)
            expect(result).toContain('London')
            expect(result).toContain('LND')
        })

        it('falls back to trimmed original for unsupported country codes', () => {
            const context = { address: 'Toronto, Ontario M5H 2N2' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "CA")', context)
            expect(result).toBe('Toronto, Ontario M5H 2N2')
        })

        it('returns undefined for empty input', () => {
            const context = { address: '' }
            const result = evaluateVelocityTemplate('$Normalize.address($address, "US")', context)
            expect(result).toBeUndefined()
        })
    })

    // ========================================================================
    // Normalize.ascii() - Diacritic Transliteration
    // ========================================================================

    describe('Normalize.ascii() - diacritic transliteration', () => {
        describe('German (de) - DACH digraph rules', () => {
            it('should convert German umlauts to digraphs', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('mueller')
            })

            it('should convert German sharp s to ss', () => {
                const context = { name: 'Straße' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('strasse')
            })

            it('should handle multiple German characters in one string', () => {
                const context = { name: 'Günther Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('guenther mueller')
            })

            it('should resolve de-DE locale variant to DACH rules', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de-DE")', context)
                expect(result).toBe('mueller')
            })

            it('should resolve de-AT locale variant to DACH rules', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de-AT")', context)
                expect(result).toBe('mueller')
            })

            it('should resolve de-CH locale variant to DACH rules', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de-CH")', context)
                expect(result).toBe('mueller')
            })

            it('should handle uppercase language code case-insensitively', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "DE")', context)
                expect(result).toBe('mueller')
            })

            it('should handle mixed case language code', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "dE")', context)
                expect(result).toBe('mueller')
            })
        })

        describe('Nordic (no, da, sv) - Nordic digraph rules', () => {
            it('should convert Norwegian characters to digraphs', () => {
                const context = { name: 'Søren Østergaard' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "no")', context)
                expect(result).toBe('soeren oestergaard')
            })

            it('should convert Danish characters to digraphs', () => {
                const context = { name: 'Jørgen Ågaard' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "da")', context)
                expect(result).toBe('joergen aagaard')
            })

            it('should convert Swedish characters to digraphs', () => {
                const context = { name: 'Sören Åström' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "sv")', context)
                expect(result).toBe('soeren aastroem')
            })

            it('should resolve no-NO locale variant to Nordic rules', () => {
                const context = { name: 'Søren' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "no-NO")', context)
                expect(result).toBe('soeren')
            })

            it('should resolve da-DK locale variant to Nordic rules', () => {
                const context = { name: 'Jørgen' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "da-DK")', context)
                expect(result).toBe('joergen')
            })

            it('should resolve sv-SE locale variant to Nordic rules', () => {
                const context = { name: 'Sören' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "sv-SE")', context)
                expect(result).toBe('soeren')
            })
        })

        describe('Transliteration fallback', () => {
            it('should fall back to transliteration when no language provided', () => {
                const context = { name: 'José' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name)', context)
                expect(result).toBe('jose')
            })

            it('should fall back to transliteration for unknown language', () => {
                const context = { name: 'Müller' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "xyz")', context)
                expect(result).toBe('muller')
            })

            it('should fall back to transliteration for French names', () => {
                const context = { name: 'José García' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "fr")', context)
                expect(result).toBe('jose garcia')
            })

            it('should fall back to transliteration for Spanish names', () => {
                const context = { name: 'García' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "es")', context)
                expect(result).toBe('garcia')
            })
        })

        describe('Chaining with other Normalize helpers', () => {
            it('should chain with Normalize.name to produce proper-cased DACH name', () => {
                const context = { name: 'MÜLLER' }
                const result = evaluateVelocityTemplate('$Normalize.name($Normalize.ascii($name, "de"))', context)
                expect(result).toBe('Mueller')
            })

            it('should chain with Normalize.fullName to produce proper-cased DACH full name', () => {
                const context = { name: 'GÜNTHER MÜLLER' }
                const result = evaluateVelocityTemplate('$Normalize.fullName($Normalize.ascii($name, "de"))', context)
                expect(result).toBe('Guenther Mueller')
            })
        })

        describe('Edge cases', () => {
            it('should return undefined for empty string', () => {
                const context = { name: '' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBeUndefined()
            })

            it('should return undefined for whitespace-only input', () => {
                const context = { name: '   ' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBeUndefined()
            })

            it('should handle pure ASCII input unchanged', () => {
                const context = { name: 'hello' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('hello')
            })

            it('should always return lowercase output', () => {
                const context = { name: 'MÜLLER' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('mueller')
            })

            it('should handle mixed case input producing lowercase output', () => {
                const context = { name: 'MüLlEr' }
                const result = evaluateVelocityTemplate('$Normalize.ascii($name, "de")', context)
                expect(result).toBe('mueller')
            })
        })
    })

    // ========================================================================
    // AddressParse - City/State Lookup
    // ========================================================================

    describe('AddressParse - city/state lookup', () => {
        it('should get state name from city (Seattle -> Washington)', () => {
            const context = { city: 'Seattle' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityState($city)', context)
            expect(result).toBe('Washington')
        })

        it('should get state code from city (Seattle -> WA)', () => {
            const context = { city: 'Seattle' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityStateCode($city)', context)
            expect(result).toBe('WA')
        })

        it('should get state name from city (Los Angeles -> California)', () => {
            const context = { city: 'Los Angeles' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityState($city)', context)
            expect(result).toBe('California')
        })

        it('should get state code from city (Chicago -> IL)', () => {
            const context = { city: 'Chicago' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityStateCode($city)', context)
            expect(result).toBe('IL')
        })

        it('should get state name from city (Houston -> Texas)', () => {
            const context = { city: 'Houston' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityState($city)', context)
            expect(result).toBe('Texas')
        })

        it('should handle city name case-insensitively', () => {
            const context = { city: 'SEATTLE' }
            const result = evaluateVelocityTemplate('$AddressParse.getCityState($city)', context)
            expect(result).toBe('Washington')
        })
    })

    describe('AddressParse.getStateName - code to full name', () => {
        it('returns the US full name for a US code', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateName("NY", "US")', {})
            expect(result).toBe('New York')
        })

        it('returns the UK full name for a GB code', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateName("LND", "GB")', {})
            expect(result).toBe('Greater London')
        })

        it('accepts the UK alias for GB', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateName("LND", "UK")', {})
            expect(result).toBe('Greater London')
        })

        it('returns empty string for unknown code', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateName("ZZ", "US")', {})
            // evaluateVelocityTemplate returns undefined for empty-string outputs
            expect(result).toBeUndefined()
        })

        it('returns empty string for unsupported country', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateName("NY", "CA")', {})
            // evaluateVelocityTemplate returns undefined for empty-string outputs
            expect(result).toBeUndefined()
        })
    })

    describe('AddressParse.getStateCode - name to code', () => {
        it('returns the US code for a US state name', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("New York", "US")', {})
            expect(result).toBe('NY')
        })

        it('returns the UK code for a GB region name', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("Greater London", "GB")', {})
            expect(result).toBe('LND')
        })

        it('accepts the UK alias for GB', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("Greater London", "UK")', {})
            expect(result).toBe('LND')
        })

        it('matches US names case-insensitively', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("new york", "US")', {})
            expect(result).toBe('NY')
        })

        it('matches UK names case-insensitively', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("greater london", "GB")', {})
            expect(result).toBe('LND')
        })

        it('returns empty string for unknown name', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("Atlantis", "US")', {})
            // evaluateVelocityTemplate returns undefined for empty-string outputs
            expect(result).toBeUndefined()
        })

        it('returns empty string for unsupported country', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("Ontario", "CA")', {})
            // evaluateVelocityTemplate returns undefined for empty-string outputs
            expect(result).toBeUndefined()
        })

        it('does not resolve ambiguous city names to a state', () => {
            const result = evaluateVelocityTemplate('$AddressParse.getStateCode("Springfield", "US")', {})
            // evaluateVelocityTemplate returns undefined for empty-string outputs
            expect(result).toBeUndefined()
        })
    })

    // ========================================================================
    // Datefns - Date Utilities
    // ========================================================================

    describe('Datefns - date utilities', () => {
        it('should format date to custom pattern', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate('$Datefns.format($date, "yyyy-MM-dd")', context)
            expect(result).toBe('2020-01-15')
        })

        it('should format date to year only', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate('$Datefns.format($date, "yyyy")', context)
            expect(result).toBe('2020')
        })

        it('should format date to month-day pattern', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate('$Datefns.format($date, "MM/dd")', context)
            expect(result).toBe('01/15')
        })

        it('should get current date with now()', () => {
            const context = {}
            const result = evaluateVelocityTemplate('$Datefns.format($Datefns.now(), "yyyy")', context)
            const currentYear = new Date().getFullYear().toString()
            expect(result).toBe(currentYear)
        })

        it('should add days to a date', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate(
                '$Datefns.format($Datefns.addDays($date, 10), "yyyy-MM-dd")',
                context
            )
            expect(result).toBe('2020-01-25')
        })

        it('should subtract days from a date', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate(
                '$Datefns.format($Datefns.subDays($date, 5), "yyyy-MM-dd")',
                context
            )
            expect(result).toBe('2020-01-10')
        })

        it('should add months to a date', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate(
                '$Datefns.format($Datefns.addMonths($date, 3), "yyyy-MM-dd")',
                context
            )
            expect(result).toBe('2020-04-15')
        })

        it('should add years to a date', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate(
                '$Datefns.format($Datefns.addYears($date, 2), "yyyy-MM-dd")',
                context
            )
            expect(result).toBe('2022-01-15')
        })

        it('should check if date is valid', () => {
            const context = { date: '2020-01-15' }
            const result = evaluateVelocityTemplate('$Datefns.isValid($date)', context)
            expect(result).toBe('true')
        })

        it('should calculate difference in days', () => {
            const context = { date1: '2020-01-20', date2: '2020-01-15' }
            const result = evaluateVelocityTemplate('$Datefns.differenceInDays($date1, $date2)', context)
            expect(result).toBe('5')
        })

        it('should support parseISO and getYear compatibility helpers', () => {
            const context = { birthDate: '1985-03-14T00:00:00.000Z' }
            const result = evaluateVelocityTemplate('$Datefns.getYear($Datefns.parseISO($birthDate))', context)
            expect(result).toBe('1985')
        })
    })

    // ========================================================================
    // Math - Mathematical Operations
    // ========================================================================

    describe('Math - mathematical operations', () => {
        it('should calculate floor', () => {
            const context = { value: 4.7 }
            const result = evaluateVelocityTemplate('$Math.floor($value)', context)
            expect(result).toBe('4')
        })

        it('should calculate ceil', () => {
            const context = { value: 4.2 }
            const result = evaluateVelocityTemplate('$Math.ceil($value)', context)
            expect(result).toBe('5')
        })

        it('should calculate round', () => {
            const context = { value: 4.5 }
            const result = evaluateVelocityTemplate('$Math.round($value)', context)
            expect(result).toBe('5')
        })

        it('should calculate max', () => {
            const context = { a: 10, b: 20 }
            const result = evaluateVelocityTemplate('$Math.max($a, $b)', context)
            expect(result).toBe('20')
        })

        it('should calculate min', () => {
            const context = { a: 10, b: 20 }
            const result = evaluateVelocityTemplate('$Math.min($a, $b)', context)
            expect(result).toBe('10')
        })

        it('should calculate abs', () => {
            const context = { value: -42 }
            const result = evaluateVelocityTemplate('$Math.abs($value)', context)
            expect(result).toBe('42')
        })
    })

    // ========================================================================
    // JSON - stringify / parse for structured values
    // ========================================================================

    describe('JSON helper', () => {
        it('should stringify objects and arrays', () => {
            const context = { firstName: 'Ann', lastName: 'Lee' }
            const result = evaluateVelocityTemplate(
                '#set($o={"first":$firstName,"last":$lastName})$JSON.stringify($o)',
                context
            )
            expect(result).toBe('{"first":"Ann","last":"Lee"}')
        })

        it('should parse JSON and allow downstream use via #set', () => {
            const context = { raw: '{"role":"admin","id":7}' }
            const result = evaluateVelocityTemplate('#set($p=$JSON.parse($raw))$p.role:$p.id', context)
            expect(result).toBe('admin:7')
        })

        it('should yield no output when stringify throws (e.g. BigInt)', () => {
            const context = { n: BigInt(1) }
            const result = evaluateVelocityTemplate('$JSON.stringify($n)', context)
            expect(result).toBeUndefined()
        })

        it('should treat invalid parse input as empty when re-serialized', () => {
            const context = { raw: 'not json' }
            const result = evaluateVelocityTemplate('#set($p=$JSON.parse($raw))$JSON.stringify($p)', context)
            expect(result).toBeUndefined()
        })

        it('should not throw when using $foreach.first', () => {
            const context = {
                NERMActiveAssignmentArray: JSON.stringify([
                    { start_date: '05/01/2026', end_date: '05/30/2026' },
                    { start_date: '06/01/2026', end_date: '06/30/2026' }
                ])
            }
            const expr = `
#set( $assignments = $JSON.parse($NERMActiveAssignmentArray) )
#foreach( $assignment in $assignments )
    #if( $foreach.first )
        #set( $latestAssignment = $assignment )
    #else
        #set( $currentLatestIso = $Datefns.parse($latestAssignment.end_date, 'MM/dd/yyyy') )
        #set( $nextDateIso = $Datefns.parse($assignment.end_date, 'MM/dd/yyyy') )
        #if( $Datefns.isAfter($nextDateIso, $currentLatestIso) )
            #set( $latestAssignment = $assignment )
        #end
    #end
#end
$latestAssignment.end_date
            `.trim()
            
            expect(() => evaluateVelocityTemplate(expr, context)).not.toThrow()
        })

        it('should successfully get latest assignment using $foreach.index == 0', () => {
            const context = {
                NERMActiveAssignmentArray: JSON.stringify([
                    { start_date: '05/01/2026', end_date: '05/30/2026' },
                    { start_date: '06/01/2026', end_date: '06/15/2026' },
                    { start_date: '06/01/2026', end_date: '06/30/2026' }
                ])
            }
            const expr = `
#set( $assignments = $JSON.parse($NERMActiveAssignmentArray) )
#foreach( $assignment in $assignments )
    #if( $foreach.index == 0 )
        #set( $latestAssignment = $assignment )
    #else
        #set( $currentLatestIso = $Datefns.parse($latestAssignment.end_date, 'MM/dd/yyyy') )
        #set( $nextDateIso = $Datefns.parse($assignment.end_date, 'MM/dd/yyyy') )
        #if( $Datefns.isAfter($nextDateIso, $currentLatestIso) )
            #set( $latestAssignment = $assignment )
        #end
    #end
#end
$latestAssignment.end_date
            `.trim()
            
            const result = evaluateVelocityTemplate(expr, context)
            expect(result?.trim()).toBe('06/30/2026')
        })

        it('should successfully get earliest assignment using $foreach.index == 0', () => {
            const context = {
                NERMActiveAssignmentArray: JSON.stringify([
                    { start_date: '06/01/2026', end_date: '06/30/2026' },
                    { start_date: '05/01/2026', end_date: '05/30/2026' },
                    { start_date: '05/15/2026', end_date: '05/20/2026' }
                ])
            }
            const expr = `
#set( $assignments = $JSON.parse($NERMActiveAssignmentArray) )
#foreach( $assignment in $assignments )
    #if( $foreach.index == 0 )
        #set( $earliestAssignment = $assignment )
    #else
        #set( $currentEarliestIso = $Datefns.parse($earliestAssignment.start_date, 'MM/dd/yyyy') )
        #set( $nextDateIso = $Datefns.parse($assignment.start_date, 'MM/dd/yyyy') )
        #if( $Datefns.isBefore($nextDateIso, $currentEarliestIso) )
            #set( $earliestAssignment = $assignment )
        #end
    #end
#end
$earliestAssignment.start_date
            `.trim()
            
            const result = evaluateVelocityTemplate(expr, context)
            expect(result?.trim()).toBe('05/01/2026')
        })
    })

    // ========================================================================
    // MD5 - hashing
    // ========================================================================

    describe('MD5()', () => {
        it('should hash a known email to lowercase hex MD5', () => {
            const context = { email: 'user@example.com' }
            const result = evaluateVelocityTemplate('$MD5($email)', context)
            expect(result).toBe('b58996c504c5638798eb6b511e6f49af')
        })

        it('should yield no output for missing context value', () => {
            const result = evaluateVelocityTemplate('$MD5($missing)', {})
            expect(result).toBeUndefined()
        })

        it('should yield no output for non-string input', () => {
            const context = { n: 123 }
            const result = evaluateVelocityTemplate('$MD5($n)', context)
            expect(result).toBeUndefined()
        })

        it('should yield no output for whitespace-only input', () => {
            const context = { value: '   ' }
            const result = evaluateVelocityTemplate('$MD5($value)', context)
            expect(result).toBeUndefined()
        })

        it('should yield no output for null context value', () => {
            const context = { value: null as unknown as string }
            const result = evaluateVelocityTemplate('$MD5($value)', context)
            expect(result).toBeUndefined()
        })

        it('should hash a simple string to a 32-character hex digest', () => {
            const context = { value: 'test' }
            const result = evaluateVelocityTemplate('$MD5($value)', context)
            expect(result).toBe('098f6bcd4621d373cade4e832627b4f6')
            expect(result).toMatch(/^[0-9a-f]{32}$/)
        })

        it('should trim input before hashing', () => {
            const context = { email: '  user@example.com  ' }
            const result = evaluateVelocityTemplate('$MD5($email)', context)
            expect(result).toBe('b58996c504c5638798eb6b511e6f49af')
        })
    })

    // ========================================================================
    // maxLength - Truncation
    // ========================================================================

    describe('maxLength - truncation', () => {
        it('should truncate result to maxLength', () => {
            const context = { firstName: 'Christopher', lastName: 'Bartholomew' }
            const expression = '$firstName.$lastName'
            const rendered = evaluateVelocityTemplate(expression, context)
            const result = truncateResultToMaxLength(rendered!, expression, context, 10)
            expect(result).toBe('Christophe')
            expect(result.length).toBe(10)
        })

        it('should not truncate if result is shorter than maxLength', () => {
            const context = { firstName: 'John', lastName: 'Doe' }
            const expression = '$firstName.$lastName'
            const rendered = evaluateVelocityTemplate(expression, context)
            const result = truncateResultToMaxLength(rendered!, expression, context, 20)
            expect(result).toBe('John.Doe')
        })

        it('should preserve counter when truncating', () => {
            const context = { firstName: 'Christopher', counter: '001' }
            const expression = '$firstName$counter'
            const rendered = evaluateVelocityTemplate(expression, context)
            const result = truncateResultToMaxLength(rendered!, expression, context, 10)
            expect(result).toBe('Christo001')
            expect(result.length).toBe(10)
            expect(result.endsWith('001')).toBe(true)
        })

        it('should preserve counter when counter is not at the end', () => {
            const context = { firstName: 'Christopher', counter: '001' }
            const expression = '$firstName$counter@domain.com'
            const rendered = evaluateVelocityTemplate(expression, context)
            const result = truncateResultToMaxLength(rendered!, expression, context, 20)
            expect(result).toBe('Christ001@domain.com')
            expect(result.length).toBe(20)
        })

        it('should truncate suffix if suffix alone exceeds available length', () => {
            const context = { firstName: 'Chris', counter: '001' }
            const expression = '$firstName$counter@verylongdomainname.com'
            const rendered = evaluateVelocityTemplate(expression, context)
            const result = truncateResultToMaxLength(rendered!, expression, context, 15)
            expect(result).toBe('001@verylongdom')
            expect(result.length).toBe(15)
        })

        it('should leave the raw Velocity result untouched when no maxLength is provided', () => {
            const context = { firstName: '  Christopher  ' }
            const result = evaluateVelocityTemplate('$firstName', context)
            expect(result).toBe('  Christopher  ')
        })
    })

    // ========================================================================
    // Complex Expression Combinations
    // ========================================================================

    describe('complex expression combinations', () => {
        it('should generate email from normalized name', () => {
            const context = { firstName: 'JEAN-PIERRE', lastName: 'DUBOIS' }
            const result = evaluateVelocityTemplate(
                '$Normalize.name($firstName).$Normalize.name($lastName)@example.com',
                context
            )
            expect(result).toBe('Jean-Pierre.Dubois@example.com')
        })

        it('should combine name normalization with substring', () => {
            const context = { firstName: 'CHRISTOPHER' }
            const result = evaluateVelocityTemplate('$Normalize.name($firstName).substring(0, 5)', context)
            expect(result).toBe('Chris')
        })

        it('should combine city lookup with other fields', () => {
            const context = { city: 'Seattle', name: 'John' }
            const result = evaluateVelocityTemplate('$name from $AddressParse.getCityState($city)', context)
            expect(result).toBe('John from Washington')
        })

        it('should generate username from first initial and last name', () => {
            const context = { firstName: 'John', lastName: "O'Brien" }
            const result = evaluateVelocityTemplate(
                '$firstName.substring(0,1).toLowerCase()$Normalize.name($lastName).replace("\'", "")',
                context
            )
            expect(result).toBe('jOBrien')
        })

        it('should format hire date and calculate tenure', () => {
            const context = { hireDate: '2020-01-15' }
            const result = evaluateVelocityTemplate('Hired: $Datefns.format($hireDate, "MM/dd/yyyy")', context)
            expect(result).toBe('Hired: 01/15/2020')
        })
    })

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('should handle empty string context values', () => {
            const context = { firstName: '', lastName: 'Doe' }
            const result = evaluateVelocityTemplate('$firstName$lastName', context)
            expect(result).toBe('Doe')
        })

        it('should handle null-like context values', () => {
            const context = { firstName: null as unknown as string, lastName: 'Doe' }
            const result = evaluateVelocityTemplate('${firstName}${lastName}', context)
            // Velocity renders null as the string "null"
            expect(result).toBe('nullDoe')
        })

        it('should handle special characters in names', () => {
            const context = { name: 'José García' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($name)', context)
            expect(result).toBe('José García')
        })

        it('should handle international characters (Nordic)', () => {
            const context = { name: 'Søren Østergaard' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($name)', context)
            expect(result).toBe('Søren Østergaard')
        })

        it('should handle international characters (German)', () => {
            const context = { name: 'Günther Müller' }
            const result = evaluateVelocityTemplate('$Normalize.fullName($name)', context)
            expect(result).toBe('Günther Müller')
        })
    })
})
