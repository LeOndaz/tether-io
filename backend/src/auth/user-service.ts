import crypto from 'node:crypto'

export interface User {
  id: string
  username: string
  permissions: string
}

export interface UserService {
  validateCredentials(username: string, password: string): Promise<User | null>
  getById(id: string): Promise<User | null>
}

/** Single admin user backed by environment variables. Swap for a DB-backed service when needed. */
export class EnvUserService implements UserService {
  private adminUser: User
  private passwordHash: string

  constructor(username: string, password: string) {
    this.adminUser = { id: 'admin', username, permissions: 'admin' }
    this.passwordHash = crypto.createHash('sha256').update(password).digest('hex')
  }

  async validateCredentials(username: string, password: string): Promise<User | null> {
    if (username !== this.adminUser.username) return null

    const hash = crypto.createHash('sha256').update(password).digest('hex')
    const match = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(this.passwordHash))
    return match ? this.adminUser : null
  }

  async getById(id: string): Promise<User | null> {
    return id === this.adminUser.id ? this.adminUser : null
  }
}
