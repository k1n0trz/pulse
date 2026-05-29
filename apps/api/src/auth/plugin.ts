import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { resolveAuthContext, type AuthContext } from "./context.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Lazily resolves (and caches) the auth context for this request. */
    getAuth(): Promise<AuthContext>;
    _authContext?: AuthContext;
  }
}

const authPluginImpl: FastifyPluginAsync = async (app) => {
  app.decorateRequest("_authContext", undefined);
  app.decorateRequest("getAuth", async function (this: FastifyRequest) {
    if (this._authContext) return this._authContext;
    const ctx = await resolveAuthContext(this);
    this._authContext = ctx;
    return ctx;
  });
};

export const authPlugin = fp(authPluginImpl, { name: "pulse-auth" });
