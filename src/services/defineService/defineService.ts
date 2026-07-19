import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FusionAccount } from '../../model/account'
import { SchemaService } from '../schemaService'
import { LockService } from '../lockService'
import { StateWrapper } from './stateWrapper'
import { SimpleKeyType } from '@sailpoint/connector-sdk'

export class DefineService {
    private normalDefinitions: any[] = []
    private uniqueDefinitions: any[] = []
    private stateWrapper?: StateWrapper

    constructor(
        private config: FusionConfig,
        private schemas: SchemaService,
        private log: LogService,
        private locks: LockService
    ) {
        this.normalDefinitions = config.normalAttributeDefinitions ?? []
        this.uniqueDefinitions = config.uniqueAttributeDefinitions ?? []
        this.setStateWrapper(config.fusionState)
    }

    public setStateWrapper(state: Record<string, unknown> | undefined): void {
        this.stateWrapper = new StateWrapper(state, this.locks)
    }

    public async refreshAllAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefineService.refreshAllAttributes for account: ${fusionAccount.name}`)
    }

    public async refreshNormalAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefineService.refreshNormalAttributes for account: ${fusionAccount.name}`)
    }

    public async refreshUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefineService.refreshUniqueAttributes for account: ${fusionAccount.name}`)
    }

    public refreshReverseCorrelationAttributes(fusionAccount: FusionAccount): void {
        this.log.debug(`DefineService.refreshReverseCorrelationAttributes for account: ${fusionAccount.name}`)
    }

    public applyDisplayAttributeOverride(fusionAccount: FusionAccount): void {
        this.log.debug(`DefineService.applyDisplayAttributeOverride for account: ${fusionAccount.name}`)
    }

    public async registerUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefineService.registerUniqueAttributes for account: ${fusionAccount.name}`)
    }

    public getSimpleKey(fusionAccount: FusionAccount): SimpleKeyType | undefined {
        this.log.debug(`DefineService.getSimpleKey for account: ${fusionAccount.name}`)
        return undefined
    }
}
