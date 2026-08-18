/**
 * Type declarations for the host entry (`lib/index.js`).
 * The implementation is deliberately a no-op: all behavior lives in the
 * browser bundle (`./client`).
 */

export declare const name: "dsh-message-copy-enhance";

/** No host services are required. */
export declare const inject: readonly [];

/**
 * No-op host body.
 * @param _ctx - the Host plugin context (unused).
 */
export declare function apply(_ctx: unknown): void;
