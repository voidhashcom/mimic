import { Primitive } from "@voidhash/mimic"

/**
 * Shorthand alias for `Primitive` — use `m.String()`, `m.Struct({...})`, etc. in config files.
 */
export const m = Primitive

export interface MimicConfig {
  readonly url: string
  readonly username: string
  readonly password: string
  readonly database: string
  readonly collections: Record<string, Primitive.AnyPrimitive>
}

export const defineConfig = (config: MimicConfig): MimicConfig => config

/** Proxy over process.env that throws on missing variables */
export const env: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_, key: string) {
    const value = process.env[key]
    if (value === undefined) {
      throw new Error(`Environment variable ${key} is not set. Add it to your .env file or set it in your shell.`)
    }
    return value
  }
})
