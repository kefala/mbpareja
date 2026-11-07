import { MongoClient, type Db } from 'mongodb'

function parseMongoDbName(uri: string): string {
  const withoutQuery = uri.split('?')[0] ?? uri
  const slash = withoutQuery.lastIndexOf('/')
  if (slash === -1) return ''
  const name = withoutQuery.slice(slash + 1).trim()
  if (!name || name.includes('@')) return ''
  return name
}

export function atlasConnectionUri(): string {
  const u = process.env.ATLAS_URI?.trim() || process.env.ATLAS_MIRROR_URI?.trim()
  if (!u)
    throw new Error(
      'Configura ATLAS_URI (servidor; nunca en NEXT_PUBLIC_*) para conectar a MongoDB Atlas'
    )
  return u
}

/** DB propia de mbpareja (distinta a trading_read de final). Default: mbpareja. */
export function atlasDatabaseName(connectionUri?: string): string {
  const uri = connectionUri ?? atlasConnectionUri()
  return process.env.ATLAS_DB_NAME?.trim() || parseMongoDbName(uri) || 'mbpareja'
}

declare global {
  // eslint-disable-next-line no-var
  var __mbparejaMongo: Promise<MongoClient> | undefined
}

export async function getDb(): Promise<Db> {
  const uri = atlasConnectionUri()
  if (!globalThis.__mbparejaMongo)
    globalThis.__mbparejaMongo = new MongoClient(uri, {
      serverSelectionTimeoutMS: 45_000
    }).connect()
  const client = await globalThis.__mbparejaMongo
  return client.db(atlasDatabaseName(uri))
}
