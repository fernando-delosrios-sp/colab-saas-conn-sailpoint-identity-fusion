import { Transform, Writable } from 'node:stream'
import type { Response } from '@sailpoint/connector-sdk'
import { sendWithBackpressure } from '../responseBackpressure'

describe('sendWithBackpressure', () => {
    it('sends when the response does not expose a stream', async () => {
        const sent: unknown[] = []
        const res = {
            send: (output: unknown) => {
                sent.push(output)
            },
        }

        await sendWithBackpressure(res as Response<unknown>, { id: 1 })

        expect(sent).toEqual([{ id: 1 }])
    })

    it('keeps the host stream queue at its high water mark while the client is behind', async () => {
        const dest = new Writable({
            highWaterMark: 16 * 1024,
            write(_chunk, _encoding, callback) {
                setTimeout(callback, 1)
            },
        })
        const out = new Transform({
            writableObjectMode: true,
            transform(chunk, _encoding, callback) {
                this.push(`${JSON.stringify(chunk)}\n`)
                callback()
            },
        })
        out.pipe(dest)

        const res = {
            _writable: out,
            send(output: unknown) {
                out.write({ data: output, type: 'output' })
            },
        }

        let maxQueuedObjects = 0
        try {
            for (let i = 0; i < 40; i++) {
                await sendWithBackpressure(res as unknown as Response<unknown>, {
                    i,
                    blob: 'x'.repeat(26_000),
                })
                maxQueuedObjects = Math.max(maxQueuedObjects, out.writableLength)
            }
        } finally {
            out.destroy()
            dest.destroy()
        }

        expect(maxQueuedObjects).toBeLessThanOrEqual(16)
    })
})
