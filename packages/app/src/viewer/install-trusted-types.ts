// Installs the read-only page's Trusted Types policy as soon as the viewer's script runs: the first
// module it imports, so that nothing before it can turn text into HTML.
import { installPageTrustedTypes, type PageTrustedTypesHost } from './trusted';

// The DOM's types do not name Trusted Types yet.
installPageTrustedTypes(window as unknown as PageTrustedTypesHost);
