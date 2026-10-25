/** The part of postject's API that `package.ts` uses; postject ships no types of its own. */
declare module 'postject' {
  export interface InjectOptions {
    /** The Mach-O segment that holds the resource, on macOS. */
    machoSegmentName?: string;
    /** Whether to replace a resource of that name already there. */
    overwrite?: boolean;
    /** The sentinel the executable looks for, which injection flips. */
    sentinelFuse?: string;
  }

  /** Injects `resourceData` into the executable `filename` as the resource `resourceName`. */
  export function inject(
    filename: string,
    resourceName: string,
    resourceData: Buffer,
    options?: InjectOptions,
  ): Promise<void>;
}
