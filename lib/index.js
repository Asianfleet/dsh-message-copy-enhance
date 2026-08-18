/**
 * dsh-message-copy-enhance — Host loader entry.
 *
 * The browser half of this plugin lives in `./client` (dist/client.js) and is
 * served to the web UI by the client-modules Node side, which scans enabled
 * Loader rows for packages that declare `dsh.client`. The Host half is a
 * no-op Cordis plugin: everything this package does happens in the browser,
 * so there is deliberately no host-side behavior here.
 */

export const name = "dsh-message-copy-enhance";

/** No host services are required. */
export const inject = [];

/**
 * No-op host body.
 * @param _ctx - the Host plugin context (unused).
 */
export function apply(_ctx) {}
