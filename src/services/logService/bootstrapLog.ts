import { logger } from '@sailpoint/connector-sdk'

const PREFIX = '[config] '

function formatDetailSuffix(detail: Record<string, unknown>): string {
    if (Object.keys(detail).length === 0) return ''
    return (
        ' ' +
        Object.entries(detail)
            .map(([key, value]) => {
                const rendered = value === undefined || value === null ? '' : String(value)
                return rendered.includes(' ') ? `${key}="${rendered}"` : `${key}=${rendered}`
            })
            .join(' ')
    )
}

function formatMessage(message: string): string {
    return `${PREFIX}${message}`
}

export const bootstrapLog = {
    debug(message: string): void {
        logger.debug(formatMessage(message))
    },
    info(message: string): void {
        logger.info(formatMessage(message))
    },
    warn(message: string): void {
        logger.warn(formatMessage(message))
    },
    error(message: string): void {
        logger.error(formatMessage(message))
    },
    detail(data: Record<string, unknown>): void {
        logger.info(formatMessage(`DETAIL${formatDetailSuffix(data)}`))
    },
}
