declare module "otpauth" {
  export class Secret {
    constructor();
    static fromBase32(value: string): Secret;
    get base32(): string;
  }

  export interface TotpOptions {
    issuer?: string;
    label?: string;
    algorithm?: string;
    digits?: number;
    period?: number;
    secret: Secret;
  }

  export interface TotpValidateOptions {
    token: string;
    window?: number;
  }

  export class TOTP {
    constructor(options: TotpOptions);
    readonly secret: Secret;
    toString(): string;
    validate(options: TotpValidateOptions): number | null;
  }
}
