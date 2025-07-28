/**
 * Deferred Promise Implementation
 * 
 * Matches the existing deferred pattern from the codebase.
 * Provides external resolution/rejection control for Promises.
 */

import { Deferred } from '../types/ParsingTypes';

/**
 * Create a deferred promise with external resolution control
 * 
 * @example
 * ```typescript
 * const deferred = createDeferred<string>();
 * 
 * // Later...
 * deferred.resolve("success");
 * // or
 * deferred.reject(new Error("failed"));
 * 
 * // Use as a regular promise
 * const result = await deferred;
 * ```
 */
export function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    
    // Create a deferred object that extends Promise
    const deferred = Object.assign(promise, {
        resolve: resolve!,
        reject: reject!,
        promise
    }) as Deferred<T>;
    
    return deferred;
}

/**
 * Alias for backwards compatibility with existing codebase
 */
export const deferred = createDeferred;

/**
 * Create a deferred with timeout
 */
export function createDeferredWithTimeout<T>(timeoutMs: number, timeoutMessage = 'Operation timed out'): Deferred<T> {
    const deferred = createDeferred<T>();
    
    const timeoutId = setTimeout(() => {
        deferred.reject(new Error(timeoutMessage));
    }, timeoutMs);
    
    // Clear timeout on resolution
    const originalResolve = deferred.resolve;
    const originalReject = deferred.reject;
    
    deferred.resolve = (value: T | PromiseLike<T>) => {
        clearTimeout(timeoutId);
        originalResolve(value);
    };
    
    deferred.reject = (reason?: any) => {
        clearTimeout(timeoutId);
        originalReject(reason);
    };
    
    return deferred;
}

/**
 * Create a deferred that resolves after a delay
 */
export function createDelayedDeferred<T>(delayMs: number, value: T): Deferred<T> {
    const deferred = createDeferred<T>();
    
    setTimeout(() => {
        deferred.resolve(value);
    }, delayMs);
    
    return deferred;
}

/**
 * Create a deferred that can be cancelled
 */
export interface CancellableDeferred<T> extends Deferred<T> {
    cancel(reason?: string): void;
    isCancelled: boolean;
}

export function createCancellableDeferred<T>(): CancellableDeferred<T> {
    const baseDeferred = createDeferred<T>();
    let isCancelled = false;
    
    const cancellableDeferred = Object.assign(baseDeferred, {
        cancel(reason = 'Operation cancelled') {
            if (!isCancelled) {
                isCancelled = true;
                baseDeferred.reject(new Error(reason));
            }
        },
        get isCancelled() {
            return isCancelled;
        }
    }) as CancellableDeferred<T>;
    
    return cancellableDeferred;
}