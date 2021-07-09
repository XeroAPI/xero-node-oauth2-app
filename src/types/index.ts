import { Session } from 'express-session'
import { XeroAccessToken, XeroIdToken, TokenSetParameters } from 'xero-node';

declare module 'express-session' {
  interface Session {
    decodedAccessToken: XeroAccessToken;
    decodedIdToken: XeroIdToken;
    tokenSet: TokenSetParameters;
    allTenants: any[];
    activeTenant: any;
  }
}