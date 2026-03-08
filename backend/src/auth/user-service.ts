import crypto from 'node:crypto'

const ADMIN_SALT = 'ai-paas-admin-salt'

export interface User {
  id: string
  username: string
  permissions: string
}

export interface UserService {
  validateCredentials(username: string, password: string): Promise<User | null>
  getById(id: string): Promise<User | null>
}

function hashPassword(password: string): Buffer {
  return crypto.scryptSync(password, ADMIN_SALT, 64)
}

/** Single admin user backed by environment variables. Swap for a DB-backed service when needed. */
export class EnvUserService implements UserService {
  private adminUser: User
  private passwordHash: Buffer

  constructor(username: string, password: string) {
    this.adminUser = { id: 'admin', username, permissions: 'admin' }
    this.passwordHash = hashPassword(password)
  }

  async validateCredentials(username: string, password: string): Promise<User | null> {
    if (username !== this.adminUser.username) return null

    const hash = hashPassword(password)
    const match = crypto.timingSafeEqual(hash, this.passwordHash)
    return match ? this.adminUser : null
  }

  async getById(id: string): Promise<User | null> {
    return id === this.adminUser.id ? this.adminUser : null
  }
}
