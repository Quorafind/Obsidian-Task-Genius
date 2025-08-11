/**
 * Utility functions for handling task priorities
 */

/**
 * Sanitizes a priority value to make it safe for use in CSS class names.
 * Removes spaces and special characters that are invalid in CSS tokens.
 * 
 * @param priority - The priority value to sanitize (can be string or number)
 * @returns A sanitized string safe for CSS class names, or empty string if invalid
 */
export function sanitizePriorityForClass(priority: string | number | undefined | null): string {
    if (priority === undefined || priority === null) {
        return '';
    }
    
    // Convert to string and trim
    const priorityStr = String(priority).trim();
    
    // If it's a numeric priority (1-5), return as-is
    const numericPriority = parseInt(priorityStr, 10);
    if (!isNaN(numericPriority) && numericPriority >= 1 && numericPriority <= 5) {
        return String(numericPriority);
    }
    
    // For non-numeric priorities, remove all spaces and special characters
    // Only keep alphanumeric characters and hyphens
    const sanitized = priorityStr
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[^\w-]/g, '') // Remove non-word characters except hyphens
        .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    return sanitized;
}

/**
 * Checks if a priority value is valid for use in DOM operations
 * @param priority - The priority value to check
 * @returns true if the priority is valid, false otherwise
 */
export function isValidPriority(priority: string | number | undefined | null): boolean {
    if (priority === undefined || priority === null) {
        return false;
    }
    
    const sanitized = sanitizePriorityForClass(priority);
    return sanitized.length > 0;
}