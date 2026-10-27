/* Entry point for scripts/test-native.mjs: bundles the real API client together with the
   native transport seams, so the test can prove that a request which used to be blocked by
   CORS now travels through the Android bridge instead of window.fetch. */
import { api, describeApiBase, getApiBase, setApiBase } from '../src/lib/api';
import { fallbackServer, DEFAULT_SERVER } from '../src/lib/server';
import * as nativeHttp from '../src/lib/nativeHttp';

export { api, describeApiBase, getApiBase, setApiBase, fallbackServer, DEFAULT_SERVER, nativeHttp };
