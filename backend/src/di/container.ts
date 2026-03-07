import type { FastifyReply, FastifyRequest } from 'fastify'
import type Hypercore from 'hypercore'
import type { HyperDB } from 'hyperdb'
import type DHT from 'hyperdht'
import type pino from 'pino'
import type { AppConfig } from '../config/index'
import { loadConfig } from '../config/index'
import { createDatabase } from '../db/index'
import { DbReplicator } from '../db/replicator'
import { DeploymentService } from '../deployments/service'
import { KeyService } from '../keys/service'
import { createLogger } from '../logger'
import { MetricsService } from '../metrics/service'
import { createAuthMiddleware } from '../middleware/auth'
import { WorkerDiscovery } from '../workers/discovery'
import { createDHT, createDispatcher } from '../workers/dispatcher'
import type { Dispatcher } from '../workers/dispatcher'
import { ModelAffinityStrategy } from '../workers/strategies/model-affinity'

export class Container {
  config!: AppConfig
  logger!: pino.Logger
  db!: HyperDB
  dispatcher!: Dispatcher
  discovery!: WorkerDiscovery
  dbReplicator!: DbReplicator
  keyService!: KeyService
  deploymentService!: DeploymentService
  metricsService!: MetricsService
  authMiddleware!: (request: FastifyRequest, reply: FastifyReply) => Promise<void>

  private dht!: DHT
  private dbCore!: Hypercore

  async init(): Promise<void> {
    this.config = loadConfig()
    this.logger = createLogger(this.config.logLevel)

    this.logger.info('initializing container...')

    const { db, core } = await createDatabase('./storage/gateway')
    this.db = db
    this.dbCore = core

    // Single DHT instance shared between dispatcher (RPC), discovery, and DB replication
    this.dht = await createDHT(this.config)
    this.dispatcher = await createDispatcher(this.dht, new ModelAffinityStrategy(), this.logger)
    this.discovery = new WorkerDiscovery(
      this.dispatcher,
      this.dht,
      this.config.clusterTopic,
      this.logger,
      this.dbCore.key,
    )

    // Serve DB replication — workers replicate the core as read-only replicas
    this.dbReplicator = new DbReplicator(this.dbCore, this.dht, this.logger)

    this.keyService = new KeyService(this.db)
    this.deploymentService = new DeploymentService(this.db, this.dispatcher, this.logger)
    this.metricsService = new MetricsService(this.db)

    this.authMiddleware = createAuthMiddleware(this.keyService, this.config.rateLimit)

    this.logger.info(
      { dbKey: this.dbCore.key.toString('hex').slice(0, 16) },
      'container initialized',
    )
  }

  async shutdown(): Promise<void> {
    this.logger.info('shutting down container...')
    try {
      await this.discovery.shutdown()
    } catch (err) {
      this.logger.error({ err }, 'error shutting down discovery')
    }
    try {
      await this.dbReplicator.shutdown()
    } catch (err) {
      this.logger.error({ err }, 'error shutting down db replicator')
    }
    try {
      await this.dispatcher.shutdown()
    } catch (err) {
      this.logger.error({ err }, 'error shutting down dispatcher')
    }
    try {
      await this.db.close()
    } catch (err) {
      this.logger.error({ err }, 'error closing db')
    }
    try {
      await this.dht.destroy()
    } catch (err) {
      this.logger.error({ err }, 'error destroying dht')
    }
  }
}
