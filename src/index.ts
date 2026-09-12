/**
 * Voice Gateway client surface plugin, node half.
 * Pure UI plugin: exports empty apply so the plugin appears in the host Loader;
 * the browser half ships via exports["./client"].
 */
export function apply(): void {}
