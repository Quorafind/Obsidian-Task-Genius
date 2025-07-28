/**
 * ICS Parser Plugin - Unified ICS/iCalendar event parsing
 * 
 * Integrates the logic from IcsParser into the unified parsing system
 * for parsing calendar events from ICS files.
 */

import { Component } from 'obsidian';
import { ParserPlugin } from './ParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParseEventType } from '../events/ParseEvents';
import { 
    IcsParseResult as PluginIcsParseResult, 
    ParsePriority, 
    CacheType,
    ParsingStatistics 
} from '../types/ParsingTypes';
import { IcsEvent, IcsParseResult, IcsSource } from '../../types/ics';
import { Deferred } from '../utils/Deferred';

export class IcsParserPlugin extends ParserPlugin {
    name = 'ics';
    supportedTypes = ['ics', 'ical'];
    private priority = ParsePriority.NORMAL;

    private static readonly CN_REGEX = /CN=([^;:]+)/;
    private static readonly ROLE_REGEX = /ROLE=([^;:]+)/;
    private static readonly PARTSTAT_REGEX = /PARTSTAT=([^;:]+)/;

    private static readonly PROPERTY_HANDLERS = new Map<string, (event: Partial<IcsEvent>, value: string, fullLine: string) => void>([
        ['UID', (event, value) => { event.uid = value; }],
        ['SUMMARY', (event, value) => { event.summary = IcsParserPlugin.unescapeText(value); }],
        ['DESCRIPTION', (event, value) => { event.description = IcsParserPlugin.unescapeText(value); }],
        ['LOCATION', (event, value) => { event.location = IcsParserPlugin.unescapeText(value); }],
        ['STATUS', (event, value) => { event.status = value.toUpperCase(); }],
        ['PRIORITY', (event, value) => {
            const priority = parseInt(value, 10);
            if (!isNaN(priority)) event.priority = priority;
        }],
        ['TRANSP', (event, value) => { event.transp = value.toUpperCase(); }],
        ['RRULE', (event, value) => { event.rrule = value; }],
        ['DTSTART', (event, value, fullLine) => {
            const result = IcsParserPlugin.parseDateTime(value, fullLine);
            event.dtstart = result.date;
            if (result.allDay !== undefined) event.allDay = result.allDay;
        }],
        ['DTEND', (event, value, fullLine) => {
            event.dtend = IcsParserPlugin.parseDateTime(value, fullLine).date;
        }],
        ['CREATED', (event, value, fullLine) => {
            event.created = IcsParserPlugin.parseDateTime(value, fullLine).date;
        }],
        ['LAST-MODIFIED', (event, value, fullLine) => {
            event.lastModified = IcsParserPlugin.parseDateTime(value, fullLine).date;
        }],
        ['CATEGORIES', (event, value) => {
            event.categories = value.split(",").map(cat => cat.trim());
        }],
        ['EXDATE', (event, value, fullLine) => {
            if (!event.exdate) event.exdate = [];
            const exdates = value.split(",");
            for (const exdate of exdates) {
                const date = IcsParserPlugin.parseDateTime(exdate.trim(), fullLine).date;
                event.exdate.push(date);
            }
        }],
        ['ORGANIZER', (event, value, fullLine) => {
            event.organizer = IcsParserPlugin.parseOrganizer(value, fullLine);
        }],
        ['ATTENDEE', (event, value, fullLine) => {
            if (!event.attendees) event.attendees = [];
            event.attendees.push(IcsParserPlugin.parseAttendee(value, fullLine));
        }]
    ]);

    private parseQueue = new Map<string, Deferred<PluginIcsParseResult>>();
    private activeParses = 0;
    private readonly maxConcurrentParses = 2;

    protected setupEventListeners(): void {
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'ics' || file.extension === 'ical') {
                    this.invalidateCache(file.path);
                    this.eventManager.trigger(ParseEventType.FILE_CONTENT_CHANGED, {
                        filePath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file.extension === 'ics' || file.extension === 'ical') {
                    this.cacheManager.invalidateByPath(oldPath, CacheType.ICS_EVENTS);
                    this.eventManager.trigger(ParseEventType.FILE_RENAMED, {
                        oldPath,
                        newPath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.eventManager.on(ParseEventType.CACHE_INVALIDATED, (data) => {
                if (data.type === CacheType.ICS_EVENTS) {
                    this.parseQueue.delete(data.key);
                }
            })
        );
    }

    public async parse(context: ParseContext): Promise<PluginIcsParseResult> {
        const startTime = performance.now();
        const cacheKey = this.generateCacheKey(context);

        try {
            this.eventManager.trigger(ParseEventType.PARSE_STARTED, {
                filePath: context.filePath,
                type: this.name,
                cacheKey
            });

            let cached = this.cacheManager.get<PluginIcsParseResult>(
                cacheKey, 
                CacheType.ICS_EVENTS
            );
            if (cached && this.isCacheValid(cached, context)) {
                this.updateStatistics({ cacheHits: 1 });
                return cached;
            }

            if (this.parseQueue.has(cacheKey)) {
                return await this.parseQueue.get(cacheKey)!.promise;
            }

            if (this.activeParses >= this.maxConcurrentParses) {
                await this.waitForSlot();
            }

            const deferred = new Deferred<PluginIcsParseResult>();
            this.parseQueue.set(cacheKey, deferred);
            this.activeParses++;

            try {
                const result = await this.parseInternal(context);
                
                this.cacheManager.set(
                    cacheKey, 
                    result, 
                    CacheType.ICS_EVENTS,
                    {
                        mtime: context.mtime,
                        ttl: 1800000,
                        dependencies: [context.filePath]
                    }
                );

                deferred.resolve(result);
                
                const endTime = performance.now();
                this.updateStatistics({
                    cacheMisses: 1,
                    parseTime: endTime - startTime,
                    eventsFound: result.events?.length || 0
                });

                this.eventManager.trigger(ParseEventType.PARSE_COMPLETED, {
                    filePath: context.filePath,
                    type: this.name,
                    duration: endTime - startTime,
                    eventsFound: result.events?.length || 0
                });

                return result;

            } catch (error) {
                deferred.reject(error);
                this.eventManager.trigger(ParseEventType.PARSE_FAILED, {
                    filePath: context.filePath,
                    type: this.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error;

            } finally {
                this.parseQueue.delete(cacheKey);
                this.activeParses--;
            }

        } catch (error) {
            const endTime = performance.now();
            this.updateStatistics({
                errors: 1,
                parseTime: endTime - startTime
            });
            throw error;
        }
    }

    private async parseInternal(context: ParseContext): Promise<PluginIcsParseResult> {
        const source: IcsSource = {
            id: context.filePath,
            name: context.filePath.split('/').pop() || 'unknown',
            url: undefined,
            lastSync: new Date()
        };

        const icsResult = this.parseIcsContent(context.content, source);

        const result: PluginIcsParseResult = {
            success: icsResult.errors.length === 0,
            events: icsResult.events,
            metadata: {
                totalEvents: icsResult.events.length,
                errors: icsResult.errors,
                calendarInfo: icsResult.metadata,
                parseErrors: icsResult.errors.length,
                source
            },
            filePath: context.filePath,
            parseTime: performance.now()
        };

        if (icsResult.events.length > 0) {
            this.eventManager.trigger(ParseEventType.ICS_EVENTS_PARSED, {
                filePath: context.filePath,
                events: icsResult.events.map(e => ({ 
                    uid: e.uid, 
                    summary: e.summary,
                    dtstart: e.dtstart.toISOString()
                })),
                source: this.name
            });
        }

        return result;
    }

    private parseIcsContent(content: string, source: IcsSource): IcsParseResult {
        const result: IcsParseResult = {
            events: [],
            errors: [],
            metadata: {},
        };

        try {
            const lines = this.unfoldLines(content.split(/\r?\n/));
            let currentEvent: Partial<IcsEvent> | null = null;
            let inCalendar = false;
            let lineNumber = 0;

            for (const line of lines) {
                lineNumber++;
                const trimmedLine = line.trim();

                if (!trimmedLine || trimmedLine.startsWith("#")) {
                    continue;
                }

                try {
                    const [property, value] = this.parseLine(trimmedLine);

                    switch (property) {
                        case "BEGIN":
                            if (value === "VCALENDAR") {
                                inCalendar = true;
                            } else if (value === "VEVENT" && inCalendar) {
                                currentEvent = { source };
                            }
                            break;

                        case "END":
                            if (value === "VEVENT" && currentEvent) {
                                const event = this.finalizeEvent(currentEvent);
                                if (event) {
                                    result.events.push(event);
                                }
                                currentEvent = null;
                            } else if (value === "VCALENDAR") {
                                inCalendar = false;
                            }
                            break;

                        case "VERSION":
                            if (inCalendar && !currentEvent) {
                                result.metadata.version = value;
                            }
                            break;

                        case "PRODID":
                            if (inCalendar && !currentEvent) {
                                result.metadata.prodid = value;
                            }
                            break;

                        case "X-WR-CALNAME":
                            if (inCalendar && !currentEvent) {
                                result.metadata.calendarName = value;
                            }
                            break;

                        case "X-WR-CALDESC":
                            if (inCalendar && !currentEvent) {
                                result.metadata.description = value;
                            }
                            break;

                        case "X-WR-TIMEZONE":
                            if (inCalendar && !currentEvent) {
                                result.metadata.timezone = value;
                            }
                            break;

                        default:
                            if (currentEvent) {
                                this.parseEventProperty(
                                    currentEvent,
                                    property,
                                    value,
                                    trimmedLine
                                );
                            }
                            break;
                    }
                } catch (error) {
                    result.errors.push({
                        line: lineNumber,
                        message: `Error parsing line: ${error.message}`,
                        context: trimmedLine,
                    });
                }
            }
        } catch (error) {
            result.errors.push({
                message: `Fatal parsing error: ${error.message}`,
            });
        }

        return result;
    }

    private unfoldLines(lines: string[]): string[] {
        const unfolded: string[] = [];
        const currentLineParts: string[] = [];
        let hasCurrentLine = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const firstChar = line.charCodeAt(0);

            if (firstChar === 32 || firstChar === 9) {
                if (hasCurrentLine) {
                    currentLineParts.push(' ');
                    currentLineParts.push(line.slice(1));
                }
            } else {
                if (hasCurrentLine) {
                    unfolded.push(currentLineParts.join(''));
                    currentLineParts.length = 0;
                }
                currentLineParts.push(line);
                hasCurrentLine = true;
            }
        }

        if (hasCurrentLine) {
            unfolded.push(currentLineParts.join(''));
        }

        return unfolded;
    }

    private parseLine(line: string): [string, string] {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) {
            throw new Error("Invalid line format: missing colon");
        }

        const semicolonIndex = line.indexOf(";");
        let property: string;

        if (semicolonIndex !== -1 && semicolonIndex < colonIndex) {
            property = line.slice(0, semicolonIndex).toUpperCase();
        } else {
            property = line.slice(0, colonIndex).toUpperCase();
        }

        const value = line.slice(colonIndex + 1);
        return [property, value];
    }

    private parseEventProperty(
        event: Partial<IcsEvent>,
        property: string,
        value: string,
        fullLine: string
    ): void {
        const handler = IcsParserPlugin.PROPERTY_HANDLERS.get(property);
        if (handler) {
            handler(event, value, fullLine);
        } else if (property.charCodeAt(0) === 88 && property.charCodeAt(1) === 45) {
            if (!event.customProperties) {
                event.customProperties = {};
            }
            event.customProperties[property] = value;
        }
    }

    private static parseDateTime(
        value: string,
        fullLine: string
    ): { date: Date; allDay?: boolean } {
        const isAllDay = fullLine.indexOf("VALUE=DATE") !== -1;

        let dateStr = value;
        const tzidIndex = dateStr.indexOf("TZID=");
        if (tzidIndex !== -1) {
            const colonIndex = dateStr.lastIndexOf(":");
            if (colonIndex !== -1) {
                dateStr = dateStr.slice(colonIndex + 1);
            }
        }

        const isUtc = dateStr.charCodeAt(dateStr.length - 1) === 90;
        if (isUtc) {
            dateStr = dateStr.slice(0, -1);
        }

        const dateStrLen = dateStr.length;
        let date: Date;

        if (isAllDay || dateStrLen === 8) {
            const year = this.parseIntFromString(dateStr, 0, 4);
            const month = this.parseIntFromString(dateStr, 4, 2) - 1;
            const day = this.parseIntFromString(dateStr, 6, 2);
            date = new Date(year, month, day);
        } else {
            const year = this.parseIntFromString(dateStr, 0, 4);
            const month = this.parseIntFromString(dateStr, 4, 2) - 1;
            const day = this.parseIntFromString(dateStr, 6, 2);
            const hour = this.parseIntFromString(dateStr, 9, 2);
            const minute = this.parseIntFromString(dateStr, 11, 2);
            const second = dateStrLen >= 15 ? this.parseIntFromString(dateStr, 13, 2) : 0;

            if (isUtc) {
                date = new Date(Date.UTC(year, month, day, hour, minute, second));
            } else {
                date = new Date(year, month, day, hour, minute, second);
            }
        }

        return { date, allDay: isAllDay };
    }

    private static parseIntFromString(str: string, start: number, length: number): number {
        let result = 0;
        const end = start + length;
        for (let i = start; i < end && i < str.length; i++) {
            const digit = str.charCodeAt(i) - 48;
            if (digit >= 0 && digit <= 9) {
                result = result * 10 + digit;
            }
        }
        return result;
    }

    private static parseOrganizer(
        value: string,
        fullLine: string
    ): { name?: string; email?: string } {
        const organizer: { name?: string; email?: string } = {};

        if (value.charCodeAt(0) === 77 && value.startsWith("MAILTO:")) {
            organizer.email = value.slice(7);
        }

        const cnMatch = fullLine.match(this.CN_REGEX);
        if (cnMatch) {
            organizer.name = this.unescapeText(cnMatch[1]);
        }

        return organizer;
    }

    private static parseAttendee(
        value: string,
        fullLine: string
    ): { name?: string; email?: string; role?: string; status?: string } {
        const attendee: {
            name?: string;
            email?: string;
            role?: string;
            status?: string;
        } = {};

        if (value.charCodeAt(0) === 77 && value.startsWith("MAILTO:")) {
            attendee.email = value.slice(7);
        }

        const cnMatch = fullLine.match(this.CN_REGEX);
        if (cnMatch) {
            attendee.name = this.unescapeText(cnMatch[1]);
        }

        const roleMatch = fullLine.match(this.ROLE_REGEX);
        if (roleMatch) {
            attendee.role = roleMatch[1];
        }

        const statusMatch = fullLine.match(this.PARTSTAT_REGEX);
        if (statusMatch) {
            attendee.status = statusMatch[1];
        }

        return attendee;
    }

    private static unescapeText(text: string): string {
        if (text.indexOf('\\') === -1) {
            return text;
        }

        return text
            .replace(/\\n/g, "\n")
            .replace(/\\,/g, ",")
            .replace(/\\;/g, ";")
            .replace(/\\\\/g, "\\");
    }

    private finalizeEvent(event: Partial<IcsEvent>): IcsEvent | null {
        if (!event.uid || !event.summary || !event.dtstart) {
            return null;
        }

        const finalEvent: IcsEvent = {
            uid: event.uid,
            summary: event.summary,
            dtstart: event.dtstart,
            allDay: event.allDay ?? false,
            source: event.source!,
            description: event.description,
            dtend: event.dtend,
            location: event.location,
            categories: event.categories,
            status: event.status,
            rrule: event.rrule,
            exdate: event.exdate,
            created: event.created,
            lastModified: event.lastModified,
            priority: event.priority,
            transp: event.transp,
            organizer: event.organizer,
            attendees: event.attendees,
            customProperties: event.customProperties,
        };

        return finalEvent;
    }

    private generateCacheKey(context: ParseContext): string {
        return `ics:${context.filePath}:${context.mtime || 0}`;
    }

    private isCacheValid(cached: PluginIcsParseResult, context: ParseContext): boolean {
        return cached.filePath === context.filePath && 
               cached.parseTime !== undefined;
    }

    private invalidateCache(filePath: string): void {
        this.cacheManager.invalidateByPath(filePath, CacheType.ICS_EVENTS);
    }

    private async waitForSlot(): Promise<void> {
        return new Promise<void>((resolve) => {
            const checkSlot = () => {
                if (this.activeParses < this.maxConcurrentParses) {
                    resolve();
                } else {
                    setTimeout(checkSlot, 10);
                }
            };
            checkSlot();
        });
    }

    private updateStatistics(stats: Partial<ParsingStatistics & { eventsFound?: number }>): void {
        this.statistics = {
            ...this.statistics,
            ...stats,
            cacheHits: (this.statistics.cacheHits || 0) + (stats.cacheHits || 0),
            cacheMisses: (this.statistics.cacheMisses || 0) + (stats.cacheMisses || 0),
            errors: (this.statistics.errors || 0) + (stats.errors || 0),
            parseTime: (this.statistics.parseTime || 0) + (stats.parseTime || 0)
        };
    }

    public clearCache(): void {
        this.cacheManager.invalidateByPattern('ics:', CacheType.ICS_EVENTS);
    }

    public getCacheStats(): { entries: number } {
        return {
            entries: this.parseQueue.size
        };
    }
}