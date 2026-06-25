import { CustomFormsBetaApi, Configuration } from 'sailpoint-api-client'

async function run() {
    const config = new Configuration({ baseurl: process.env.SAILPOINT_BASE_URL, tokenUrl: process.env.SAILPOINT_TOKEN_URL, clientId: process.env.SAILPOINT_CLIENT_ID, clientSecret: process.env.SAILPOINT_CLIENT_SECRET })
    const api = new CustomFormsBetaApi(config)
    const response = await api.searchFormDefinitionsByTenant({ offset: 0, limit: 250 })
    console.log(response.data.results?.length)
}
run().catch(console.error)
