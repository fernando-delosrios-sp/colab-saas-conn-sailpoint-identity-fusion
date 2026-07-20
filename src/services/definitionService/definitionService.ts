import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FusionAccount } from '../../model/account'
import { SchemaService } from '../schemaService'
import { LockService } from '../lockService'
import { StateWrapper } from './stateWrapper'
import { SimpleKeyType } from '@sailpoint/connector-sdk'

export class DefinitionService {
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
        this.log.debug(`DefinitionService.refreshAllAttributes for account: ${fusionAccount.name}`)
    }

    public async refreshNormalAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefinitionService.refreshNormalAttributes for account: ${fusionAccount.name}`)
    }

    public async refreshUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefinitionService.refreshUniqueAttributes for account: ${fusionAccount.name}`)
    }

    public refreshReverseCorrelationAttributes(fusionAccount: FusionAccount): void {
        this.log.debug(`DefinitionService.refreshReverseCorrelationAttributes for account: ${fusionAccount.name}`)
    }

    public applyDisplayAttributeOverride(fusionAccount: FusionAccount): void {
        this.log.debug(`DefinitionService.applyDisplayAttributeOverride for account: ${fusionAccount.name}`)
    }

    public async registerUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`DefinitionService.registerUniqueAttributes for account: ${fusionAccount.name}`)
    }

    public getSimpleKey(fusionAccount: FusionAccount): SimpleKeyType | undefined {
        this.log.debug(`DefinitionService.getSimpleKey for account: ${fusionAccount.name}`)
        return undefined
    }

    public async initializeCounters(): Promise<void> {
        this.log.debug('DefinitionService.initializeCounters')
    }

    public registerUniqueValuesFromManagedSourceAccounts(_fusionAccounts: Iterable<any>): void {
        this.log.debug('DefinitionService.registerUniqueValuesFromManagedSourceAccounts')
    }

    public async saveState(): Promise<void> {
        this.log.debug('DefinitionService.saveState')
    }
}
