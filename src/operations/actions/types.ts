import { AttributeChangeOp } from '@sailpoint/connector-sdk'

export type ActionChange = {
    op: AttributeChangeOp
    value: string
}
